-- Add recommendation_share to rankall_scans
ALTER TABLE IF EXISTS rankall_scans ADD COLUMN IF NOT EXISTS recommendation_share integer;

-- verified_outcomes table (if not exists)
CREATE TABLE IF NOT EXISTS verified_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  scan_id_before uuid REFERENCES rankall_scans(id) ON DELETE SET NULL,
  scan_id_after uuid REFERENCES rankall_scans(id) ON DELETE SET NULL,
  fix_type text,
  fix_description text,
  fix_applied_at timestamptz,
  rescanned_at timestamptz,
  score_before integer,
  score_after integer,
  score_improvement integer GENERATED ALWAYS AS (score_after - score_before) STORED,
  platforms_before integer,
  platforms_after integer,
  industry text,
  city text,
  country_code text,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- [reconcile:verified_outcomes] verified_outcomes may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS scan_id_before uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS scan_id_after uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS fix_type text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS fix_description text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS fix_applied_at timestamptz;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS rescanned_at timestamptz;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS score_before integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS score_after integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS score_improvement integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS platforms_before integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS platforms_after integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS verified boolean;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE INDEX IF NOT EXISTS verified_outcomes_industry_idx ON verified_outcomes(industry);
CREATE INDEX IF NOT EXISTS verified_outcomes_user_idx ON verified_outcomes(user_id);
CREATE INDEX IF NOT EXISTS verified_outcomes_verified_idx ON verified_outcomes(verified) WHERE verified = true;
