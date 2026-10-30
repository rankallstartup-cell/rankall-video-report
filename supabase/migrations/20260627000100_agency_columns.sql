-- A5: Guarantee agency_clients has all columns used by the Add Client flow.
-- business_name is the canonical display column; client_name kept for backward-compat.

ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS agency_user_id  uuid;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS client_user_id  uuid;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS business_name   text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS client_name     text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS industry        text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS city            text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS country_code    text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS contact_email   text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS latest_score    numeric DEFAULT 0;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS scan_id         uuid;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS last_scanned_at timestamptz;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS kp_status       text DEFAULT 'unknown';
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS score_trend     numeric DEFAULT 0;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS notes           text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS status          text DEFAULT 'active';
