CREATE TABLE IF NOT EXISTS linkedin_outreach_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_url text,
  owner_name text,
  business_name text,
  connection_message text,
  followup_message text,
  status text DEFAULT 'pending',
  scan_id uuid,
  scheduled_for timestamptz DEFAULT now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);
