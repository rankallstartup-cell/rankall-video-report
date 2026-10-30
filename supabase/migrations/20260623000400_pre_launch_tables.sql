-- Pre-launch tables migration

CREATE TABLE IF NOT EXISTS score_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  scan_id uuid,
  score integer,
  recommendation_share integer,
  platforms_count integer,
  competitor_score integer,
  recorded_at timestamptz DEFAULT now()
);

-- [reconcile:score_history] score_history may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE score_history ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE score_history ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE score_history ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE score_history ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE score_history ADD COLUMN IF NOT EXISTS recommendation_share integer;
ALTER TABLE score_history ADD COLUMN IF NOT EXISTS platforms_count integer;
ALTER TABLE score_history ADD COLUMN IF NOT EXISTS competitor_score integer;
ALTER TABLE score_history ADD COLUMN IF NOT EXISTS recorded_at timestamptz;
CREATE INDEX IF NOT EXISTS score_history_user_idx ON score_history(user_id);
CREATE INDEX IF NOT EXISTS score_history_recorded_idx ON score_history(recorded_at);

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  scan_id uuid,
  competitor_name text,
  competitor_score integer,
  your_score integer,
  gap integer GENERATED ALWAYS AS (competitor_score - your_score) STORED,
  recorded_at timestamptz DEFAULT now()
);

-- [reconcile:competitor_snapshots] competitor_snapshots may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE competitor_snapshots ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE competitor_snapshots ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE competitor_snapshots ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE competitor_snapshots ADD COLUMN IF NOT EXISTS competitor_name text;
ALTER TABLE competitor_snapshots ADD COLUMN IF NOT EXISTS competitor_score integer;
ALTER TABLE competitor_snapshots ADD COLUMN IF NOT EXISTS your_score integer;
ALTER TABLE competitor_snapshots ADD COLUMN IF NOT EXISTS gap integer;
ALTER TABLE competitor_snapshots ADD COLUMN IF NOT EXISTS recorded_at timestamptz;
CREATE INDEX IF NOT EXISTS competitor_snapshots_user_idx ON competitor_snapshots(user_id);

CREATE TABLE IF NOT EXISTS video_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid,
  event text,
  viewed_at timestamptz DEFAULT now(),
  ip_hash text,
  clicked_cta boolean DEFAULT false
);

-- [reconcile:video_views] video_views may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE video_views ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE video_views ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE video_views ADD COLUMN IF NOT EXISTS event text;
ALTER TABLE video_views ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
ALTER TABLE video_views ADD COLUMN IF NOT EXISTS ip_hash text;
ALTER TABLE video_views ADD COLUMN IF NOT EXISTS clicked_cta boolean;
CREATE INDEX IF NOT EXISTS video_views_scan_idx ON video_views(scan_id);

CREATE TABLE IF NOT EXISTS outreach_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name text,
  owner_name text,
  email text,
  phone text,
  city text,
  country_code text DEFAULT 'US',
  industry text,
  apollo_contact_id text,
  scan_id uuid,
  rankall_score integer,
  competitor_name text,
  video_url text,
  report_url text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- [reconcile:outreach_targets] outreach_targets may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS apollo_contact_id text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS rankall_score integer;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS competitor_name text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS report_url text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS created_at timestamptz;
CREATE INDEX IF NOT EXISTS outreach_targets_status_idx ON outreach_targets(status);
CREATE INDEX IF NOT EXISTS outreach_targets_apollo_idx ON outreach_targets(apollo_contact_id);

CREATE TABLE IF NOT EXISTS fix_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  scan_id uuid,
  fix_type text,
  applied_at timestamptz DEFAULT now(),
  scheduled_rescan_at timestamptz,
  verified boolean DEFAULT false,
  notes text
);

-- [reconcile:fix_applications] fix_applications may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE fix_applications ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE fix_applications ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE fix_applications ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE fix_applications ADD COLUMN IF NOT EXISTS fix_type text;
ALTER TABLE fix_applications ADD COLUMN IF NOT EXISTS applied_at timestamptz;
ALTER TABLE fix_applications ADD COLUMN IF NOT EXISTS scheduled_rescan_at timestamptz;
ALTER TABLE fix_applications ADD COLUMN IF NOT EXISTS verified boolean;
ALTER TABLE fix_applications ADD COLUMN IF NOT EXISTS notes text;
CREATE INDEX IF NOT EXISTS fix_applications_user_idx ON fix_applications(user_id);

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
CREATE INDEX IF NOT EXISTS scheduled_rescans_scheduled_idx ON scheduled_rescans(scheduled_for) WHERE completed = false;
