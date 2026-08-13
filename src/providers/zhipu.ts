import type { FreeModel } from '../types.js';

// Zhipu's /models endpoint intentionally omits the free "Flash" family
// (GLM-4-Flash and later). Keep a curated baseline so discovery works even
// without an API key; when ZHIPU_API_KEY is provided we merge any additional
// free-tagged / flash models the API still exposes.
const FREE_FLASH_BASELINE = [
  'glm-4-flash',
  'glm-4v-flash',
  'glm-4.5-flash',
  'glm-4.5v-flash',
  'glm-4.6-flash',
  'glm-4.6v-flash',
  'glm-4.7-flash',
  'glm-4.7v-flash',
  'glm-5-flash',
  'glm-5v-flash',
];

const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

export class ZhipuScraper {
  name = 'zhipu';

  async scrape(apiKey?: string): Promise<FreeModel[]> {
    const baseline = FREE_FLASH_BASELINE.map((id) =>
      this.toModel(id, new Date().toISOString())
    );

    if (!apiKey) return baseline;

    try {
      const resp = await fetch(`${ZHIPU_BASE_URL}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) return baseline;

      const data = (await resp.json()) as { data?: { id: string }[] };
      const now = new Date().toISOString();
      const extra = (data.data ?? [])
        .filter((m) => /flash|free/i.test(m.id))
        .filter((m) => !baseline.some((b) => b.model_name === m.id))
        .map((m) => this.toModel(m.id, now));

      return [...baseline, ...extra];
    } catch {
      return baseline;
    }
  }

  private toModel(modelName: string, now: string): FreeModel {
    const isVision = /v(-|_)flash|v$/i.test(modelName);
    return {
      model_name: modelName,
      provider: 'zhipu',
      base_url: `${ZHIPU_BASE_URL}`,
      free_type: 'unlimited',
      free_quota: 'free_unlimited',
      rate_limit: 'rate_limited',
      refresh_cycle: 'none',
      expire_days: null,
      context_length: null,
      capabilities: isVision ? ['chat', 'vision'] : ['chat'],
      source_url: 'https://docs.bigmodel.cn/cn/guide/models/free',
      detected_at: now,
      status: 'active',
    };
  }
}