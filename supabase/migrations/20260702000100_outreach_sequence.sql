-- Cold-outreach sequence log. SEPARATE from email_sequence_log (which drives the
-- existing-user nurture flow). This one tracks the multi-touch cold sequence over
-- outreach_targets. Idempotent.

CREATE TABLE IF NOT EXISTS outreach_sequence_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id uuid NOT NULL,
  sequence_day integer NOT NULL,
  subject text,
  body text,
  status text DEFAULT 'pending',      -- pending | sent | skipped | error | stopped
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  error text,
  domain_used text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seq_log_status_idx ON outreach_sequence_log(status, scheduled_for);
CREATE INDEX IF NOT EXISTS seq_log_target_idx ON outreach_sequence_log(target_id);
