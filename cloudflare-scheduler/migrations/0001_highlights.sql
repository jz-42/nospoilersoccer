CREATE TABLE IF NOT EXISTS quota_days (
  day TEXT PRIMARY KEY,
  used_units INTEGER NOT NULL DEFAULT 0 CHECK (used_units >= 0 AND used_units <= 8000)
);

CREATE TABLE IF NOT EXISTS quota_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  method TEXT NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quota_events_day_idx ON quota_events(day, method);

CREATE TABLE IF NOT EXISTS subscriptions (
  channel_id TEXT PRIMARY KEY,
  topic_url TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at TEXT,
  verified_at TEXT,
  expires_at TEXT,
  last_notification_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS channel_cursors (
  source_id TEXT PRIMARY KEY,
  newest_video_id TEXT,
  last_shallow_poll_at TEXT,
  last_deep_poll_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  video_id TEXT PRIMARY KEY,
  content_version TEXT NOT NULL,
  source_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  discovered_by TEXT NOT NULL,
  status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  acceptance_id TEXT
);
CREATE INDEX IF NOT EXISTS candidates_status_idx ON candidates(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS runtime_highlights (
  acceptance_id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  video_json TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  persisted_at TEXT,
  UNIQUE(tournament_id, match_id, video_key)
);
CREATE INDEX IF NOT EXISTS runtime_highlights_tournament_idx
  ON runtime_highlights(tournament_id, accepted_at);

CREATE TABLE IF NOT EXISTS persistence_outbox (
  acceptance_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(acceptance_id) REFERENCES runtime_highlights(acceptance_id)
);
