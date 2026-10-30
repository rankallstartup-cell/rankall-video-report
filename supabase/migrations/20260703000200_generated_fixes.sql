-- Auto-generated fix content, stored for customer review BEFORE they apply it.
-- Distinct from fix_predictions (which tracks APPLIED fixes for the rescan/verify
-- loop). Idempotent.

CREATE TABLE IF NOT EXISTS generated_fixes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  fix_type text NOT NULL,
  fix_title text NOT NULL,
  generated_content text,
  industry text,
  city text,
  country_code text DEFAULT 'US',
  predicted_impact integer DEFAULT 0,
  confidence integer DEFAULT 70,
  difficulty text DEFAULT 'Easy',
  time_to_implement text,
  status text DEFAULT 'pending_review',   -- pending_review | approved | rejected | applied | verified
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  applied_at timestamptz,
  verified_at timestamptz,
  score_before integer,
  score_after integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gen_fixes_scan_idx   ON generated_fixes(scan_id);
CREATE INDEX IF NOT EXISTS gen_fixes_user_idx   ON generated_fixes(user_id);
CREATE INDEX IF NOT EXISTS gen_fixes_status_idx ON generated_fixes(user_id, status);
