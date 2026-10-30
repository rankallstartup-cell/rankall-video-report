-- ax72: per-fix verification schedule.
-- scheduled_rescans had no fix_type and was never marked complete, so the
-- daily trigger-rescans cron could not tell which fix a row belonged to and
-- re-fired the same row forever. Idempotent; code degrades safely (falls back
-- to the legacy untyped-row logic) when this has not been applied yet.

CREATE TABLE IF NOT EXISTS scheduled_rescans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  scan_id uuid,
  scheduled_for timestamptz,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- [reconcile:scheduled_rescans] scheduled_rescans may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE scheduled_rescans ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE scheduled_rescans ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE scheduled_rescans ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE scheduled_rescans ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
ALTER TABLE scheduled_rescans ADD COLUMN IF NOT EXISTS completed boolean;
ALTER TABLE scheduled_rescans ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE scheduled_rescans ADD COLUMN IF NOT EXISTS fix_type text;
ALTER TABLE scheduled_rescans ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Due-row lookup: open rows by scan + fix, and by due date.
CREATE INDEX IF NOT EXISTS scheduled_rescans_open_due_idx
  ON scheduled_rescans (scheduled_for)
  WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS scheduled_rescans_scan_fix_idx
  ON scheduled_rescans (scan_id, fix_type);

-- Writes go through the service role (apply route after an ownership check,
-- trigger-rescans cron). Users may read their own rows.
ALTER TABLE scheduled_rescans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduled_rescans_owner_select ON scheduled_rescans;
CREATE POLICY scheduled_rescans_owner_select ON scheduled_rescans
  FOR SELECT USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
