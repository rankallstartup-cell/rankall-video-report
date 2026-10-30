-- Fix: outreach events were silently not being saved.
--
-- Two migrations define outreach_events differently:
--   * 20260616000100_agency_outreach_intelligence — tracking-pixel shape
--     (token NOT NULL, event NOT NULL, ip, user_agent)
--   * 20260628000200_outreach_hardening — outreach-guard shape
--     (target_id, email, event_type, domain, metadata)
-- Staging and production both have the FIRST shape, so every insert from
-- lib/outreachGuard.ts (sent / bounce / spam_complaint) and
-- app/api/webhooks/resend/route.ts (open / click) failed: the columns did not
-- exist and token/event were NOT NULL. Hot-lead detection and the spam guard
-- therefore saw no events. Both writers are server-side (service role).
--
-- This adds the missing columns, relaxes the old NOT NULLs (the tracking pixel
-- still sets them) and adds the indexes the second migration intended.
-- Additive only; no data is changed.

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

CREATE INDEX IF NOT EXISTS outreach_events_target_idx ON outreach_events (target_id);
CREATE INDEX IF NOT EXISTS outreach_events_email_idx ON outreach_events (email);

NOTIFY pgrst, 'reload schema';
