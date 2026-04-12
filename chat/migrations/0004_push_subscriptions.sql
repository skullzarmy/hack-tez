-- Push notification subscriptions (one user can have multiple devices)
CREATE TABLE push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  domain     TEXT NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used  TEXT
);

CREATE INDEX idx_push_subs_domain ON push_subscriptions(domain);

-- Server-side notification preferences
CREATE TABLE push_preferences (
  domain           TEXT PRIMARY KEY,
  push_enabled     INTEGER NOT NULL DEFAULT 1,
  push_dms         INTEGER NOT NULL DEFAULT 1,
  push_mentions    INTEGER NOT NULL DEFAULT 1,
  push_broadcasts  INTEGER NOT NULL DEFAULT 1,
  quiet_start      TEXT,
  quiet_end        TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin broadcast audit log
CREATE TABLE push_broadcasts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  url          TEXT,
  admin_domain TEXT NOT NULL,
  sent_count   INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
