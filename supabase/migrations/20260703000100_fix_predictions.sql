-- Documents the existing fix_predictions table (already present in the DB) so the
-- schema lives in version control. Idempotent — safe to run against the live DB.

CREATE TABLE IF NOT EXISTS fix_predictions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid NOT NULL,
  fix_type text NOT NULL,
  fix_title text,
  predicted_impact integer DEFAULT 0,
  confidence integer DEFAULT 70,
  effort text DEFAULT 'Medium',
  effort_minutes integer DEFAULT 60,
  platforms_affected text[],
  priority_rank integer DEFAULT 1,
  status text DEFAULT 'pending',
  applied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  verification_method text,
  verification_evidence jsonb,
  verified_at timestamptz,
  evidence_url text,
  auto_verified boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS fix_predictions_scan_idx   ON fix_predictions(scan_id);
CREATE INDEX IF NOT EXISTS fix_predictions_status_idx ON fix_predictions(status);
