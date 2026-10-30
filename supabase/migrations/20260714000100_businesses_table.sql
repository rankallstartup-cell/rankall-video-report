-- ── Business entity layer ───────────────────────────────────────────────────
-- Canonical, entity-oriented table: one row per real business (keyed on Google
-- place_id where known), referenced by scans. Foundation for public profiles.

CREATE TABLE IF NOT EXISTS businesses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity
  place_id text UNIQUE,
  canonical_name text NOT NULL,
  slug text UNIQUE NOT NULL,

  -- Classification: 'business' | 'personal' | 'product'
  entity_type text DEFAULT 'business',
  category text,
  industry text,

  -- Location (structured)
  address text,
  city text,
  state text,
  country_code text DEFAULT 'US',
  postal_code text,
  latitude numeric,
  longitude numeric,

  -- Contact
  website text,
  phone text,
  email text,

  -- Social
  google_business_url text,
  facebook_url text,
  linkedin_url text,
  twitter_url text,

  -- AI Visibility
  latest_score integer DEFAULT 0,
  latest_scan_id uuid,
  score_trend text DEFAULT 'flat',   -- 'up' | 'down' | 'flat'
  platforms_count integer DEFAULT 0,

  -- Knowledge Panel
  kp_exists boolean DEFAULT false,
  kp_claimed boolean DEFAULT false,
  kp_completeness integer DEFAULT 0,

  -- Data Quality: 'unverified' | 'claimed' | 'verified'
  verification_status text DEFAULT 'unverified',
  confidence_score integer DEFAULT 0,
  data_sources text[] DEFAULT '{}',

  -- Public Profile
  is_public boolean DEFAULT true,
  profile_views integer DEFAULT 0,

  -- Ownership
  claimed_by_user_id uuid,
  claimed_at timestamptz,

  -- Timestamps
  first_scanned_at timestamptz DEFAULT now(),
  last_scanned_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- [reconcile:businesses] businesses may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS place_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS canonical_name text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_business_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS twitter_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS latest_score integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS latest_scan_id uuid;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS score_trend text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS platforms_count integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS kp_exists boolean;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS kp_claimed boolean;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS kp_completeness integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS verification_status text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS confidence_score integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS data_sources text[];
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_public boolean;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS profile_views integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS first_scanned_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_scanned_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS businesses_place_id_idx    ON businesses(place_id) WHERE place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS businesses_slug_idx         ON businesses(slug);
CREATE INDEX IF NOT EXISTS businesses_city_industry_idx ON businesses(city, industry);
CREATE INDEX IF NOT EXISTS businesses_country_idx      ON businesses(country_code);
CREATE INDEX IF NOT EXISTS businesses_score_idx        ON businesses(latest_score DESC);

-- RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Public can read public profiles
DROP POLICY IF EXISTS "public_can_read_businesses" ON businesses;
CREATE POLICY "public_can_read_businesses"
  ON businesses FOR SELECT
  USING (is_public = true);

-- Service role can write (service-role key bypasses RLS, but keep an explicit
-- ALL policy for it). TO service_role added Oct 2026: without it this policy
-- let ANY role (anon, signed-in users) insert/update/delete businesses.
DROP POLICY IF EXISTS "service_role_can_manage_businesses" ON businesses;
CREATE POLICY "service_role_can_manage_businesses"
  ON businesses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── rankall_scans → businesses link + structured fields ─────────────────────
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS user_business_name text;
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS business_city text;
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS business_state text;
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS competitor_score integer;
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS competitor_id uuid REFERENCES businesses(id);

CREATE INDEX IF NOT EXISTS rankall_scans_business_id_idx ON rankall_scans(business_id) WHERE business_id IS NOT NULL;
