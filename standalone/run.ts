import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runSync } from '../src/run.js';
import { FileStore } from '../src/filestore.js';
import { toRelayCatalog } from '../src/catalog.js';
import type { ApiKeys } from '../src/types.js';

function apiKeysFromEnv(): ApiKeys {
  return {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ZHIPU_API_KEY: process.env.ZHIPU_API_KEY,
    MODELSCOPE_API_KEY: process.env.MODELSCOPE_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
    SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY,
    AGNES_API_KEY: process.env.AGNES_API_KEY,
  };
}

async function main(): Promise<void> {
  const stateFile = process.env.MODELRADAR_STATE ?? 'state/models.json';
  const store = new FileStore(stateFile);

  const summary = await runSync({
    store,
    apiKeys: apiKeysFromEnv(),
    webhookUrl: process.env.NOTIFY_WEBHOOK,
  });

  const models = await store.getExisting();
  const catalog = {
    updated_at: summary.ran_at,
    total: models.length,
    models: toRelayCatalog(models),
  };

  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(
    stateFile.replace(/models\.json$/, 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );

  console.log(JSON.stringify(summary, null, 2));

  if (Object.keys(summary.provider_errors).length > 0) {
    console.error('One or more providers failed to scrape; see provider_errors.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});