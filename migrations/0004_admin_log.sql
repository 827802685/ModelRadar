-- Admin operation log: records manual offline/online/batch actions and sync
-- triggers for the dashboard "日志" view.
CREATE TABLE IF NOT EXISTS admin_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  action     TEXT NOT NULL,
  provider   TEXT,
  model_name TEXT,
  detail     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_admin_log_ts ON admin_log(ts);
