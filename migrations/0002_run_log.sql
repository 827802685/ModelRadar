CREATE TABLE IF NOT EXISTS run_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at         TEXT NOT NULL,
  total_scraped  INTEGER NOT NULL,
  added          INTEGER NOT NULL,
  removed        INTEGER NOT NULL,
  changed        INTEGER NOT NULL,
  providers      TEXT NOT NULL DEFAULT '[]',
  errors         TEXT NOT NULL DEFAULT '{}'
);