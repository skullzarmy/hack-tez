-- Hackcade — add cover image column.
--
-- Each game gets one cover image stored in the `arcade-games` Netlify Blob
-- store at key `<gameId>/cover` (no version suffix — survives version updates).
-- The DB column holds the blob key when present.

ALTER TABLE arcade_games
  ADD COLUMN IF NOT EXISTS cover_key TEXT;
