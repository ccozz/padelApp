PRAGMA foreign_keys = ON;

-- Compatibilidad: esta tabla conserva el nombre histórico `tournaments`,
-- pero a partir de este modelo representa el EVENTO.
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'clásico',
  place TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Evento activo',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  winner_id TEXT,
  closed_at TEXT,
  scoring_win INTEGER NOT NULL DEFAULT 1,
  scoring_loss INTEGER NOT NULL DEFAULT 0,
  scoring_no_show INTEGER NOT NULL DEFAULT 0,
  rules_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Torneo activo',
  winner_pair_id TEXT,
  closed_at TEXT,
  scoring_win INTEGER NOT NULL DEFAULT 1,
  scoring_loss INTEGER NOT NULL DEFAULT 0,
  scoring_no_show INTEGER NOT NULL DEFAULT 0,
  rules_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pairs (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  player_one_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_two_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_pairs (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  pair_id TEXT NOT NULL REFERENCES pairs(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, pair_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  pair_a_id TEXT NOT NULL REFERENCES pairs(id) ON DELETE CASCADE,
  pair_b_id TEXT NOT NULL REFERENCES pairs(id) ON DELETE CASCADE,
  date TEXT,
  time TEXT,
  venue TEXT,
  score_a INTEGER,
  score_b INTEGER,
  sets_a INTEGER,
  sets_b INTEGER,
  games_a INTEGER,
  games_b INTEGER,
  played INTEGER NOT NULL DEFAULT 0,
  winner_id TEXT REFERENCES pairs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  archived_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_event_id ON categories(event_id);
CREATE INDEX IF NOT EXISTS idx_pairs_category_id ON pairs(category_id);
CREATE INDEX IF NOT EXISTS idx_groups_category_id ON groups(category_id);
CREATE INDEX IF NOT EXISTS idx_matches_category_id ON matches(category_id);
CREATE INDEX IF NOT EXISTS idx_history_event_id ON history(event_id);
CREATE INDEX IF NOT EXISTS idx_history_category_id ON history(category_id);