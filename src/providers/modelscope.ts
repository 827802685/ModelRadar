import type { FreeModel } from '../types.js';

// ModelScope exposes its free API-Inference catalog through the OpenAI
// compatible endpoint. Without a token it still returns the public list; a
// token (ms-...) lets us see private/restricted models too.
const ENDPOINT = 'https://api-inference.modelscope.cn/v1/models';

interface MsModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export class ModelScopeScraper {
  name = 'modelscope';

  async scrape(apiKey?: string): Promise<FreeModel[]> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const resp = await fetch(ENDPOINT, { headers });
    if (!resp.ok) throw new Error(`ModelScope API ${resp.status}`);

    const data = (await resp.json()) as { data?: MsModel[] };
    const now = new Date().toISOString();
    const seen = new Set<string>();

    return (data.data ?? [])
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .map((m) => ({
        model_name: m.id,
        provider: 'modelscope' as const,
        base_url: 'https://api-inference.modelscope.cn/v1',
        free_type: 'unlimited' as const,
        free_quota: '2000次/天（全平台），单模型200次/天',
        rate_limit: '200 req/day per model',
        refresh_cycle: 'daily' as const,
        expire_days: null,
        context_length: null,
        capabilities: ['chat'] as string[],
        source_url: 'https://modelscope.cn/models',
        detected_at: now,
        status: 'active' as const,
      }));
  }
}