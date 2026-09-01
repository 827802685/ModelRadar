-- Mark a model as "ever OK" so that transient rate-limit / timeout results
-- (common on free endpoints like OpenRouter and Zhipu) do not wipe a model
-- out of the "tested usable" RSS surface just because the last probe was
-- throttled. ever_ok is monotonic (once 1, stays 1).
ALTER TABLE model_tests ADD COLUMN ever_ok INTEGER NOT NULL DEFAULT 0;