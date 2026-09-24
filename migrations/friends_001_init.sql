-- Friends (one-way follows) schema for Neon (Postgres)
--
-- Keyed by WALLET ADDRESS on both ends, never by domain. Domains are
-- transferable NFTs: a follow stored as "bob.hack.tez" would silently start
-- pointing at whoever buys that name — and sprinkles move real tez to it.
-- A wallet is the person; domains are just how we display them.

CREATE TABLE IF NOT EXISTS friend_follows (
  follower TEXT NOT NULL,                        -- wallet address (JWT sub)
  followee TEXT NOT NULL,                        -- wallet address of a hack.tez owner
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower, followee),
  CHECK (follower <> followee)
);

-- Reverse lookups (followers-of) — unused by the private v1 API, but cheap and
-- what any later "mutuals" / public-count feature will need.
CREATE INDEX IF NOT EXISTS idx_friend_follows_followee ON friend_follows(followee);
