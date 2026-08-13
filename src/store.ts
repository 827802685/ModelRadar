import type { FreeModel, RunSummary } from './types.js';

export interface Store {
  getExisting(): Promise<FreeModel[]>;
  upsert(models: FreeModel[]): Promise<void>;
  markRemoved(models: FreeModel[]): Promise<void>;
  recordRun?(summary: RunSummary): Promise<void>;
  pruneOld?(days: number): Promise<void>;
}

const COLUMNS = `model_name, provider, base_url, free_type, free_quota,
rate_limit, refresh_cycle, expire_days, context_length, capabilities,
source_url, region, detected_at, status`;

const PLACEHOLDERS = `?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;

export class D1Store implements Store {
  constructor(private db: D1Database) {}

  async getExisting(): Promise<FreeModel[]> {
    const result = await this.db
      .prepare(`SELECT * FROM models WHERE status = ?`)
      .bind('active')
      .all();
    return (result.results ?? []).map(parseRow);
  }

  async upsert(models: FreeModel[]): Promise<void> {
    if (models.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT INTO models (${COLUMNS}) VALUES (${PLACEHOLDERS})
       ON CONFLICT(provider, model_name) DO UPDATE SET
         base_url = excluded.base_url,
         free_type = excluded.free_type,
         free_quota = excluded.free_quota,
         rate_limit = excluded.rate_limit,
         refresh_cycle = excluded.refresh_cycle,
         expire_days = excluded.expire_days,
         context_length = excluded.context_length,
         capabilities = excluded.capabilities,
         source_url = excluded.source_url,
         region = excluded.region,
         detected_at = excluded.detected_at,
         status = 'active',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    );

    const batch = models.map((m) => stmt.bind(...bindRow(m)));
    await this.db.batch(batch);
  }

  async markRemoved(models: FreeModel[]): Promise<void> {
    if (models.length === 0) return;
    const batch = models.map((m) =>
      this.db
        .prepare(
          `UPDATE models SET status = 'inactive',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE provider = ? AND model_name = ? AND status = 'active'`
        )
        .bind(m.provider, m.model_name)
    );
    await this.db.batch(batch);
  }

  async recordRun(summary: RunSummary): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO run_log (ran_at, total_scraped, added, removed, changed, providers, errors)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        summary.ran_at,
        summary.total_scraped,
        summary.added,
        summary.removed,
        summary.changed,
        JSON.stringify(summary.providers_scraped),
        JSON.stringify(summary.provider_errors)
      )
      .run();
  }

  async pruneOld(days: number): Promise<void> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    await this.db
      .prepare('DELETE FROM models WHERE julianday(updated_at) < julianday(?)')
      .bind(cutoff)
      .run();
    await this.db
      .prepare('DELETE FROM run_log WHERE julianday(ran_at) < julianday(?)')
      .bind(cutoff)
      .run();
  }

  async getLastRun(): Promise<RunSummary | null> {
    const row = await this.db
      .prepare(`SELECT * FROM run_log ORDER BY id DESC LIMIT 1`)
      .first<{
        ran_at: string;
        total_scraped: number;
        added: number;
        removed: number;
        changed: number;
        providers: string;
        errors: string;
      }>();
    if (!row) return null;
    return {
      ran_at: row.ran_at,
      providers_scraped: JSON.parse(row.providers || '[]') as string[],
      provider_errors: JSON.parse(row.errors || '{}') as Record<string, string>,
      total_scraped: row.total_scraped,
      added: row.added,
      removed: row.removed,
      changed: row.changed,
    };
  }
}

function bindRow(m: FreeModel): unknown[] {
  return [
    m.model_name,
    m.provider,
    m.base_url,
    m.free_type,
    m.free_quota,
    m.rate_limit,
    m.refresh_cycle,
    m.expire_days,
    m.context_length,
    JSON.stringify(m.capabilities),
    m.source_url,
    m.region ?? null,
    m.detected_at,
    m.status,
  ];
}

function parseRow(row: Record<string, unknown>): FreeModel {
  return {
    model_name: String(row.model_name),
    provider: String(row.provider),
    base_url: String(row.base_url),
    free_type: row.free_type as FreeModel['free_type'],
    free_quota: String(row.free_quota),
    rate_limit: String(row.rate_limit),
    refresh_cycle: row.refresh_cycle as FreeModel['refresh_cycle'],
    expire_days: row.expire_days === null || row.expire_days === undefined
      ? null
      : Number(row.expire_days),
    context_length: row.context_length === null || row.context_length === undefined
      ? null
      : Number(row.context_length),
    capabilities:
      typeof row.capabilities === 'string'
        ? (JSON.parse(row.capabilities || '[]') as string[])
        : (row.capabilities as string[]) ?? [],
    source_url: String(row.source_url),
    region: row.region === null ? undefined : String(row.region),
    detected_at: String(row.detected_at),
    status: row.status as FreeModel['status'],
  };
}