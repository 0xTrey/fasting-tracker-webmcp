CREATE TABLE IF NOT EXISTS fasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  target_duration INTEGER NOT NULL CHECK (target_duration BETWEEN 60 AND 10080),
  CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE INDEX IF NOT EXISTS fasts_start_time_idx ON fasts (start_time DESC);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_fast_idx
  ON fasts ((1))
  WHERE end_time IS NULL;
