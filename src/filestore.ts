import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FreeModel, RunSummary, AdminLog } from './types.js';
import type { Store } from './store.js';

/** File-backed Store used by the standalone / GitHub Actions runner. */
export class FileStore implements Store {
  private models: FreeModel[] = [];
  private loaded = false;
  private logs: AdminLog[] = [];
  private logsLoaded = false;

  constructor(private stateFile = 'state/models.json') {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      const parsed = JSON.parse(raw) as { models?: FreeModel[] };
      this.models = parsed.models ?? [];
    } catch {
      this.models = [];
    }
    this.loaded = true;
  }

  async getExisting(): Promise<FreeModel[]> {
    await this.load();
    return this.models.filter((m) => m.status === 'active');
  }

  async getAll(): Promise<FreeModel[]> {
    await this.load();
    return this.models;
  }

  async getAdminOfflineKeys(): Promise<Set<string>> {
    await this.load();
    return new Set(
      this.models
        .filter((m) => m.admin_offline === true)
        .map((m) => `${m.provider}:${m.model_name}`)
    );
  }

  async setAdminOffline(provider: string, modelName: string, offline: boolean): Promise<void> {
    await this.load();
    const model = this.models.find(
      (m) => m.provider === provider && m.model_name === modelName
    );
    if (!model) return;
    model.admin_offline = offline;
    model.status = offline ? 'inactive' : 'active';
    await this.save();
  }

  async setAdminOfflineMany(items: { provider: string; model_name: string }[], offline: boolean): Promise<void> {
    await this.load();
    for (const it of items) {
      const model = this.models.find(
        (m) => m.provider === it.provider && m.model_name === it.model_name
      );
      if (!model) continue;
      model.admin_offline = offline;
      model.status = offline ? 'inactive' : 'active';
    }
    await this.save();
  }

  private logFile(): string {
    return this.stateFile.replace(/models\.json$/, 'admin-log.json');
  }

  private async loadLogs(): Promise<void> {
    if (this.logsLoaded) return;
    try {
      const raw = await fs.readFile(this.logFile(), 'utf8');
      const parsed = JSON.parse(raw) as { logs?: AdminLog[] };
      this.logs = parsed.logs ?? [];
    } catch {
      this.logs = [];
    }
    this.logsLoaded = true;
  }

  async addLog(entry: AdminLog): Promise<void> {
    await this.loadLogs();
    this.logs.unshift(entry);
    this.logs = this.logs.slice(0, 200);
    await fs.mkdir(path.dirname(this.logFile()), { recursive: true });
    await fs.writeFile(
      this.logFile(),
      JSON.stringify({ updated_at: new Date().toISOString(), logs: this.logs }, null, 2)
    );
  }

  async getLogs(limit = 200): Promise<AdminLog[]> {
    await this.loadLogs();
    return this.logs.slice(0, limit);
  }

  async upsert(models: FreeModel[]): Promise<void> {
    await this.load();
    for (const model of models) {
      this.models = this.models.filter(
        (m) => !(m.provider === model.provider && m.model_name === model.model_name)
      );
      this.models.push({ ...model, status: 'active' });
    }
    await this.save();
  }

  async markRemoved(models: FreeModel[]): Promise<void> {
    await this.load();
    const keys = new Set(models.map((m) => `${m.provider}:${m.model_name}`));
    this.models = this.models.map((m) =>
      keys.has(`${m.provider}:${m.model_name}`) ? { ...m, status: 'inactive' as const } : m
    );
    await this.save();
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    await fs.writeFile(
      this.stateFile,
      JSON.stringify(
        { updated_at: new Date().toISOString(), models: this.models },
        null,
        2
      )
    );
  }

  async recordRun(summary: RunSummary): Promise<void> {
    const file = this.stateFile.replace(/models\.json$/, 'last-run.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(summary, null, 2));
  }

  async pruneOld(days: number): Promise<void> {
    await this.load();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const before = this.models.length;
    this.models = this.models.filter((m) => {
      const t = new Date(m.detected_at).getTime();
      if (Number.isNaN(t)) return true;
      return t >= cutoff;
    });
    if (this.models.length !== before) await this.save();
  }
}