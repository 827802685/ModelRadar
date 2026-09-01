import type { FreeModel, ProviderScraper } from './types.js';
import { OpenRouterScraper } from './providers/openrouter.js';
import { ZhipuScraper } from './providers/zhipu.js';
import { ModelScopeScraper } from './providers/modelscope.js';
import { GoogleScraper } from './providers/google.js';
import { NvidiaScraper } from './providers/nvidia.js';
import { SiliconFlowScraper } from './providers/siliconflow.js';
import { AgnesScraper } from './providers/agnes.js';
import { OpencodeZenScraper } from './providers/opencodezen.js';

/**
 * Provider key/connectivity tester.
 *
 * Lets an admin paste a provider's API key and verify it actually works
 * before wiring it into the deployment. The flow is:
 *   1. run the provider's scraper with the key (proves auth + reachability,
 *      and yields the live model list);
 *   2. for OpenAI-compatible providers, issue a 1-token chat completion with a
 *      real model so a public listing cannot mask an invalid key.
 * The key is never persisted anywhere.
 */

export interface ProviderInfo {
  name: string;
  /** Provider serves an OpenAI-compatible /chat/completions endpoint. */
  openaiCompatible: boolean;
  /** Whether a key is generally required to use the provider. */
  needsKey: boolean;
}

export interface ProviderTestResult {
  provider: string;
  ok: boolean;
  message: string;
  model_count?: number;
  tested_model?: string;
  latency_ms?: number;
  error?: string;
}

const SCRAPERS: Record<string, () => ProviderScraper> = {
  openrouter: () => new OpenRouterScraper(),
  zhipu: () => new ZhipuScraper(),
  modelscope: () => new ModelScopeScraper(),
  google: () => new GoogleScraper(),
  nvidia: () => new NvidiaScraper(),
  siliconflow: () => new SiliconFlowScraper(),
  agnes: () => new AgnesScraper(),
  opencodezen: () => new OpencodeZenScraper(),
};

// OpenAI-compatible chat base URLs (providers in this map get a live
// /chat/completions probe; Google uses the Gemini API and is probed
// separately via its native generateContent endpoint).
const CHAT_BASE: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  modelscope: 'https://api-inference.modelscope.cn/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  agnes: 'https://apihub.agnes-ai.com/v1',
  opencodezen: 'https://opencode.ai/zen/v1',
};

const PROBE_TIMEOUT_MS = 25_000;
// A stable, usually-free chat model per provider, tried first so a weird or
// paid first-listed model cannot cause a false failure.
// Stable, usually-free chat model(s) per provider for the probe, tried before
// the scraped list so a weird first-listed model cannot cause a false failure.
// NVIDIA's directory advertises many models that are not actually served on the
// free chat endpoint, so a few verified-working chat models are tried first.
const PROBE_MODELS: Record<string, string[]> = {
  openrouter: ['meta-llama/llama-3.1-8b-instruct:free'],
  zhipu: ['glm-4-flash'],
  modelscope: ['Qwen/Qwen2.5-7B-Instruct'],
  google: ['gemini-2.5-flash', 'gemini-2.0-flash'],
  nvidia: [
    'google/gemma-4-31b-it',
    'openai/gpt-oss-20b',
    'meta/llama-3.2-11b-vision-instruct',
    'nvidia/nemotron-3-super-120b-a12b',
    'nvidia/nemotron-3.5-lightning-30b-a3b',
  ],
  siliconflow: ['Qwen/Qwen2.5-7B-Instruct'],
  agnes: ['agnes-2.5-flash'],
  opencodezen: [], // no key; rely on scraped candidates
};

export function providerInfos(): ProviderInfo[] {
  return Object.keys(SCRAPERS).map((name) => ({
    name,
    openaiCompatible: Boolean(CHAT_BASE[name]),
    needsKey: name !== 'opencodezen',
  }));
}

function isChatModel(m: FreeModel): boolean {
  const caps = (m.capabilities ?? []).map((c) => c.toLowerCase());
  return caps.includes('chat') && !caps.includes('embedding');
}

