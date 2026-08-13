import type { FreeModel } from '../types.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GoogleModel {
  name: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  description?: string;
  displayName?: string;
}

export class GoogleScraper {
  name = 'google';

  async scrape(apiKey?: string): Promise<FreeModel[]> {
    if (!apiKey) {
      // No key -> no list available; avoid flagging all models as removed.
      return [];
    }

    const url = new URL(ENDPOINT);
    url.searchParams.set('key', apiKey);

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Google Generative Language API ${resp.status}`);

    const data = (await resp.json()) as { models?: GoogleModel[] };
    const now = new Date().toISOString();

    return (data.models ?? [])
      .filter(
        (m) =>
          /flash/i.test(m.name) &&
          m.supportedGenerationMethods?.includes('generateContent')
      )
      .map((m) => ({
        model_name: m.name.replace('models/', ''),
        provider: 'google' as const,
        base_url: 'https://generativelanguage.googleapis.com/v1beta',
        free_type: 'unlimited' as const,
        free_quota: 'free_with_rate_limit',
        rate_limit: '15 req/min (tier 1)',
        refresh_cycle: 'none' as const,
        expire_days: null,
        context_length: m.inputTokenLimit ?? null,
        capabilities: extractCapabilities(m),
        source_url: 'https://aistudio.google.com/pricing',
        detected_at: now,
        status: 'active' as const,
      }));
  }
}

function extractCapabilities(m: GoogleModel): string[] {
  const caps: string[] = ['chat'];
  const text = `${m.displayName ?? ''} ${m.description ?? ''}`.toLowerCase();
  if (text.includes('vision') || text.includes('multimodal')) caps.push('vision');
  return caps;
}