-- Phase 20: Data Quality Layer (moat protection). Idempotent.

CREATE TABLE IF NOT EXISTS data_quality_issues (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid,
  issue_type text NOT NULL,
  severity text NOT NULL,
  status text DEFAULT 'open',
  message text NOT NULL,
  field text,
  current_value jsonb,
  suggested_value jsonb,
  evidence jsonb,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE TABLE IF NOT EXISTS data_quality_quarantine (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid,
  original_data jsonb NOT NULL,
  quality_result jsonb NOT NULL,
  reason text NOT NULL,
  status text DEFAULT 'pending_review',
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  action_taken text
);

CREATE INDEX IF NOT EXISTS dq_issues_entity_idx     ON data_quality_issues(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS dq_issues_status_idx     ON data_quality_issues(status);
CREATE INDEX IF NOT EXISTS dq_quarantine_status_idx ON data_quality_quarantine(status);

-- Quality columns on existing tables.
ALTER TABLE rankall_scans     ADD COLUMN IF NOT EXISTS data_quality_status text DEFAULT 'clean';
ALTER TABLE rankall_scans     ADD COLUMN IF NOT EXISTS data_quality_score integer DEFAULT 100;
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS data_quality_status text DEFAULT 'clean';
ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS is_intelligence_graph_eligible boolean DEFAULT true;
