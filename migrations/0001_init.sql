-- ModelRadar schema: stores the free-model catalog used for diffing.
CREATE TABLE IF NOT EXISTS models (
  model_name    TEXT NOT NULL,
  provider      TEXT NOT NULL,
  base_url      TEXT NOT NULL,
  free_type     TEXT NOT NULL,
  free_quota    TEXT NOT NULL,
  rate_limit    TEXT NOT NULL,
  refresh_cycle TEXT NOT NULL,
  expire_days   INTEGER,
  context_length INTEGER,
  capabilities  TEXT NOT NULL DEFAULT '[]',
  source_url    TEXT NOT NULL,
  region        TEXT,
  detected_at   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (provider, model_name)
);

CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);