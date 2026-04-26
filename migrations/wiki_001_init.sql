-- Wiki schema for Neon (Postgres)

-- Categories
CREATE TABLE IF NOT EXISTS wiki_categories (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_id TEXT REFERENCES wiki_categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Articles
CREATE TABLE IF NOT EXISTS wiki_articles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  summary TEXT,
  category_id TEXT REFERENCES wiki_categories(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  last_editor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  lock_reason TEXT,
  lock_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_wiki_articles_slug ON wiki_articles(slug);
CREATE INDEX IF NOT EXISTS idx_wiki_articles_category ON wiki_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_wiki_articles_status ON wiki_articles(status);
CREATE INDEX IF NOT EXISTS idx_wiki_articles_updated ON wiki_articles(updated_at DESC);

-- Revisions
CREATE TABLE IF NOT EXISTS wiki_revisions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES wiki_articles(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  summary TEXT,
  editor TEXT NOT NULL,
  edit_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(article_id, revision)
);

-- Tags
CREATE TABLE IF NOT EXISTS wiki_tags (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wiki_article_tags (
  article_id TEXT NOT NULL REFERENCES wiki_articles(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES wiki_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- Full-text search (Postgres tsvector)
ALTER TABLE wiki_articles ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION wiki_articles_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.markdown, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wiki_articles_search_trigger ON wiki_articles;
CREATE TRIGGER wiki_articles_search_trigger
  BEFORE INSERT OR UPDATE OF title, markdown ON wiki_articles
  FOR EACH ROW EXECUTE FUNCTION wiki_articles_search_update();

CREATE INDEX IF NOT EXISTS idx_wiki_articles_search ON wiki_articles USING gin(search_vector);

-- Moderation
CREATE TABLE IF NOT EXISTS wiki_moderators (
  domain TEXT PRIMARY KEY,
  granted_by TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT 'full',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wiki_bans (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  reason TEXT NOT NULL,
  banned_by TEXT NOT NULL,
  ban_type TEXT NOT NULL DEFAULT 'soft',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_bans_domain ON wiki_bans(domain);

CREATE TABLE IF NOT EXISTS wiki_ban_proposals (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  proposer TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  decided_by TEXT,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS wiki_ban_proposal_comments (
  id SERIAL PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES wiki_ban_proposals(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wiki_audit_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_audit_created ON wiki_audit_log(created_at DESC);

-- Seed categories
INSERT INTO wiki_categories (id, slug, name, description, sort_order) VALUES
  ('cat-smart-contracts', 'smart-contracts', 'Smart Contracts', 'Contract development, languages, testing, and deployment', 1),
  ('cat-defi', 'defi', 'DeFi', 'Decentralized finance protocols, AMMs, lending, and yields', 2),
  ('cat-nfts', 'nfts', 'NFTs & Digital Art', 'NFT platforms, marketplaces, generative art, and standards', 3),
  ('cat-dev-tools', 'dev-tools', 'Developer Tools', 'SDKs, CLIs, IDEs, indexers, and libraries', 4),
  ('cat-wallets', 'wallets', 'Wallets', 'Wallet apps, browser extensions, and key management', 5),
  ('cat-infrastructure', 'infrastructure', 'Infrastructure', 'Nodes, bakers, RPC providers, and network services', 6),
  ('cat-governance', 'governance', 'Governance', 'Protocol upgrades, voting, DAOs, and on-chain governance', 7),
  ('cat-etherlink', 'etherlink', 'Etherlink', 'EVM-compatible L2, bridges, and Etherlink ecosystem', 8),
  ('cat-tutorials', 'tutorials', 'Tutorials & Guides', 'Step-by-step guides, walkthroughs, and learning resources', 9),
  ('cat-ecosystem', 'ecosystem', 'Ecosystem', 'Projects, teams, events, and community resources', 10)
ON CONFLICT (id) DO NOTHING;
