-- Agency tier tables and column additions

CREATE TABLE IF NOT EXISTS agency_proposals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_user_id uuid,
  prospect_business_name text,
  prospect_website text,
  prospect_scan_id uuid,
  proposed_monthly_fee numeric,
  proposal_pdf_url text,
  proposal_content text,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agency_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_user_id uuid UNIQUE,
  agency_name text,
  agency_website text,
  agency_logo_url text,
  agency_primary_color text DEFAULT '#7c3aed',
  agency_email text,
  agency_phone text,
  white_label_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS score_trend numeric DEFAULT 0;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS kp_status text DEFAULT 'unknown';
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS latest_score numeric DEFAULT 0;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS last_scanned_at timestamptz;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS client_user_id uuid;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS country_code text;
