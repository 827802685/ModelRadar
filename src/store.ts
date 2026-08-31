import type { FreeModel, RunSummary, AdminLog, ModelTestRow } from './types.js';

export interface Store {
  getExisting(): Promise<FreeModel[]>;
  getAll(): Promise<FreeModel[]>;
  upsert(models: FreeModel[]): Promise<void>;
  markRemoved(models: FreeModel[]): Promise<void>;
  recordRun?(summary: RunSummary): Promise<void>;
  pruneOld?(days: number): Promise<void>;
  getAdminOfflineKeys(): Promise<Set<string>>;
  setAdminOffline(provider: string, modelName: string, offline: boolean): Promise<void>;
  setAdminOfflineMany(items: { provider: string; model_name: string }[], offline: boolean): Promise<void>;
  getApiKeys(): Promise<Record<string, string>>;
  setApiKey(provider: string, apiKey: string): Promise<void>;
  deleteApiKey(provider: string): Promise<void>;
  addLog(entry: AdminLog): Promise<void>;
  getLogs(limit?: number): Promise<AdminLog[]>;
  saveModelTest?(row: ModelTestRow): Promise<void>;
  getModelTests?(): Promise<ModelTestRow[]>;
}

const COLUMNS = `model_name, provider, base_url, free_type, free_quota,
rate_limit, refresh_cycle, expire_days, context_length, capabilities,
categories, source_url, region, detected_at, status`;

const PLACEHOLDERS = `?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;

export class D1Store implements Store {
  constructor(private db: D1Database) {}

  async getExisting(): Promise<FreeModel[]> {
    const result = await this.db
      .prepare(`SELECT * FROM models WHERE status = ?`)
      .bind('active')
      .all();
    return (result.results ?? []).map(parseRow);
  }

  async getAll(): Promise<FreeModel[]> {
    const result = await this.db
      .prepare(`SELECT * FROM models ORDER BY status, provider, model_name`)
      .all();
    return (result.results ?? []).map(parseRow);
  }

  async getAdminOfflineKeys(): Promise<Set<string>> {
    const result = await this.db
      .prepare(`SELECT provider, model_name FROM models WHERE admin_offline = 1`)
      .all();
    return new Set(
      (result.results ?? []).map(
        (r) => `${String(r.provider)}:${String(r.model_name)}`
      )
    );
  }

  async getApiKeys(): Promise<Record<string, string>> {
    const result = await this.db.prepare(`SELECT provider, api_key FROM provider_keys`).all();
    const out: Record<string, string> = {};
    for (const r of result.results ?? []) out[String(r.provider)] = String(r.api_key);
    return out;
  }

  async setApiKey(provider: string, apiKey: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO provider_keys (provider, api_key, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at`
      )
      .bind(provider, apiKey, new Date().toISOString())
      .run();
  }

  async deleteApiKey(provider: string): Promise<void> {
    await this.db.prepare(`DELETE FROM provider_keys WHERE provider = ?`).bind(provider).run();
  }

  async setAdminOffline(provider: string, modelName: string, offline: boolean): Promise<void> {
    await this.db
      .prepare(
        `UPDATE models SET admin_offline = ?, status = ?
         WHERE provider = ? AND model_name = ?`
      )
      .bind(offline ? 1 : 0, offline ? 'inactive' : 'active', provider, modelName)
      .run();
  }

  async setAdminOfflineMany(items: { provider: string; model_name: string }[], offline: boolean): Promise<void> {
    if (items.length === 0) return;
    const batch = items.map((it) =>
      this.db
        .prepare(
          `UPDATE models SET admin_offline = ?, status = ?
           WHERE provider = ? AND model_name = ?`
        )
        .bind(offline ? 1 : 0, offline ? 'inactive' : 'active', it.provider, it.model_name)
    );
    await this.db.batch(batch);
  }

  async addLog(entry: AdminLog): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO admin_log (ts, action, provider, model_name, detail)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        entry.ts,
        entry.action,
        entry.provider ?? null,
        entry.model_name ?? null,
        entry.detail ?? ''
      )
      .run();
  }

  async getLogs(limit = 200): Promise<AdminLog[]> {
    const result = await this.db
      .prepare(`SELECT * FROM admin_log ORDER BY id DESC LIMIT ?`)
      .bind(limit)
      .all();
    return (result.results ?? []).map((r) => ({
      id: Number(r.id),
      ts: String(r.ts),
      action: String(r.action),
      provider: r.provider === null || r.provider === undefined ? undefined : String(r.provider),
      model_name:
        r.model_name === null || r.model_name === undefined ? undefined : String(r.model_name),
      detail: String(r.detail ?? ''),
    }));
  }

  async saveModelTest(row: ModelTestRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO model_tests (provider, model_name, tested_at, result, latency_ms, detail)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, model_name) DO UPDATE SET
           tested_at = excluded.tested_at,
           result = excluded.result,
           latency_ms = excluded.latency_ms,
           detail = excluded.detail`
      )
      .bind(
        row.provider,
        row.model_name,
        row.tested_at,
        row.result,
        row.latency_ms,
        row.detail
      )
      .run();
  }

  async getModelTests(): Promise<ModelTestRow[]> {
    const result = await this.db.prepare(`SELECT * FROM model_tests`).all();
    return (result.results ?? []).map((r) => ({
      provider: String(r.provider),
      model_name: String(r.model_name),
      result: String(r.result) as ModelTestRow['result'],
      latency_ms: Number(r.latency_ms ?? 0),
      detail: String(r.detail ?? ''),
      tested_at: String(r.tested_at),
    }));
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
         categories = excluded.categories,
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
    JSON.stringify(m.categories ?? []),
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
    categories:
      typeof row.categories === 'string'
        ? (JSON.parse(row.categories || '[]') as string[])
        : (row.categories as string[]) ?? [],
    source_url: String(row.source_url),
    region: row.region === null ? undefined : String(row.region),
    detected_at: String(row.detected_at),
    status: row.status as FreeModel['status'],
    admin_offline: Number(row.admin_offline ?? 0) === 1,
  };
}