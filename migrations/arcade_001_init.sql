-- Hackcade schema for Neon (Postgres)

-- Game registry
CREATE TABLE IF NOT EXISTS arcade_games (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  source_url TEXT,

  -- Builder identity
  builder_domain TEXT NOT NULL,
  builder_label TEXT NOT NULL,
  builder_address TEXT NOT NULL,

  -- IPFS pointer (mutable — updated when a new version is approved)
  ipfs_cid TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,

  -- Stats (denormalized counters)
  play_count INTEGER NOT NULL DEFAULT 0,
  player_count INTEGER NOT NULL DEFAULT 0,

  -- Anti-cheat sanity caps
  max_possible_score INTEGER,
  max_score_per_second REAL,

  -- Moderation: pending → active → flagged → removed; or rejected
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  flagged_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_games_slug ON arcade_games(slug);
CREATE INDEX IF NOT EXISTS idx_arcade_games_status ON arcade_games(status);
CREATE INDEX IF NOT EXISTS idx_arcade_games_builder ON arcade_games(builder_domain);
CREATE INDEX IF NOT EXISTS idx_arcade_games_plays ON arcade_games(play_count DESC);

-- Scores
CREATE TABLE IF NOT EXISTS arcade_scores (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES arcade_games(id) ON DELETE CASCADE,
  player_domain TEXT NOT NULL,
  player_label TEXT NOT NULL,
  player_address TEXT NOT NULL,
  score INTEGER NOT NULL,
  duration_ms INTEGER,
  metadata JSONB,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_scores_game_score
  ON arcade_scores(game_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_arcade_scores_player
  ON arcade_scores(player_domain);
CREATE INDEX IF NOT EXISTS idx_arcade_scores_created
  ON arcade_scores(created_at DESC);

-- Game sessions (2-hour TTL; expired sessions rejected at score submit)
CREATE TABLE IF NOT EXISTS arcade_sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES arcade_games(id) ON DELETE CASCADE,
  player_domain TEXT NOT NULL,
  player_address TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
  ended_at TIMESTAMPTZ,
  score_submitted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_arcade_sessions_player_game
  ON arcade_sessions(player_domain, game_id);
CREATE INDEX IF NOT EXISTS idx_arcade_sessions_expires
  ON arcade_sessions(expires_at);

-- Player stats (denormalized)
CREATE TABLE IF NOT EXISTS arcade_player_stats (
  domain TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  total_plays INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  total_score BIGINT NOT NULL DEFAULT 0,
  first_place_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_player_stats_total_score
  ON arcade_player_stats(total_score DESC);

-- Audit log (separate from wiki_audit_log)
CREATE TABLE IF NOT EXISTS arcade_audit_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_audit_created
  ON arcade_audit_log(created_at DESC);

-- Game version history (every CID, every status change)
CREATE TABLE IF NOT EXISTS arcade_game_versions (
  id SERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES arcade_games(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  ipfs_cid TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  scores_reset BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(game_id, version)
);

CREATE INDEX IF NOT EXISTS idx_arcade_game_versions_game
  ON arcade_game_versions(game_id);
CREATE INDEX IF NOT EXISTS idx_arcade_game_versions_status
  ON arcade_game_versions(status);
