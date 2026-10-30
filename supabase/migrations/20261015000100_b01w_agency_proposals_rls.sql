-- b01w: enable Row-Level Security on agency_proposals.
--
-- The dashboard deletes proposals client-side with
-- .eq('agency_user_id', data.user.id), and the generate-proposal /
-- update-proposal-status routes scope the same way — but WITHOUT RLS
-- any authenticated user could read/update/delete ANY proposal by
-- calling PostgREST directly with the anon key (client-side filters
-- are not a security boundary). These policies make the database
-- enforce the same ownership rule the app already applies:
--   * SELECT / UPDATE / DELETE: only rows the caller owns
--     (agency_user_id = auth.uid()).
--   * INSERT: only rows the caller owns (WITH CHECK).
-- Server-side code that uses the service_role key bypasses RLS —
-- unchanged. The three app access paths all run under the user's
-- own session (browser client / createServerSupabaseClient) and set
-- or filter agency_user_id = the caller's id, so they keep working.
--
-- Staging check (Oct 15, 2026): agency_proposals is EMPTY on staging,
-- so no legacy rows with NULL agency_user_id are hidden by this.
-- On PROD, check for NULL-owner rows before applying — they would
-- become invisible to everyone (fail-closed, but verify first).
--
-- Idempotent: safe to run multiple times (DROP POLICY IF EXISTS guards).
-- NOTE: apply in the Supabase SQL editor (or via the migration
-- runner) — PostgREST picks it up after `NOTIFY pgrst, 'reload schema'`.
-- This file is NOT auto-applied by the app; Nandish owns migrations.

ALTER TABLE agency_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS b01w_proposals_select ON agency_proposals;
CREATE POLICY b01w_proposals_select ON agency_proposals
  FOR SELECT
  USING (agency_user_id = auth.uid());

DROP POLICY IF EXISTS b01w_proposals_insert ON agency_proposals;
CREATE POLICY b01w_proposals_insert ON agency_proposals
  FOR INSERT
  WITH CHECK (agency_user_id = auth.uid());

DROP POLICY IF EXISTS b01w_proposals_update ON agency_proposals;
CREATE POLICY b01w_proposals_update ON agency_proposals
  FOR UPDATE
  USING (agency_user_id = auth.uid())
  WITH CHECK (agency_user_id = auth.uid());

DROP POLICY IF EXISTS b01w_proposals_delete ON agency_proposals;
CREATE POLICY b01w_proposals_delete ON agency_proposals
  FOR DELETE
  USING (agency_user_id = auth.uid());

-- Self-check: fail loudly if RLS or any of the four policies is missing, so
-- a partial apply can never look like success.
DO $$
DECLARE
  rls_on boolean;
  n_policies int;
BEGIN
  SELECT c.relrowsecurity INTO rls_on
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'agency_proposals';
  SELECT count(*) INTO n_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'agency_proposals'
     AND policyname IN ('b01w_proposals_select','b01w_proposals_insert','b01w_proposals_update','b01w_proposals_delete');
  IF rls_on IS DISTINCT FROM true OR n_policies <> 4 THEN
    RAISE EXCEPTION 'b01w: agency_proposals RLS check failed (rls=%, policies=%/4)', rls_on, n_policies;
  END IF;
END $$;

-- Make PostgREST pick up the new policies immediately.
NOTIFY pgrst, 'reload schema';
