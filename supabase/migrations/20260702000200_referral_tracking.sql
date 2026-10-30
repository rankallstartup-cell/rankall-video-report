-- Referral attribution/tracking. Idempotent.

-- Store the raw referral code on each conversion (attribution + backfill).
ALTER TABLE referral_conversions ADD COLUMN IF NOT EXISTS ref_code text;

CREATE TABLE IF NOT EXISTS referral_clicks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ref_code text NOT NULL,
  clicked_at timestamptz DEFAULT now(),
  ip_hash text,
  converted boolean DEFAULT false
);

-- [reconcile:referral_clicks] referral_clicks may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE referral_clicks ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE referral_clicks ADD COLUMN IF NOT EXISTS ref_code text;
ALTER TABLE referral_clicks ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE referral_clicks ADD COLUMN IF NOT EXISTS ip_hash text;
ALTER TABLE referral_clicks ADD COLUMN IF NOT EXISTS converted boolean;

CREATE INDEX IF NOT EXISTS referral_clicks_code_idx ON referral_clicks(ref_code);
CREATE INDEX IF NOT EXISTS referral_conversions_referrer_idx ON referral_conversions(referrer_user_id);
