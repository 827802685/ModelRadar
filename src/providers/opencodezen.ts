import type { FreeModel } from '../types.js';

const ENDPOINT = 'https://opencode.ai/zen/v1/models';
const CHAT_BASE = 'https://opencode.ai/zen/v1';

// OpenCode Zen marks its limited-time free models with a `-free` suffix.
// `big-pickle` is a stealth model the pricing page lists as Free too.
const FREE_SUFFIX = /-free$/i;

interface ZenModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export class OpencodeZenScraper {
  name = 'opencodezen';

  async scrape(_apiKey?: string): Promise<FreeModel[]> {
    const resp = await fetch(ENDPOINT);
    if (!resp.ok) throw new Error(`OpenCode Zen models API ${resp.status}`);

    const data = (await resp.json()) as { data?: ZenModel[] };
    const now = new Date().toISOString();

    return (data.data ?? [])
      .filter((m) => FREE_SUFFIX.test(m.id) || m.id === 'big-pickle')
      .map((m) => ({
        model_name: m.id,
        provider: 'opencodezen' as const,
        base_url: CHAT_BASE,
        free_type: 'trial' as const,
        free_quota: '限时免费(OpenCode Zen 定价页标注 Free)',
        rate_limit: 'platform_default',
        refresh_cycle: 'daily' as const,
        expire_days: null,
        context_length: null,
        capabilities: ['chat'] as string[],
        source_url: 'https://opencode.ai/docs/zen/',
        detected_at: now,
        status: 'active' as const,
      }));
  }
}
