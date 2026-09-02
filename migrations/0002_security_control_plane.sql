ALTER TABLE fasts ADD COLUMN deleted_at TEXT;
ALTER TABLE fasts ADD COLUMN deleted_by TEXT;
ALTER TABLE fasts ADD COLUMN deletion_reason TEXT;
ALTER TABLE fasts ADD COLUMN updated_at TEXT;

DROP INDEX IF EXISTS one_active_fast_idx;

CREATE UNIQUE INDEX one_active_fast_idx
  ON fasts ((1))
  WHERE end_time IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user')),
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS sessions_expiry_idx
  ON sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  response_status INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idempotency_expiry_idx
  ON idempotency_keys (expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'mcp', 'admin', 'system')),
  actor_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('web', 'mcp', 'admin', 'system')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT NOT NULL,
  idempotency_key TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'rejected', 'failed')),
  before_json TEXT,
  after_json TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS audit_resource_idx
  ON audit_events (resource_type, resource_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_actor_idx
  ON audit_events (actor_id, occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS audit_events_are_append_only_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_are_append_only_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;
