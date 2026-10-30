-- founder outreach (CONV-05)
--
-- Why: CONV-05 — founder-led closing. Tracks which claimed-but-not-trialed
-- profiles Nandish has personally contacted, so the workflow doesn't
-- double-send and conversion can be measured. ClickUp: 14ypkw1c71y.
-- Code that needs it: app/api/admin/founder-outreach/route.ts,
-- app/admin/founder-outreach/page.tsx.
--
-- RULES (checked automatically by `npm run db:check` and in every PR):
--   * Must be safe to run twice: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--     DROP POLICY IF EXISTS before CREATE POLICY, DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT.
--   * No BEGIN/COMMIT (each file already runs in one transaction).
--   * Data changes (UPDATE/DELETE/INSERT) need a "-- rerun-safe: <why>" comment.
--   * New tables: ENABLE ROW LEVEL SECURITY + policies in this same file.
--   * App code must keep working if this migration has not run yet.
--   * Never edit a migration after it has been merged — write a new one.

CREATE TABLE IF NOT EXISTS public.founder_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  business_name text NULL,
  scan_id uuid NULL,
  -- The auto-generated wound summary shown to Nandish for personalization.
  wound_summary text NULL,
  -- 'pending' | 'sent' | 'replied' | 'converted' | 'skipped'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','replied','converted','skipped')),
  sent_at timestamptz NULL,
  notes text NULL,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS founder_outreach_status_idx
  ON public.founder_outreach (status, created_at DESC);

-- Admin-only via service role; deny direct anon/authenticated access.
ALTER TABLE public.founder_outreach ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS founder_outreach_no_anon ON public.founder_outreach;
CREATE POLICY founder_outreach_no_anon ON public.founder_outreach
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);


-- Make the API see the change immediately.
NOTIFY pgrst, 'reload schema';
