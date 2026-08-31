-- Latest per-model test-bench result. Upserted each time a model is probed.
CREATE TABLE IF NOT EXISTS model_tests (
  provider   TEXT NOT NULL,
  model_name TEXT NOT NULL,
  tested_at  TEXT NOT NULL,
  result     TEXT NOT NULL,  -- ok | auth | unsupported | rate_limit | error | skip
  latency_ms INTEGER NOT NULL DEFAULT 0,
  detail     TEXT DEFAULT '',
  PRIMARY KEY (provider, model_name)
);