-- One row per UTC day (YYYY-MM-DD): how many events the Worker has stored that day.
-- worker.mjs stops storing events once n reaches DAILY_EVENT_CAP; the daily cron
-- deletes rows older than 30 days.
CREATE TABLE IF NOT EXISTS daily_counts (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL
) WITHOUT ROWID;
