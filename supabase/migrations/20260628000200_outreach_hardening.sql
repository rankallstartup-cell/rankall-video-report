-- Outreach hardening: domain health, do-not-contact, event log, unsub tokens.

CREATE TABLE IF NOT EXISTS outreach_domain_health (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  domain text UNIQUE NOT NULL,
  daily_limit integer DEFAULT 20,
  sent_today integer DEFAULT 0,
  sent_this_month integer DEFAULT 0,
  bounce_count integer DEFAULT 0,
  bounce_rate decimal DEFAULT 0,
  spam_complaint_count integer DEFAULT 0,
  status text DEFAULT 'warming',
  last_sent_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- [reconcile:outreach_domain_health] outreach_domain_health may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS daily_limit integer;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS sent_today integer;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS sent_this_month integer;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS bounce_count integer;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS bounce_rate numeric;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS spam_complaint_count integer;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS pause_reason text;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE outreach_domain_health ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS do_not_contact (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  reason text NOT NULL,
  source text DEFAULT 'unsubscribe',
  added_at timestamptz DEFAULT now()
);

-- [reconcile:do_not_contact] do_not_contact may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE do_not_contact ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE do_not_contact ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE do_not_contact ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE do_not_contact ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE do_not_contact ADD COLUMN IF NOT EXISTS added_at timestamptz;

CREATE TABLE IF NOT EXISTS outreach_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id uuid,
  email text NOT NULL,
  event_type text NOT NULL,
  domain text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- [reconcile:outreach_events] outreach_events may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS unsubscribe_token text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS do_not_contact boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS dnc_email_idx ON do_not_contact(email);
-- outreach_events may already exist in the OLDER tracking-pixel shape
-- (token, event — see 20260616000100_agency_outreach_intelligence.sql), in which
-- case the CREATE TABLE above is skipped. Add the columns this file needs and
-- relax the old NOT NULLs so both writers (tracking pixel + outreach guard) work.
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS metadata jsonb;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'outreach_events' AND column_name = 'token') THEN
    ALTER TABLE outreach_events ALTER COLUMN token DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'outreach_events' AND column_name = 'event') THEN
    ALTER TABLE outreach_events ALTER COLUMN event DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS outreach_events_target_idx ON outreach_events(target_id);
CREATE INDEX IF NOT EXISTS outreach_events_email_idx ON outreach_events(email);
CREATE INDEX IF NOT EXISTS domain_health_domain_idx ON outreach_domain_health(domain);

-- Atomic per-send increment.
CREATE OR REPLACE FUNCTION increment_domain_sent(p_domain text) RETURNS void AS $$
BEGIN
  UPDATE outreach_domain_health
  SET sent_today = sent_today + 1,
      sent_this_month = sent_this_month + 1,
      last_sent_at = now(),
      updated_at = now()
  WHERE domain = p_domain;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_spam_count(p_domain text) RETURNS void AS $$
BEGIN
  UPDATE outreach_domain_health
  SET spam_complaint_count = spam_complaint_count + 1, updated_at = now()
  WHERE domain = p_domain;
END;
$$ LANGUAGE plpgsql;

-- Reset daily counters (midnight cron).
CREATE OR REPLACE FUNCTION reset_daily_sent_counts() RETURNS void AS $$
BEGIN
  UPDATE outreach_domain_health
  SET sent_today = 0, updated_at = now()
  WHERE status != 'paused';
END;
$$ LANGUAGE plpgsql;

-- Reset monthly counters (1st of month).
CREATE OR REPLACE FUNCTION reset_monthly_sent_counts() RETURNS void AS $$
BEGIN
  UPDATE outreach_domain_health
  SET sent_this_month = 0, bounce_count = 0, bounce_rate = 0,
      spam_complaint_count = 0, updated_at = now()
  WHERE status = 'active';
END;
$$ LANGUAGE plpgsql;
