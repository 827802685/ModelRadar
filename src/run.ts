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

// Validation function for testing model usability
async function validateModel(model: FreeModel, ai: WorkersAiLike): Promise<boolean> {
  if (!ai) return true; // If no AI binding, skip validation (assume scraper is correct)
  
  try {
    // Use a very simple prompt to minimize token usage
    const prompt = "Hello";
    const result = await ai.run(model.model_name, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1, // Just generate one token to verify the model works
    });
    
    // If we get any response back (even empty), the model is functional
    return result !== null && result !== undefined;
  } catch (err) {
    // If validation fails, log but don't fail the whole sync
    console.warn(`[Model Validation] Model ${model.provider}:${model.model_name} failed validation:`, err);
    return false;
  }
}

/**
 * Validate that a model is actually usable by performing a lightweight inference test.
 * This consumes a tiny amount of AI quota but ensures the model is not just listed but functional.
 */
async function validateModel(model: FreeModel, ai: WorkersAiLike): Promise<boolean> {
  if (!ai) return true; // If no AI binding, skip validation (assume scraper is correct)
  
  try {
    // Use a very simple prompt to minimize token usage
    const prompt = "Hello";
    const result = await ai.run(model.model_name, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1, // Just generate one token to verify the model works
    });
    
    // If we get any response back (even empty), the model is functional
    return result !== null && result !== undefined;
  } catch (err) {
    // If validation fails, log but don't fail the whole sync
    console.warn(`[Model Validation] Model ${model.provider}:${model.model_name} failed validation:`, err);
    return false;
  }
}

export interface SyncOptions {
  store: Store;
  apiKeys?: ApiKeys;
  webhookUrl?: string;
  scrapers?: ProviderScraper[];
  retentionDays?: number;
  /** Optional Workers AI binding used to refine model classification. */
  ai?: WorkersAiLike;
  /** Whether to validate new/changed models with a lightweight inference test */
  validateModels?: boolean;
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
   
   // Validate models if requested - filter out unusable models
   let validatedAllModels = allModels;
   if (opts.validateModels && opts.ai) {
     // Only validate models that are not in existing (to save on AI quota)
     const existingModelKeys = new Set(existing.map(m => `${m.provider}:${m.model_name}`));
     const modelsToValidate = allModels.filter(m => !existingModelKeys.has(`${m.provider}:${m.model_name}`));
     
     // Validate each new model in parallel (but limit concurrency to avoid rate limits)
     const validationResults = await Promise.all(
       modelsToValidate.map(async (model) => {
         const isValid = await validateModel(model, opts.ai);
         return { model, isValid };
       })
     );
     
     // Create a set of invalid model keys to filter out
     const invalidModelKeys = new Set(
       validationResults
         .filter(result => !result.isValid)
         .map(result => `${result.model.provider}:${result.model.model_name}`)
     );
     
     // Filter out invalid models
     validatedAllModels = allModels.filter(m => 
       !invalidModelKeys.has(`${m.provider}:${m.model_name}`)
     );
     
     const invalidCount = modelsToValidate.length - validationResults.filter(r => r.isValid).length;
     if (invalidCount > 0) {
       console.log(`[Model Validation] Filtered out ${invalidCount} invalid models`);
     }
   }
  const diff: DiffResult = diffModels(existing, validatedAllModels, liveProviders);

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