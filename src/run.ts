import type { FreeModel } from './types.js';
import type { ProviderScraper, ApiKeys, RunSummary, DiffResult } from './types.js';
import type { Store } from './store.js';
import { diffModels } from './diff.js';
import { sendNotification } from './notify.js';
import { classifyAll, type WorkersAiLike } from './classify.js';
import { OpenRouterScraper } from './providers/openrouter.js';
import { ZhipuScraper } from './providers/zhipu.js';
import { ModelScopeScraper } from './providers/modelscope.js';
import { GoogleScraper } from './providers/google.js';
import { NvidiaScraper } from './providers/nvidia.js';
import { OpencodeZenScraper } from './providers/opencodezen.js';
import { SiliconFlowScraper } from './providers/siliconflow.js';
import { AgnesScraper } from './providers/agnes.js';

export interface SyncOptions {
  store: Store;
  apiKeys?: ApiKeys;
  webhookUrl?: string;
  scrapers?: ProviderScraper[];
  retentionDays?: number;
  /** Optional Workers AI binding used to refine model classification. */
  ai?: WorkersAiLike;
}

const DEFAULT_SCRAPERS = [
  new OpenRouterScraper(),
  new ZhipuScraper(),
  new ModelScopeScraper(),
  new GoogleScraper(),
  new NvidiaScraper(),
  new OpencodeZenScraper(),
  new AgnesScraper(),
];

function keyFor(scraperName: string): keyof ApiKeys {
  switch (scraperName) {
    case 'openrouter': return 'OPENROUTER_API_KEY';
    case 'zhipu': return 'ZHIPU_API_KEY';
    case 'modelscope': return 'MODELSCOPE_API_KEY';
    case 'google': return 'GOOGLE_API_KEY';
    case 'nvidia': return 'NVIDIA_API_KEY';
    case 'siliconflow': return 'SILICONFLOW_API_KEY';
    case 'agnes': return 'AGNES_API_KEY';
    default: return 'OPENROUTER_API_KEY';
  }
}

export async function runSync(opts: SyncOptions): Promise<RunSummary> {
  const { store, webhookUrl } = opts;
  const apiKeys = opts.apiKeys ?? {};

  const scrapers: ProviderScraper[] = opts.scrapers ?? [
    ...DEFAULT_SCRAPERS,
    new SiliconFlowScraper(),
  ];

  const scrapedModels: FreeModel[] = [];
  const providerErrors: Record<string, string> = {};
  const liveProviders: string[] = [];

  const results = await Promise.all(
    scrapers.map(async (scraper) => {
      try {
        const key = apiKeys[keyFor(scraper.name)];
        const models = await scraper.scrape(key);
        return { ok: true as const, scraper, models };
      } catch (err) {
        return { ok: false as const, scraper, err };
      }
    })
  );

  for (const result of results) {
    if (result.ok) {
      scrapedModels.push(...result.models);
      liveProviders.push(result.scraper.name);
      console.log(`[${result.scraper.name}] scraped ${result.models.length} free models`);
    } else {
      const msg = result.err instanceof Error ? result.err.message : String(result.err);
      providerErrors[result.scraper.name] = msg;
      console.error(`[${result.scraper.name}] scrape failed: ${msg}`, result.err);
    }
  }

  const existing = await store.getExisting();

  const allModels = await classifyAll(scrapedModels, opts.ai);
  const diff: DiffResult = diffModels(existing, allModels, liveProviders);

  const adminOffline = await store.getAdminOfflineKeys();
  const notOverridden = (m: FreeModel) =>
    !adminOffline.has(`${m.provider}:${m.model_name}`);

  if (diff.added.length > 0) await store.upsert(diff.added.filter(notOverridden));
  if (diff.changed.length > 0) await store.upsert(diff.changed.filter(notOverridden));
  if (diff.removed.length > 0) await store.markRemoved(diff.removed);

  const retentionDays = opts.retentionDays ?? 60;
  if (store.pruneOld) await store.pruneOld(retentionDays);

  const summary: RunSummary = {
    ran_at: new Date().toISOString(),
    providers_scraped: liveProviders,
    provider_errors: providerErrors,
    total_scraped: allModels.length,
    added: diff.added.length,
    removed: diff.removed.length,
    changed: diff.changed.length,
    added_models: diff.added.map((m) => `${m.provider}:${m.model_name}`),
    removed_models: diff.removed.map((m) => `${m.provider}:${m.model_name}`),
    changed_models: diff.changed.map((m) => `${m.provider}:${m.model_name}`),
  };

  if (diff.added.length + diff.removed.length + diff.changed.length > 0) {
    try {
      await sendNotification({ webhookUrl, diff, summary });
    } catch (err) {
      console.error('[notify] failed:', err);
    }
  }

  if (store.recordRun) await store.recordRun(summary);

  return summary;
}