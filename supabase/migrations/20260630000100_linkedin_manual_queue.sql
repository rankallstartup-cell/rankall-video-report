-- Manual, human-driven LinkedIn outreach queue (NOT automation).

CREATE TABLE IF NOT EXISTS linkedin_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  business_name text NOT NULL,
  contact_name text,
  linkedin_url text,
  industry text,
  city text,
  score integer,
  scan_id uuid,
  video_url text,
  report_url text,
  connection_message text,
  followup_message_1 text,
  followup_message_2 text,
  status text DEFAULT 'pending',
  notes text,
  message_sent_at timestamptz,
  connected_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_queue_user_idx ON linkedin_queue(user_id);
CREATE INDEX IF NOT EXISTS linkedin_queue_status_idx ON linkedin_queue(user_id, status);
