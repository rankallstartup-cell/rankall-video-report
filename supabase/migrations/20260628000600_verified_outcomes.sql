-- rerun-safe: the two UPDATEs only fill rows that are still NULL/false from
-- their source column, so a second run finds nothing left to change.
-- Phase 14: Verified Outcomes Engine.
-- The verified_outcomes table ALREADY EXISTS (20260623000600_verified_outcomes_share.sql)
-- with canonical columns: scan_id_before, scan_id_after, score_before, score_after,
-- score_improvement (GENERATED), platforms_before, platforms_after, industry, city,
-- country_code, verified, fix_type. We DO NOT recreate it (that would no-op and the
-- generated score_improvement column would conflict). Instead we ADD the new
-- semantic columns the engine needs so "verified" means a real, threshold-passing
-- rescan — never a prediction.

CREATE TABLE IF NOT EXISTS verified_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  scan_id_before uuid,
  scan_id_after uuid,
  fix_type text,
  score_before integer,
  score_after integer,
  created_at timestamptz DEFAULT now()
);

-- [reconcile:verified_outcomes] verified_outcomes may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS scan_id_before uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS scan_id_after uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS fix_type text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS score_before integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS score_after integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- New semantic columns (idempotent).
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS fix_id uuid;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS business_industry text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'US';
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS before_platforms_found integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS after_platforms_found integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS before_recommendation_share decimal;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS after_recommendation_share decimal;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS platform_changes jsonb;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS days_to_improvement integer;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS confidence_level text DEFAULT 'low';
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS estimated_impact text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS actual_impact text;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS anonymized boolean DEFAULT true;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill: align the new is_verified flag with the legacy `verified` flag where present,
-- and copy industry → business_industry so stats can read either.
UPDATE verified_outcomes SET is_verified = COALESCE(verified, false) WHERE is_verified IS NULL OR is_verified = false;
UPDATE verified_outcomes SET business_industry = industry WHERE business_industry IS NULL AND industry IS NOT NULL;

CREATE INDEX IF NOT EXISTS vo_user_idx      ON verified_outcomes(user_id);
CREATE INDEX IF NOT EXISTS vo_verified_idx  ON verified_outcomes(is_verified, is_public);
CREATE INDEX IF NOT EXISTS vo_industry_idx  ON verified_outcomes(business_industry, country_code);
