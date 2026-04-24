-- 012: Add composite index on behavior_signals for efficient per-account
-- window lookups used by the antibot flusher and admin queries.
CREATE INDEX IF NOT EXISTS idx_behavior_signals_account_window
    ON behavior_signals (account_id, window DESC);
