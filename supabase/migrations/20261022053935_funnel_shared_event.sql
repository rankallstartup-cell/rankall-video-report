-- funnel shared event (CONV-01)
--
-- Why: CONV-01 — shareable report loop. Adds 'report_shared' to the
-- funnel_events CHECK constraint so share actions are tracked in the funnel.
-- ClickUp: 14ypkw1c71u.
-- Code that needs it: lib/funnel.ts, app/api/report/[id]/route.ts,
-- app/api/admin/funnel/route.ts, app/admin/conversion/page.tsx.
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

-- Rerun-safe: drops the old CHECK before adding the widened one.
ALTER TABLE public.funnel_events DROP CONSTRAINT IF EXISTS funnel_events_event_name_check;
ALTER TABLE public.funnel_events
  ADD CONSTRAINT funnel_events_event_name_check CHECK (event_name IN (
    'scan_started','scan_completed','report_viewed','report_shared',
    'profile_claimed','trial_started','paid'
  ));


-- Make the API see the change immediately.
NOTIFY pgrst, 'reload schema';
