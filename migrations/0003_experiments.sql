CREATE TABLE IF NOT EXISTS fasting_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  target_duration INTEGER NOT NULL CHECK (target_duration BETWEEN 60 AND 10080),
  weekly_goal INTEGER NOT NULL CHECK (weekly_goal BETWEEN 1 AND 7),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (start_date <= end_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_experiment_idx
  ON fasting_experiments ((1))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS experiments_date_idx
  ON fasting_experiments (start_date DESC, end_date DESC);
