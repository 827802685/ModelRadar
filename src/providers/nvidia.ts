import type { FreeModel } from '../types.js';

// NVIDIA NIM free endpoints. The /v1/models catalog is public and lists every
// model exposed on build.nvidia.com with a "Free Endpoint". The free tier
// gives unlimited prototyping up to a rate limit (no per-token billing), so
// every id in the list is a free model - not just the Nemotron family.
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/models';
const CHAT_BASE = 'https://integrate.api.nvidia.com/v1';
const RATE_LIMIT = '40 requests/min (free tier, no per-token billing)';

// Availability probing: after listing, a configured key is used to verify each
// model actually answers a 1-token chat completion. The NVIDIA directory lists
// many models that are not served on the free chat endpoint (404), so without
// a key we cannot tell them apart.
const PROBE_TIMEOUT_MS = 12_000;
const PROBE_CONCURRENCY = 8;

// Embedding / retrieval models are not conversational.
const EMBED_RE = /embed(?:qa)?|bge|gte|nemoretriever|\bclip\b/i;
// Multimodal / vision-language models.
const VISION_RE = /vision|vlm|multimodal|cosmos|\bnclip\b|\bclip\b|deplot|kosmos|fuyu|neva|\bvila\b/i;
// Image / diffusion generators.
const IMAGE_RE = /diffusiongemma|\bmuse\b|stable-diffusion|sdxl|flux|t2i|i2i/i;
// Code-specialised models.
const CODE_RE = /code|coder|codestral|codellama|starcoder/i;
// Audio / speech models (ASR, TTS).
const AUDIO_RE = /whisper|tts|speech|voice|\basr\b/i;

interface NvidiaModel {
  id: string;
  owned_by?: string;
}

function capabilitiesOf(id: string): string[] {
  const low = id.toLowerCase();
  const caps: string[] = [];

  if (EMBED_RE.test(low)) caps.push('embedding');
  if (VISION_RE.test(low)) caps.push('vision');
  if (IMAGE_RE.test(low)) caps.push('image');
  if (CODE_RE.test(low)) caps.push('code');
  if (AUDIO_RE.test(low)) caps.push('audio');

  // Everything that is not an embedding/retrieval model is chat-usable.
  if (!caps.includes('embedding')) caps.push('chat');
  return caps;
}

interface ProbeOutcome {
  ok: boolean;
  auth: boolean;
}

async function probeAvailable(id: string, apiKey: string): Promise<ProbeOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${CHAT_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: id,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
    if (resp.status === 200) return { ok: true, auth: false };
    // Key rejected.
    if (resp.status === 401 || resp.status === 403) return { ok: false, auth: true };
    // Transient throttling / server error: keep the model.
    if (resp.status === 429 || resp.status >= 500) return { ok: true, auth: false };
    // 400/404/405... not served as a conversational chat endpoint here.
    return { ok: false, auth: false };
  } catch {
    // Network error / timeout: inconclusive, keep the model rather than drop it.
    return { ok: true, auth: false };
  } finally {
    clearTimeout(timer);
  }
}

export class NvidiaScraper {
  name = 'nvidia';

  async scrape(apiKey?: string): Promise<FreeModel[]> {
    const resp = await fetch(ENDPOINT, { headers: { accept: 'application/json' } });
    if (!resp.ok) throw new Error(`NVIDIA API ${resp.status}`);

    const data = (await resp.json()) as { data?: NvidiaModel[] };
    const now = new Date().toISOString();

    // NVIDIA exposes the full free-endpoint catalog; dedupe defensively.
    const seen = new Set<string>();
    const models: FreeModel[] = (data.data ?? [])
      .filter((m) => {
        if (!m.id || seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .map((m) => {
        const capabilities = capabilitiesOf(m.id);
        return {
          model_name: m.id,
          provider: 'nvidia' as const,
          base_url: CHAT_BASE,
          free_type: 'unlimited' as const,
          free_quota: 'free_for_prototyping',
          rate_limit: RATE_LIMIT,
          refresh_cycle: 'none' as const,
          expire_days: null,
          context_length: null,
          capabilities,
          source_url: `https://build.nvidia.com/${m.id}`,
          detected_at: now,
          status: 'active' as const,
        };
      });

    // Without a configured key we cannot verify availability, return the full list.
    if (!apiKey) return models;

    // Probe the conversational (non-embedding) models with the key and keep the
    // ones that actually answer, so the usable list is what gets catalogued.
    const toProbe = models.filter((m) => !m.capabilities.includes('embedding'));
    const outcomes = await Promise.all(
      toProbe.map((m) => probeAvailable(m.model_name, apiKey))
    );

    // If the key was rejected everywhere (401/403), trusting the probe would
    // wipe the whole catalog. Detect auth failures and keep the full list.
    if (outcomes.some((o) => o.auth)) {
      console.warn('[nvidia] availability probe: key rejected (401/403), skipping filter');
      return models;
    }

    const usable = new Set<string>();
    for (let i = 0; i < toProbe.length; i++) {
      if (outcomes[i]!.ok) usable.add(toProbe[i]!.model_name);
    }
    const filtered = models.filter((m) => usable.has(m.model_name));
    console.log(`[nvidia] availability probe: kept ${filtered.length}/${models.length} usable`);
    return filtered;
  }
}