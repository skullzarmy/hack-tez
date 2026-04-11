-- hack.tez Chat — Media, Replies & Reactions
-- Adds media column, reply_to, and reactions table.

-- Separate media column (JSON) for structured media attachments
ALTER TABLE chat_messages ADD COLUMN media TEXT;

-- Reply threading: references the parent message ID
ALTER TABLE chat_messages ADD COLUMN reply_to TEXT;

-- Reactions table
CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id  TEXT NOT NULL,
  domain      TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (message_id, domain, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON chat_reactions(message_id);
