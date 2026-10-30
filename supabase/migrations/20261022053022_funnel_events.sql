-- funnel events (CONV-00)
--
-- Why: CONV-00 — funnel instrumentation. One row per funnel stage transition
-- (scan_started -> scan_completed -> report_viewed -> profile_claimed ->
-- trial_started -> paid), segmented by traffic source. ClickUp: 14ypkw1c71t.
-- Code that needs it: lib/funnel.ts (writer), app/admin/conversion (reader).
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

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL CHECK (event_name IN (
    'scan_started','scan_completed','report_viewed',
    'profile_claimed','trial_started','paid'
  )),
  user_id uuid NULL,
  email text NULL,
  scan_id uuid NULL,
  -- Traffic source segment: cold | influencer | agency | outbound | unknown
  source text NOT NULL DEFAULT 'unknown',
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  referrer text NULL,
  -- Free-form context (plan, amount_cents, business name, etc.)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS funnel_events_event_created_idx
  ON public.funnel_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_source_created_idx
  ON public.funnel_events (source, created_at DESC);

-- Written server-side with the service role (bypasses RLS). Deny direct
-- anon/authenticated access; the admin dashboard reads via service role.
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS funnel_events_no_anon ON public.funnel_events;
CREATE POLICY funnel_events_no_anon ON public.funnel_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);


-- Make the API see the change immediately.
NOTIFY pgrst, 'reload schema';
