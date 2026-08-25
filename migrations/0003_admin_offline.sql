-- Admin force-offline flag: lets dashboard users hide a model from the
-- relay catalog even though the provider still lists it as free.
-- Next sync will not re-activate models with admin_offline = 1.
ALTER TABLE models ADD COLUMN admin_offline INTEGER NOT NULL DEFAULT 0;
