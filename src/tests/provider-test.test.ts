import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testProvider, providerInfos } from '../provider-test.js';

type FetchHandler = (
  input: string | URL | Request,
  init?: RequestInit,
) => Response | Promise<Response>;

function mockFetch(handler: FetchHandler): void {
  const g = globalThis as { fetch?: typeof fetch };
  g.fetch = (async (input, init) => handler(input as string | URL | Request, init)) as typeof fetch;
}

// Scraper listing endpoint + chat probe for the "nvidia" provider.
const NVIDIA_CHAT = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_LIST = 'https://integrate.api.nvidia.com/v1/models';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('providerInfos lists supported providers and flags openai-compat', () => {
  const infos = providerInfos();
  assert.ok(infos.some((p) => p.name === 'nvidia' && p.openaiCompatible));
  assert.ok(infos.some((p) => p.name === 'google' && !p.openaiCompatible));
  assert.ok(infos.some((p) => p.name === 'opencodezen' && !p.needsKey));
});

test('rejects an unsupported provider', async () => {
  const r = await testProvider('made-up-provider', 'sk-x');
  assert.equal(r.ok, false);
  assert.match(r.message!, /不支持的供应商/);
});

test('requires a key for providers that need one', async () => {
  const r = await testProvider('nvidia', '');
  assert.equal(r.ok, false);
  assert.match(r.message!, /需要 API Key/);
});

test('reports an invalid key from the listing stage', async () => {
  mockFetch(async (input) => {
    if (String(input).startsWith(NVIDIA_LIST)) {
      return new Response('unauthorized', { status: 401 });
    }
    return jsonResponse({});
  });
  const r = await testProvider('nvidia', 'bad-key');
  assert.equal(r.ok, false);
  assert.match(r.message!, /Key 无效/);
});

test('valid key: listing + chat probe succeed', async () => {
  mockFetch(async (input) => {
    const url = String(input);
    if (url.startsWith(NVIDIA_LIST)) {
      return jsonResponse({
        data: [
          { id: 'nvidia/nemotron-4-340b-instruct', owned_by: 'nvidia' },
          { id: 'nvidia/nv-embedqa-mistral-7b-v2', owned_by: 'nvidia' },
        ],
      });
    }
    if (url.startsWith(`${NVIDIA_CHAT}/chat/completions`)) {
      return jsonResponse({ choices: [{ message: { content: 'ping' } }] });
    }
    return jsonResponse({}, 404);
  });
  const r = await testProvider('nvidia', 'sk-good');
  assert.equal(r.ok, true);
  // The embedding model is excluded by the availability probe, so 1 usable chat model.
  assert.equal(r.model_count, 1);
  assert.match(r.message!, /chat 探测成功/);
});

test('public listing but invalid key is caught by chat probe', async () => {
  mockFetch(async (input) => {
    const url = String(input);
    if (url.startsWith(NVIDIA_LIST)) {
      return jsonResponse({ data: [{ id: 'google/gemma-3-4b-it' }] });
    }
    if (url.startsWith(`${NVIDIA_CHAT}/chat/completions`)) {
      return new Response('Forbidden', { status: 403 });
    }
    return jsonResponse({}, 404);
  });
  const r = await testProvider('nvidia', 'sk-expired');
  assert.equal(r.ok, false);
  assert.equal(r.model_count, 1);
  assert.match(r.message!, /鉴权失败/);
});

test('falls back from a failing default probe to a working scraped model', async () => {
  mockFetch(async (input, init) => {
    const url = String(input);
    if (url.startsWith(NVIDIA_LIST)) {
      return jsonResponse({ data: [{ id: 'nvidia/nemotron-4-340b-instruct' }] });
    }
    if (url.startsWith(`${NVIDIA_CHAT}/chat/completions`)) {
      // First try (the default "deepseek-ai/deepseek-v4-flash-0731") is denied
      // by a non-auth error; the scraped nemotron model then works.
      const body = JSON.parse(String(init?.body)) as { model?: string };
      if (body.model === 'nvidia/nemotron-4-340b-instruct') {
        return jsonResponse({ choices: [{ message: { content: 'ping' } }] });
      }
      return new Response('Model not found', { status: 400 });
    }
    return jsonResponse({}, 404);
  });
  const r = await testProvider('nvidia', 'sk-good');
  assert.equal(r.ok, true);
  assert.equal(r.tested_model, 'nvidia/nemotron-4-340b-instruct');
  assert.match(r.message!, /chat 探测成功/);
});

test('non-auth errors on every candidate report ok with a warning, not a failure', async () => {
  mockFetch(async (input) => {
    const url = String(input);
    if (url.startsWith(NVIDIA_LIST)) {
      return jsonResponse({ data: [{ id: 'nvidia/nemotron-4-340b-instruct' }] });
    }
    if (url.startsWith(`${NVIDIA_CHAT}/chat/completions`)) {
      // 429 rate limit is a service-level error, not an invalid key.
      return new Response('Rate limited', { status: 429 });
    }
    return jsonResponse({}, 404);
  });
  const r = await testProvider('nvidia', 'sk-good');
  assert.equal(r.ok, true);
  assert.equal(r.model_count, 1);
  assert.match(r.message!, /chat 探测均被拒/);
  assert.match(r.error!, /429/);
});

test('no-key provider probes without an Authorization header', async () => {
  const ZEN = 'https://opencode.ai/zen/v1';
  let authHeaderSeen: string | undefined;
  mockFetch(async (input, init) => {
    const url = String(input);
    if (url.startsWith(`${ZEN}/models`)) {
      // Must match the scraper's `-free` suffix filter.
      return jsonResponse({ data: [{ id: 'opencodezen/claude-free' }] });
    }
    if (url.startsWith(`${ZEN}/chat/completions`)) {
      authHeaderSeen = (init?.headers as Record<string, string> | undefined)?.authorization;
      return jsonResponse({ choices: [{ message: { content: 'ping' } }] });
    }
    return jsonResponse({}, 404);
  });
  const r = await testProvider('opencodezen', '');
  assert.equal(r.ok, true);
  assert.match(r.message!, /chat 探测成功/);
  assert.equal(authHeaderSeen, undefined);
});