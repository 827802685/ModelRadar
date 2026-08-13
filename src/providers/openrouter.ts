import type { FreeModel } from '../types.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/models';

interface OpenRouterModel {
  id: string;
  context_length?: number | null;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: { context_length?: number | null };
  pricing?: { prompt?: string; completion?: string };
}

export class OpenRouterScraper {
  name = 'openrouter';

  async scrape(): Promise<FreeModel[]> {
    const resp = await fetch(OPENROUTER_ENDPOINT, {
      headers: { accept: 'application/json' },
    });
    if (!resp.ok) throw new Error(`OpenRouter API ${resp.status}`);

    const data = (await resp.json()) as { data?: OpenRouterModel[] };
    const models = data.data ?? [];

    const now = new Date().toISOString();
    return models
      .filter((m) => m.id.includes(':free'))
      .map((m) => ({
        model_name: m.id,
        provider: 'openrouter' as const,
        base_url: 'https://openrouter.ai/api/v1',
        free_type: 'unlimited' as const,
        free_quota: 'unlimited_with_rate_limit',
        rate_limit: 'varies, see openrouter.ai/models',
        refresh_cycle: 'none' as const,
        expire_days: null,
        context_length:
          m.context_length ?? m.top_provider?.context_length ?? null,
        capabilities: extractCapabilities(m),
        source_url: `https://openrouter.ai/models/${m.id}`,
        detected_at: now,
        status: 'active' as const,
      }));
  }
}

function extractCapabilities(m: OpenRouterModel): string[] {
  const caps: string[] = ['chat'];
  const inputs = m.architecture?.input_modalities ?? [];
  const modality = m.architecture?.modality ?? '';
  if (inputs.includes('image') || modality.includes('image')) caps.push('vision');
  if (inputs.includes('audio') || modality.includes('audio')) caps.push('audio');
  return caps;
}