/** Stable default first, then scraped conversational models, deduped. */
function chatCandidates(name: string, models: FreeModel[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const enqueue = (id: string | undefined | null) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const id of PROBE_MODELS[name] ?? []) enqueue(id);
  for (const m of models) if (isChatModel(m)) enqueue(m.model_name);
  return out.slice(0, 10);
}

type ProbeKind = 'ok' | 'auth' | 'other';

interface ProbeResult {
  kind: ProbeKind;
  ok: boolean;
  message: string;
  latency_ms: number;
  error?: string;
}

async function probeChat(baseUrl: string, model: string, key: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    // Only send auth when a key is present (some providers need no key).
    if (key) headers.authorization = `Bearer ${key}`;
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
    const latency = Date.now() - startedAt;
    if (resp.ok) {
      return { kind: 'ok', ok: true, message: `chat 探测成功(${latency}ms)`, latency_ms: latency };
    }
    const status = resp.status;
    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        ok: false,
        message: `鉴权失败(HTTP ${status})`,
        latency_ms: latency,
        error: `HTTP ${status}`,
      };
    }
    // Non-auth errors are model/service level, not proof the key is invalid.
    return {
      kind: 'other',
      ok: false,
      message: `chat 探测被拒(HTTP ${status})`,
      latency_ms: latency,
      error: `HTTP ${status}`,
    };
  } catch (err) {
    const latency = Date.now() - startedAt;
    const aborted = err instanceof Error && err.name === 'AbortError';
    const detail = aborted ? '请求超时' : `请求异常: ${err instanceof Error ? err.message : String(err)}`;
    return {
      kind: 'other',
      ok: false,
      message: detail,
      latency_ms: latency,
      error: aborted ? 'timeout' : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function latencyOf(startedAt: number): number {
  return Date.now() - startedAt;
}

/** Google-only: probe via the native Gemini generateContent endpoint. */
async function probeGemini(apiKey: string, model: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
    url.searchParams.set('key', apiKey);
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
    if (resp.ok) {
      return { kind: 'ok', ok: true, message: `Gemini 探测成功(${latency}ms)`, latency_ms: latency };
    }
    const status = resp.status;
    if (status === 401 || status === 403 || status === 400
        || /(API_KEY_INVALID|PERMISSION_DENIED|API key not valid)/i.test(await resp.clone().text())) {
      return { kind: 'auth', ok: false, message: `Key 无效或鉴权失败(HTTP ${status})`, latency_ms: latency, error: `HTTP ${status}` };
    }
    if (status === 429) {
      return { kind: 'other', ok: false, message: `限流(HTTP 429)`, latency_ms: latency, error: `HTTP 429` };
    }
    return { kind: 'other', ok: false, message: `探测被拒(HTTP ${status})`, latency_ms: latency, error: `HTTP ${status}` };
  } catch (err) {
    const latency = Date.now() - startedAt;
    const aborted = err instanceof Error && err.name === 'AbortError';
    const detail = aborted ? '请求超时' : `请求异常: ${err instanceof Error ? err.message : String(err)}`;
    return { kind: 'other', ok: false, message: detail, latency_ms: latency, error: aborted ? 'timeout' : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate a provider's API key and connectivity. Never stores the key.
 *
 * Only 401/403 prove the key is invalid; other probe errors (bad/unpayable
 * model, rate limit, timeout) are reported as a warning while still treating
 * the key as valid.
 */
export async function testProvider(provider: string, apiKey: string): Promise<ProviderTestResult> {
  const name = provider.trim().toLowerCase();
  const makeScraper = SCRAPERS[name];

  if (!makeScraper) {
    return {
      provider,
      ok: false,
      message: `不支持的供应商: ${provider}`,
      error: `unsupported provider ${provider}`,
    };
  }

  const key = apiKey.trim();
  const needsKey = name !== 'opencodezen';
  if (needsKey && !key) {
    return {
      provider,
      ok: false,
      message: `该供应商需要 API Key，请粘贴 Key 后再测试`,
      error: 'missing key',
    };
  }

  const startedAt = Date.now();

  // Stage 1: model listing / auth.
  let models: FreeModel[] = [];
  try {
    models = await makeScraper().scrape(key || undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuth = /unauthorized|invalid.*key|401|403/i.test(msg);
    return {
      provider,
      ok: false,
      message: isAuth ? `Key 无效或无权限: ${msg}` : `连接失败: ${msg}`,
      latency_ms: latencyOf(startedAt),
      error: msg,
    };
  }

  const listLatency = latencyOf(startedAt);

  // Stage 2: live chat probe. Google uses the native Gemini generateContent
  // endpoint; every other provider is OpenAI-compatible /chat/completions.
  if (name === 'google') {
    const gCandidates = chatCandidates('google', models);
    let lastOther: ProbeResult | null = null;
    for (const model of gCandidates) {
      const probe = await probeGemini(key, model);
      if (probe.kind === 'ok') {
        return {
          provider,
          ok: true,
          message: `连接正常，抓取到 ${models.length} 个 Gemini 模型；${probe.message}`,
          model_count: models.length,
          tested_model: model,
          latency_ms: latencyOf(startedAt),
        };
      }
      if (probe.kind === 'auth') {
        return {
          provider,
          ok: false,
          message: `抓取到 ${models.length} 个 Gemini 模型，但 Key 无效或鉴权失败(HTTP 401/403)`,
          model_count: models.length,
          tested_model: model,
          latency_ms: latencyOf(startedAt),
          error: probe.error,
        };
      }
      lastOther = probe;
    }
    if (lastOther) {
      return {
        provider,
        ok: true,
        message: `连接与 Key 鉴权正常，抓取到 ${models.length} 个 Gemini 模型；chat 探测被拒（多为免费配额或限流）：${lastOther.message}`,
        model_count: models.length,
        tested_model: gCandidates[0],
        latency_ms: latencyOf(startedAt),
        error: lastOther.error,
      };
    }
  }

  const baseUrl = CHAT_BASE[name];
  const candidates = chatCandidates(name, models);
  if (baseUrl && candidates.length > 0) {
    let lastOther: ProbeResult | null = null;
    for (const model of candidates) {
      const probe = await probeChat(baseUrl, model, key);
      if (probe.kind === 'ok') {
        return {
          provider,
          ok: true,
          message: `连接正常，抓取到 ${models.length} 个模型；${probe.message}`,
          model_count: models.length,
          tested_model: model,
          latency_ms: latencyOf(startedAt),
        };
      }
      if (probe.kind === 'auth') {
        return {
          provider,
          ok: false,
          message: `抓取到 ${models.length} 个模型，但 Key 无效或鉴权失败(HTTP 401/403)`,
          model_count: models.length,
          tested_model: model,
          latency_ms: latencyOf(startedAt),
          error: probe.error,
        };
      }
      lastOther = probe;
    }
    // Reached the API but no candidate actually answered: the key passed
    // auth, so report success with a warning rather than a false failure.
    if (lastOther) {
      return {
        provider,
        ok: true,
        message: `连接与 Key 鉴权正常，抓取到 ${models.length} 个模型；chat 探测均被拒（多为模型对当前 Key 无权限或限流）：${lastOther.message}`,
        model_count: models.length,
        tested_model: candidates[0],
        latency_ms: latencyOf(startedAt),
        error: lastOther.error,
      };
    }
  }

  if (models.length > 0) {
    return {
      provider,
      ok: true,
      message: `连接正常，抓取到 ${models.length} 个模型`,
      model_count: models.length,
      latency_ms: listLatency,
    };
  }

  // Some providers return an empty list when a listing is gated behind a key
  // that is missing; with a key this means nothing matched or it lapsed.
  return {
    provider,
    ok: true,
    message: `连接正常，但该 Key 未返回任何免费模型（可能已过期或未开放列表）`,
    model_count: 0,
    latency_ms: listLatency,
  };
}