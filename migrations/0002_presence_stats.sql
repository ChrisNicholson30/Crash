-- Presence, who sits at which table, and online records.
ALTER TABLE users ADD COLUMN last_seen INTEGER;

CREATE TABLE IF NOT EXISTS table_members (
  table_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (table_id, user_id)
);
CREATE INDEX IF NOT EXISTS table_members_user ON table_members(user_id);

CREATE TABLE IF NOT EXISTS player_stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  deals INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  legs INTEGER NOT NULL DEFAULT 0,
  sets INTEGER NOT NULL DEFAULT 0,
  crashes INTEGER NOT NULL DEFAULT 0,
  crashes_won INTEGER NOT NULL DEFAULT 0,
  pots INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  best_value INTEGER NOT NULL DEFAULT -1,
  best_cards TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);
