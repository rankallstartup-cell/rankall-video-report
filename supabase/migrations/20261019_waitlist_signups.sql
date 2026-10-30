-- b8bh: the /waitlist page has ALWAYS failed its join ("Something went
-- wrong") because this table never existed — no migration ever created
-- waitlist_signups (not on staging, not on prod; only ucp_waitlist
-- exists, which is a different feature). Idempotent.
--
-- SQL-AND-STOP: Nandish runs this in the STAGING Supabase SQL editor,
-- then NOTIFY pgrst, 'reload schema'; — then the same on prod.
-- Until it runs, POST /api/waitlist returns an honest 500 (the page
-- shows the specific error, never a fake success).

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  business_name text,
  plan_type text NOT NULL DEFAULT 'general',
  created_at timestamptz DEFAULT now(),
  -- One row per (email, plan): joining twice for the same plan is an
  -- idempotent "already on the list", not a second row.
  UNIQUE (email, plan_type)
);

ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;
-- No public policies: all writes go through the service role in
-- POST /api/waitlist (validation + honeypot + per-IP rate limit there).

NOTIFY pgrst, 'reload schema';
