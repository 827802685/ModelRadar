import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NvidiaScraper } from '../providers/nvidia.js';

const FREE_CATALOG = {
  object: 'list',
  data: [
    { id: 'nvidia/nemotron-4-340b-instruct', object: 'model', owned_by: 'nvidia' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b', object: 'model', owned_by: 'nvidia' },
    { id: 'meta/llama-3.2-90b-vision-instruct', object: 'model', owned_by: 'meta' },
    { id: 'nvidia/nv-embedqa-mistral-7b-v2', object: 'model', owned_by: 'nvidia' },
    { id: 'google/diffusiongemma-26b-a4b-it', object: 'model', owned_by: 'google' },
    { id: 'mistralai/codestral-22b-instruct-v0.1', object: 'model', owned_by: 'mistralai' },
    { id: 'nvidia/riva-translate-4b-instruct', object: 'model', owned_by: 'nvidia' },
    // Duplicate id should be deduped.
    { id: 'nvidia/nemotron-4-340b-instruct', object: 'model', owned_by: 'nvidia' },
  ],
};

function mockFetch(data: unknown): void {
  const g = globalThis as { fetch?: typeof fetch };
  g.fetch = (async () =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

test('nvidia scraper captures the full free catalog, not just nemotron', async () => {
  mockFetch(FREE_CATALOG);
  const models = await new NvidiaScraper().scrape();
  assert.equal(models.length, 7); // 8 entries - 1 duplicate

  const ids = models.map((m) => m.model_name);
  assert.ok(ids.includes('meta/llama-3.2-90b-vision-instruct'));
  assert.ok(ids.includes('google/diffusiongemma-26b-a4b-it'));
  assert.ok(ids.includes('mistralai/codestral-22b-instruct-v0.1'));

  const byId = new Map(models.map((m) => [m.model_name, m]));
  assert.deepEqual(byId.get('nvidia/nv-embedqa-mistral-7b-v2')?.capabilities, [
    'embedding',
  ]);
  assert.ok(
    byId.get('meta/llama-3.2-90b-vision-instruct')?.capabilities.includes('vision')
  );
  assert.ok(
    byId.get('google/diffusiongemma-26b-a4b-it')?.capabilities.includes('image')
  );
  assert.ok(
    byId.get('mistralai/codestral-22b-instruct-v0.1')?.capabilities.includes('code')
  );
  assert.ok(byId.get('nvidia/nemotron-4-340b-instruct')?.capabilities.includes('chat'));
  assert.ok(
    byId.get('nvidia/riva-translate-4b-instruct')?.capabilities.includes('chat')
  );

  // Quota / rate limit reflect the free tier.
  const any = models[0]!;
  assert.equal(any.free_type, 'unlimited');
  assert.match(any.rate_limit, /40 requests\/min/);
  assert.equal(any.base_url, 'https://integrate.api.nvidia.com/v1');
});

test('nvidia scraper throws on non-ok response', async () => {
  const g = globalThis as { fetch?: typeof fetch };
  g.fetch = (async () => new Response('err', { status: 503 })) as typeof fetch;
  await assert.rejects(() => new NvidiaScraper().scrape(), /NVIDIA API 503/);
});

function mockRoutes(handler: (url: string, init?: RequestInit) => Response): void {
  const g = globalThis as { fetch?: typeof fetch };
  g.fetch = (async (input, init) => handler(String(input), init)) as typeof fetch;
}

test('probe-responses are filtered to working models when a key is configured', async () => {
  const working = new Set([
    'meta/llama-3.2-90b-vision-instruct',
    'google/diffusiongemma-26b-a4b-it',
  ]);
  let authSeen = false;
  mockRoutes((url, init) => {
    if (url.includes('/models')) {
      return new Response(JSON.stringify(FREE_CATALOG), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/chat/completions')) {
      authSeen = String(((init?.headers as Record<string, string> | undefined)?.authorization ?? '')).startsWith('Bearer ');
      const model = (JSON.parse(String(init?.body ?? '')) as { model: string }).model;
      return working.has(model)
        ? new Response('{"choices":[]}', { status: 200 })
        : new Response('nf', { status: 404 });
    }
    return new Response('nf', { status: 404 });
  });

  const models = await new NvidiaScraper().scrape('nvapi-key');
  const ids = models.map((m) => m.model_name);
  const kept = new Set(ids);

  // Probes carry the key as a Bearer token.
  assert.ok(authSeen);
  // Only the two working conversational models survive the availability probe.
  assert.ok(kept.has('meta/llama-3.2-90b-vision-instruct'));
  assert.ok(kept.has('google/diffusiongemma-26b-a4b-it'));
  assert.ok(!kept.has('nvidia/nemotron-4-340b-instruct'));
  // The embedding model is excluded from probing and from the usable list.
  assert.ok(!ids.includes('nvidia/nv-embedqa-mistral-7b-v2'));
});

test('nvidia keeps the full list when the key is rejected (no catalog wipe)', async () => {
  mockRoutes((url) => {
    if (url.includes('/models')) {
      return new Response(JSON.stringify(FREE_CATALOG), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('unauthorized', { status: 401 });
  });
  const models = await new NvidiaScraper().scrape('bad-key');
  assert.equal(models.length, 7); // not wiped to zero
});