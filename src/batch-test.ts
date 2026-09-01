import type { ModelTestRow } from './types.js';

/**
 * Test-bench probing: for a set of pulled models, issue a 1-token chat
 * completion against each model's endpoint using the provider's saved key,
 * and classify the outcome. Runs concurrently so a whole catalog can be
 * swept in one pass while results stream to the UI.
 *
 * Most providers speak an OpenAI-compatible /chat/completions API. Google's
 * Gemini API (generativelanguage.googleapis.com) is NOT OpenAI-compatible and
 * uses a per-request `key` query param + `models/{id}:generateContent`, so it
 * is routed to a dedicated Gemini probe instead of being skipped.
 */

export type TestResultKind = 'ok' | 'auth' | 'unsupported' | 'rate_limit' | 'error' | 'skip';

export type ProbeProtocol = 'openai' | 'gemini';

export interface BatchTestItem {
  provider: string;
  model_name: string;
  base_url: string;
  /** Which wire protocol to probe with. OpenAI-compatible by default. */
  probe?: ProbeProtocol;
  /** Extra request headers merged into the probe call (e.g. OpenRouter). */
  headers?: Record<string, string>;
}

export interface ProbeOutcome {
  provider: string;
  model_name: string;
  kind: TestResultKind;
  ok: boolean;
  latency_ms: number;
  detail: string;
}

const PROBE_TIMEOUT_MS = 20_000;

function classifyStatus(status: number, bodySample: string): Pick<ProbeOutcome, 'kind' | 'ok' | 'detail'> {
  const sample = bodySample.slice(0, 160);
  if (status === 401 || status === 403) {
    return { kind: 'auth', ok: false, detail: `鉴权失败(HTTP ${status})` };
  }
  if (status === 402 || status === 429) {
    return { kind: 'rate_limit', ok: false, detail: `限流/额度不足(HTTP ${status}) ${sample}` };
  }
  if (status === 400 || status === 404 || status === 405 || status === 422) {
    // Model not served on this endpoint, or not usable with this key.
    return { kind: 'unsupported', ok: false, detail: `模型不可用(HTTP ${status}) ${sample}` };
  }
  return { kind: 'error', ok: false, detail: `服务错误(HTTP ${status}) ${sample}` };
}

async function probeOpenAi(
  baseUrl: string,
  model: string,
  key?: string,
  headers?: Record<string, string>
): Promise<ProbeOutcome> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const h: Record<string, string> = { 'content-type': 'application/json', ...(headers ?? {}) };
    if (key) h.authorization = `Bearer ${key}`;
    const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: h,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    const latency = Date.now() - startedAt;
    const body = await resp.text();
    if (resp.ok) {
      return {
        provider: '',
        model_name: model,
        kind: 'ok',
        ok: true,
        latency_ms: latency,
        detail: `可用(${latency}ms)`,
      };
    }
    const cls = classifyStatus(resp.status, body);
    return { provider: '', model_name: model, latency_ms: latency, ...cls };
  } catch (err) {
    const latency = Date.now() - startedAt;
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      provider: '',
      model_name: model,
      kind: 'error',
      ok: false,
      latency_ms: latency,
      detail: aborted ? '超时' : '请求异常',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google Gemini probe: POST models/{id}:generateContent with the key as a
 * query param. model ids contain a leading "models/" from the listings API in
 * some responses, so strip it before building the URL.
 */
async function probeGemini(baseUrl: string, model: string, key?: string): Promise<ProbeOutcome> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const id = model.replace(/^models\//, '');
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(id)}:generateContent`);
    if (key) url.searchParams.set('key', key);
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });
    const latency = Date.now() - startedAt;
    const body = await resp.text();
    if (resp.ok) {
      return {
        provider: '',
        model_name: model,
        kind: 'ok',
        ok: true,
        latency_ms: latency,
        detail: `可用(${latency}ms)`,
      };
    }
    const cls = classifyStatus(resp.status, body);
    return { provider: '', model_name: model, latency_ms: latency, ...cls };
  } catch (err) {
    const latency = Date.now() - startedAt;
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      provider: '',
      model_name: model,
      kind: 'error',
      ok: false,
      latency_ms: latency,
      detail: aborted ? '超时' : '请求异常',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run items concurrently, invoking `emit` with each outcome as it completes.
 * Returns aggregate counts. Items whose base_url is empty are emitted as
 * `skip` without a network call. Gemini providers use their own probe.
 */
export async function runBatchProbe(
  items: BatchTestItem[],
  keys: Record<string, string>,
  emit: (o: ProbeOutcome) => void,
  concurrency = 6
): Promise<{ total: number; passed: number; skipped: number }> {
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 6, 10));
  let next = 0;
  let passed = 0;
  let skipped = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      const it = items[i];
      if (!it) continue;
      if (!it.base_url) {
        skipped++;
        emit({
          provider: it.provider,
          model_name: it.model_name,
          kind: 'skip',
          ok: false,
          latency_ms: 0,
          detail: '无 base_url, 跳过',
        });
        continue;
      }
      let out: ProbeOutcome;
      try {
        out =
          it.probe === 'gemini'
            ? await probeGemini(it.base_url, it.model_name, keys[it.provider])
            : await probeOpenAi(it.base_url, it.model_name, keys[it.provider], it.headers);
      } catch (err) {
        out = {
          provider: '',
          model_name: it.model_name,
          kind: 'error',
          ok: false,
          latency_ms: 0,
          detail: `探测异常: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      out.provider = it.provider;
      if (out.ok) passed++;
      emit(out);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return { total: items.length, passed, skipped };
}

/** Flatten a ProbeOutcome into a primitive object for storage. */
export function toRow(o: ProbeOutcome): ModelTestRow {
  return {
    provider: o.provider,
    model_name: o.model_name,
    result: o.kind,
    latency_ms: o.latency_ms,
    detail: o.detail,
    tested_at: new Date().toISOString(),
  };
}