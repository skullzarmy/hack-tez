-- hack.tez Chat — Initial Schema
-- Cloudflare D1 (SQLite)

-- Domain-centric user identity
CREATE TABLE IF NOT EXISTS chat_users (
  domain TEXT PRIMARY KEY,
  current_address TEXT NOT NULL,
  display_name TEXT,
  last_seen TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Wallet-to-domain mapping (supports multi-domain wallets)
CREATE TABLE IF NOT EXISTS chat_wallet_domains (
  address TEXT NOT NULL,
  domain TEXT NOT NULL REFERENCES chat_users(domain),
  active INTEGER DEFAULT 0,
  verified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (address, domain)
);
CREATE INDEX IF NOT EXISTS idx_wallet_active ON chat_wallet_domains(address) WHERE active = 1;

-- Chat rooms
CREATE TABLE IF NOT EXISTS chat_rooms (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('global', 'dm')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seed the global room
INSERT OR IGNORE INTO chat_rooms (id, type) VALUES ('global', 'global');

-- Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES chat_rooms(id),
  sender_domain TEXT NOT NULL,
  content TEXT NOT NULL,
  edited_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_room_time ON chat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON chat_messages(sender_domain);

-- Room membership
CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id TEXT NOT NULL REFERENCES chat_rooms(id),
  domain TEXT NOT NULL,
  last_read TEXT,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (room_id, domain)
);
