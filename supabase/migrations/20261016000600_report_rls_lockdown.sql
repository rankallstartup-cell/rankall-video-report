-- b0fm + ax8b: close direct anon REST access to ownerless scans.
--
-- 20261009000100_p0a_enable_rls.sql made rows with user_id IS NULL publicly
-- readable "by design" (the /r/[id] share funnel). In practice that let
-- anyone with the anon key:
--   * LIST every ownerless scan:   GET /rest/v1/rankall_scans?select=*
--     (full trust_signals JSON, enrichment, competitor, …)
--   * read full AI responses:      GET /rest/v1/rankall_platform_results?scan_id=eq.X
--   * bypass the fix paywall:      GET /rest/v1/generated_fixes?scan_id=eq.X
--   * list competitor rankings:    GET /rest/v1/scan_competitors?scan_id=eq.X
--
-- Every public surface now loads server-side with the service role (which
-- bypasses RLS) and filters by viewer:
--   /report/[id]  -> GET /api/report/[id]   (lib/reportPayload.ts)
--   /r/[id], its OG image, /score/[slug] -> lib/publicShare.ts
--   badge         -> /api/badge/[scanId]
-- so the anon role no longer needs ANY read on ownerless rows. Owner-only
-- SELECT policies remain for the signed-in dashboards.
--
-- Also adds rankall_scans.is_public: the owner's explicit "share" flag for
-- the public share page / badge (set via POST /api/report/[id]).
--
-- Idempotent.

ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- ── rankall_scans: owner only ─────────────────────────────────────────
DROP POLICY IF EXISTS p0a_scans_select ON rankall_scans;
CREATE POLICY p0a_scans_select ON rankall_scans
  FOR SELECT
  USING (user_id = auth.uid());

-- ── generated_fixes: owner only (row owner OR parent-scan owner) ──────
DROP POLICY IF EXISTS p0a_fixes_select ON generated_fixes;
CREATE POLICY p0a_fixes_select ON generated_fixes
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rankall_scans s
      WHERE s.id = generated_fixes.scan_id
        AND s.user_id = auth.uid()
    )
  );

-- ── rankall_platform_results: parent-scan owner only ──────────────────
DROP POLICY IF EXISTS p0a_results_select ON rankall_platform_results;
CREATE POLICY p0a_results_select ON rankall_platform_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rankall_scans s
      WHERE s.id = rankall_platform_results.scan_id
        AND s.user_id = auth.uid()
    )
  );

-- ── scan_competitors: parent-scan owner only ──────────────────────────
DROP POLICY IF EXISTS p0a_competitors_select ON scan_competitors;
CREATE POLICY p0a_competitors_select ON scan_competitors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rankall_scans s
      WHERE s.id = scan_competitors.scan_id
        AND s.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
