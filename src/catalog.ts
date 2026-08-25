import type { FreeModel } from './types.js';
import { CATEGORY_LABELS } from './classify.js';

/**
 * Relay-station friendly catalog export (OpenAI-compatible "channels" ingest).
 * Returned by GET /catalog and, in standalone mode, written to
 * state/catalog.json so a relay config can hot-reload.
 */
export function toRelayCatalog(models: FreeModel[]) {
  return models.map((m) => ({
    model: m.model_name,
    provider: m.provider,
    base_url: m.base_url,
    free_type: m.free_type,
    free_quota: m.free_quota,
    rate_limit: m.rate_limit,
    refresh_cycle: m.refresh_cycle,
    expire_days: m.expire_days,
    context_length: m.context_length,
    capabilities: m.capabilities,
    categories: m.categories ?? [],
    category_labels: (m.categories ?? []).map(
      (c) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c
    ),
    source_url: m.source_url,
    region: m.region ?? null,
  }));
}