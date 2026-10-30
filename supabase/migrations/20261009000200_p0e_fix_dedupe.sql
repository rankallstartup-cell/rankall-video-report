-- rerun-safe: the DELETE only removes duplicate (scan_id, fix_type) rows and the
-- UNIQUE constraint (added below) stops new duplicates, so later runs delete nothing.
-- P0e: unify the fix pipeline on generated_fixes.
--
-- 1. Delete duplicate (scan_id, fix_type) rows, keeping the newest. (DB
--    inspection found zero such pairs in prod, so this is belt-and-braces.)
-- 2. Add a UNIQUE constraint so the check-then-insert race in
--    lib/generateFix.ts can never create duplicates, even under concurrent
--    generation (outreach send-email fires 3 generations via Promise.allSettled;
--    /api/generate-fix is directly reachable).
--
-- Cross-scan triplication (same fix_type × N scan_ids, e.g. jsonld ×17) is
-- fixed in code (lib/generateFix.ts cross-scan dedupe + lib/fixes.ts read-time
-- dedupe), not here — those rows are legitimate history, one per scan.
--
-- Idempotent: safe to run multiple times.
-- NOTE: apply in the Supabase SQL editor (like the P0a RLS migration), then
-- run NOTIFY pgrst, 'reload schema';

DELETE FROM generated_fixes
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY scan_id, fix_type
             ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM generated_fixes
  ) ranked
  WHERE rn > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generated_fixes_scan_fix_unique'
  ) THEN
    ALTER TABLE generated_fixes
      ADD CONSTRAINT generated_fixes_scan_fix_unique
      UNIQUE (scan_id, fix_type);
  END IF;
END $$;
