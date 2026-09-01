export interface FreeModel {
  model_name: string;
  provider: string;
  base_url: string;
  free_type: 'monthly' | 'trial' | 'unlimited';
  free_quota: string;
  rate_limit: string;
  refresh_cycle: 'monthly' | 'daily' | 'none';
  expire_days: number | null;
  context_length: number | null;
  capabilities: string[];
  categories?: string[];
  source_url: string;
  region?: string;
  detected_at: string;
  status: 'active' | 'inactive';
  admin_offline?: boolean;
}

export interface DiffResult {
  added: FreeModel[];
  removed: FreeModel[];
  changed: FreeModel[];
}

export interface ProviderScraper {
  name: string;
  scrape(apiKey?: string): Promise<FreeModel[]>;
}

export interface ApiKeys {
  OPENROUTER_API_KEY?: string;
  ZHIPU_API_KEY?: string;
  MODELSCOPE_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  SILICONFLOW_API_KEY?: string;
  AGNES_API_KEY?: string;
}

export interface RunSummary {
  ran_at: string;
  providers_scraped: string[];
  provider_errors: Record<string, string>;
  total_scraped: number;
  added: number;
  removed: number;
  changed: number;
  added_models?: string[];
  removed_models?: string[];
  changed_models?: string[];
  /** Models kept out of the active pool because the test bench proved them unusable. */
  test_filtered_out?: number;
}

export interface AdminLog {
  id?: number;
  ts: string;
  action: string;
  provider?: string;
  model_name?: string;
  detail?: string;
}

/** Latest test-bench probe result stored per model. */
export interface ModelTestRow {
  provider: string;
  model_name: string;
  result: 'ok' | 'auth' | 'unsupported' | 'rate_limit' | 'error' | 'skip';
  latency_ms: number;
  detail: string;
  tested_at: string;
  /** Monotonic: 1 once a probe has ever returned ok (immune to later rate-limit/error). */
  ever_ok?: number;
}