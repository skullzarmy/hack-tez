-- Auth sessions table.
--
-- Every JWT we issue gets a row here, keyed by `sid` (UUID embedded in the JWT).
-- This lets us:
--   1. Revoke individual sessions without rotating the signing secret
--   2. Track session activity (last_seen) for security insights / cleanup
--   3. Show the user a "your active sessions" list later if we want that
--
-- The table is intentionally append-once: rows are inserted at /auth time and
-- updated at /auth/refresh time. Revocation flips `revoked_at` from NULL to
-- a timestamp; the row itself is never deleted (we want an audit trail).
--
-- Cleanup is a separate periodic job: delete rows where exp_at < now() - 30d.

CREATE TABLE IF NOT EXISTS auth_sessions (
  sid           TEXT PRIMARY KEY,
  address       TEXT NOT NULL,
  v             INTEGER NOT NULL,
  kid           TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exp_at        TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  revoked_at    TEXT,
  revoked_by    TEXT,
  revoke_reason TEXT
);

CREATE INDEX IF NOT EXISTS auth_sessions_address_idx ON auth_sessions (address);
CREATE INDEX IF NOT EXISTS auth_sessions_exp_idx ON auth_sessions (exp_at);
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx
  ON auth_sessions (address) WHERE revoked_at IS NULL;
