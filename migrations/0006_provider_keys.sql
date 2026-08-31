-- Provider API keys editable from the dashboard. Not committed to git.
CREATE TABLE IF NOT EXISTS provider_keys (
  provider   TEXT PRIMARY KEY,
  api_key    TEXT NOT NULL,
  updated_at TEXT NOT NULL
);