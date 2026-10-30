-- P0a: enable Row-Level Security on the 8 core tenant tables.
--
-- Access model (matches the app's actual access patterns):
--   * Server-side code uses the service_role key, which BYPASSES RLS — all
--     cron / API-route / lib writes keep working unchanged.
--   * Browser + API clients use the anon key and are scoped by these policies:
--       - Rows with user_id: visible/writable only by their owner (auth.uid()).
--       - Rows with user_id IS NULL: outreach / demo-funnel scans — publicly
--         readable BY DESIGN (the /r/[id] share funnel links to these).
--       - Tables keyed by scan_id only (no user_id column): ownership is
--         derived from the parent rankall_scans row.
--   * scan_cache is server-only (service_role): RLS on, no policies → anon
--     clients get nothing.
--
-- Idempotent: safe to run multiple times (DROP POLICY IF EXISTS guards).
-- NOTE for staging/prod: apply this in the Supabase SQL editor (or via the
-- migration runner) — PostgREST picks it up after `NOTIFY pgrst, 'reload schema'`.

-- ── 1. rankall_scans ──────────────────────────────────────────────────
ALTER TABLE rankall_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p0a_scans_select ON rankall_scans;
CREATE POLICY p0a_scans_select ON rankall_scans
  FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS p0a_scans_insert ON rankall_scans;
CREATE POLICY p0a_scans_insert ON rankall_scans
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p0a_scans_update ON rankall_scans;
CREATE POLICY p0a_scans_update ON rankall_scans
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p0a_scans_delete ON rankall_scans;
CREATE POLICY p0a_scans_delete ON rankall_scans
  FOR DELETE
  USING (user_id = auth.uid());

-- ── 2. generated_fixes ────────────────────────────────────────────────
ALTER TABLE generated_fixes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p0a_fixes_select ON generated_fixes;
CREATE POLICY p0a_fixes_select ON generated_fixes
  FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS p0a_fixes_insert ON generated_fixes;
CREATE POLICY p0a_fixes_insert ON generated_fixes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p0a_fixes_update ON generated_fixes;
CREATE POLICY p0a_fixes_update ON generated_fixes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p0a_fixes_delete ON generated_fixes;
CREATE POLICY p0a_fixes_delete ON generated_fixes
  FOR DELETE
  USING (user_id = auth.uid());

-- ── 3. scan_competitors (ownership via parent scan) ───────────────────
ALTER TABLE scan_competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p0a_competitors_select ON scan_competitors;
CREATE POLICY p0a_competitors_select ON scan_competitors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rankall_scans s
      WHERE s.id = scan_competitors.scan_id
        AND (s.user_id = auth.uid() OR s.user_id IS NULL)
    )
  );

-- ── 4. rankall_platform_results (ownership via parent scan) ───────────
ALTER TABLE rankall_platform_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p0a_results_select ON rankall_platform_results;
CREATE POLICY p0a_results_select ON rankall_platform_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rankall_scans s
      WHERE s.id = rankall_platform_results.scan_id
        AND (s.user_id = auth.uid() OR s.user_id IS NULL)
    )
  );

-- ── 5. fix_predictions (ownership via parent scan) ────────────────────
-- Client writes: /api/fixes/apply (INSERT, session cookie) and the report
-- page's "undo fix" (UPDATE). Both run as the signed-in owner.
ALTER TABLE fix_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p0a_fixpred_select ON fix_predictions;
CREATE POLICY p0a_fixpred_select ON fix_predictions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rankall_scans s
      WHERE s.id = fix_predictions.scan_id
        AND (s.user_id = auth.uid() OR s.user_id IS NULL)
    )
  );

DROP POLICY IF EXISTS p0a_fixpred_insert ON fix_predictions;
CREATE POLICY p0a_fixpred_insert ON fix_predictions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rankall_scans s
      WHERE s.id = fix_predictions.scan_id
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS p0a_fixpred_update ON fix_predictions;
CREATE POLICY p0a_fixpred_update ON fix_predictions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rankall_scans s
      WHERE s.id = fix_predictions.scan_id
        AND s.user_id = auth.uid()
    )
  );

-- ── 6. score_history ──────────────────────────────────────────────────
ALTER TABLE score_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p0a_history_select ON score_history;
CREATE POLICY p0a_history_select ON score_history
  FOR SELECT
  USING (user_id = auth.uid());
-- Writes are server-side only (service_role bypasses RLS): no write policies.

-- ── 7. verified_outcomes ──────────────────────────────────────────────
ALTER TABLE verified_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p0a_outcomes_select ON verified_outcomes;
CREATE POLICY p0a_outcomes_select ON verified_outcomes
  FOR SELECT
  USING (user_id = auth.uid());
-- Writes are server-side only (service_role bypasses RLS): no write policies.

-- ── 8. scan_cache ─────────────────────────────────────────────────────
-- Server-only table (lib/scanCache.ts uses service_role). RLS on with NO
-- policies: anon clients can neither read nor write it.
ALTER TABLE scan_cache ENABLE ROW LEVEL SECURITY;
