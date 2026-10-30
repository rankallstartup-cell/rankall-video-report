-- Phase 4: link a verified_outcomes row back to the generated_fixes row it came
-- from, so verification results (verified / needs_reinforcement + score_after) can
-- be written back onto the generated fix. Idempotent.

ALTER TABLE verified_outcomes ADD COLUMN IF NOT EXISTS generated_fix_id uuid;
CREATE INDEX IF NOT EXISTS vo_generated_fix_idx ON verified_outcomes(generated_fix_id);
