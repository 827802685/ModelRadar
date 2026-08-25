-- Model classification (模型分类): machine-readable category tags attached to
-- each catalog entry so the relay catalog / RSS / dashboard can group models.
ALTER TABLE models ADD COLUMN categories TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_models_categories ON models(categories);