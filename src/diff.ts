import type { FreeModel, DiffResult } from './types.js';

/**
 * Compare the stored catalog against this run's scrape results.
 *
 * `liveProviders` lists the providers that scraped successfully this run.
 * A provider that errored (or had no credentials) returns an empty/partial
 * list, so without this guard we would falsely mark its whole catalog as
 * removed.
 */
export function diffModels(
  existing: FreeModel[],
  incoming: FreeModel[],
  liveProviders?: Iterable<string>
): DiffResult {
  const key = (m: FreeModel) => `${m.provider}:${m.model_name}`;

  const activeProviders = liveProviders ? new Set(liveProviders) : null;
  const existingMap = new Map(existing.map((m) => [key(m), m]));
  const incomingMap = new Map(incoming.map((m) => [key(m), m]));

  const added: FreeModel[] = [];
  const removed: FreeModel[] = [];
  const changed: FreeModel[] = [];

  for (const [k, model] of incomingMap) {
    if (!existingMap.has(k)) {
      added.push(model);
    } else if (hasChanged(existingMap.get(k)!, model)) {
      changed.push(model);
    }
  }

  for (const [k, model] of existingMap) {
    if (!incomingMap.has(k) && (!activeProviders || activeProviders.has(model.provider))) {
      removed.push(model);
    }
  }

  return { added, removed, changed };
}

function hasChanged(old: FreeModel, next: FreeModel): boolean {
  const relevant: (keyof FreeModel)[] = [
    'free_type',
    'free_quota',
    'rate_limit',
    'refresh_cycle',
    'expire_days',
    'context_length',
    'base_url',
  ];
  const same = (a: unknown, b: unknown) =>
    Array.isArray(a) && Array.isArray(b)
      ? JSON.stringify(a) === JSON.stringify(b)
      : a === b;
  return relevant.some((f) => !same(old[f], next[f]));
}