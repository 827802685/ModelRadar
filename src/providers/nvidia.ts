import type { FreeModel } from '../types.js';

// NVIDIA NIM catalog. The /v1/models endpoint is public; the Nemotron family
// is offered free for prototyping on build.nvidia.com.
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/models';

interface NvidiaModel {
  id: string;
  owned_by?: string;
}

export class NvidiaScraper {
  name = 'nvidia';

  async scrape(): Promise<FreeModel[]> {
    const resp = await fetch(ENDPOINT, { headers: { accept: 'application/json' } });
    if (!resp.ok) throw new Error(`NVIDIA API ${resp.status}`);

    const data = (await resp.json()) as { data?: NvidiaModel[] };
    const now = new Date().toISOString();

    return (data.data ?? [])
      .filter((m) => /nemotron/i.test(m.id))
      .map((m) => ({
        model_name: m.id,
        provider: 'nvidia' as const,
        base_url: 'https://integrate.api.nvidia.com/v1',
        free_type: 'unlimited' as const,
        free_quota: 'free_for_prototyping',
        rate_limit: 'rate_limited',
        refresh_cycle: 'none' as const,
        expire_days: null,
        context_length: null,
        capabilities: ['chat'] as string[],
        source_url: 'https://build.nvidia.com',
        detected_at: now,
        status: 'active' as const,
      }));
  }
}