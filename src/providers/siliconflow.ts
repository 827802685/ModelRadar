import type { FreeModel } from '../types.js';

const ENDPOINT = 'https://api.siliconflow.cn/v1/models';

// SiliconFlow marks permanently-free models with `free: true` in the models API.
const FREE_TYPE = 'monthly';

interface SfModel {
  id: string;
  free?: boolean;
  owned_by?: string;
}

export class SiliconFlowScraper {
  name = 'siliconflow';

  async scrape(apiKey?: string): Promise<FreeModel[]> {
    if (!apiKey) {
      // No key -> SiliconFlow rejects unauthenticated model listing.
      return [];
    }

    const resp = await fetch(ENDPOINT, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) throw new Error(`SiliconFlow API ${resp.status}`);

    const data = (await resp.json()) as { data?: SfModel[] };
    const now = new Date().toISOString();

    return (data.data ?? [])
      .filter((m) => m.free === true)
      .map((m) => ({
        model_name: m.id,
        provider: 'siliconflow' as const,
        base_url: 'https://api.siliconflow.cn/v1',
        free_type: FREE_TYPE,
        free_quota: '免费(平台限速内)，按月更新',
        rate_limit: 'platform_rate_limit',
        refresh_cycle: 'monthly' as const,
        expire_days: null,
        context_length: null,
        capabilities: ['chat'] as string[],
        source_url: 'https://siliconflow.cn/models',
        region: 'cn',
        detected_at: now,
        status: 'active' as const,
      }));
  }
}
