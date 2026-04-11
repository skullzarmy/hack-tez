-- hack.tez Chat — Moderation Schema
-- Adds soft-delete for messages, ban system, and public audit log.

-- Soft-delete columns on existing messages table
ALTER TABLE chat_messages ADD COLUMN deleted_at TEXT;
ALTER TABLE chat_messages ADD COLUMN deleted_by TEXT;
ALTER TABLE chat_messages ADD COLUMN delete_reason TEXT;
ALTER TABLE chat_messages ADD COLUMN delete_visible INTEGER NOT NULL DEFAULT 1;

-- Ban records (active state)
CREATE TABLE IF NOT EXISTS chat_bans (
  domain        TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('soft', 'hard')),
  scope         TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'platform')),
  reason        TEXT NOT NULL,
  admin_domain  TEXT NOT NULL,
  address       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_bans_expires ON chat_bans(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bans_address ON chat_bans(address) WHERE address IS NOT NULL;

-- Append-only public audit log
CREATE TABLE IF NOT EXISTS chat_audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  action        TEXT NOT NULL CHECK (action IN (
                  'message_delete', 'ban_soft', 'ban_hard', 'unban', 'ban_update'
                )),
  target_domain TEXT NOT NULL,
  admin_domain  TEXT NOT NULL,
  reason        TEXT,
  details       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON chat_audit_log(target_domain);
CREATE INDEX IF NOT EXISTS idx_audit_time ON chat_audit_log(created_at DESC);
