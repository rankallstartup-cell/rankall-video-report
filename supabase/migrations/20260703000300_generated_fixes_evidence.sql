-- Evidence + traceability columns for generated_fixes. Idempotent.

ALTER TABLE generated_fixes ADD COLUMN IF NOT EXISTS why_recommended text;
ALTER TABLE generated_fixes ADD COLUMN IF NOT EXISTS triggered_by_signal text;
ALTER TABLE generated_fixes ADD COLUMN IF NOT EXISTS triggered_by_finding text;
ALTER TABLE generated_fixes ADD COLUMN IF NOT EXISTS platform_evidence text;
ALTER TABLE generated_fixes ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'predicted';
ALTER TABLE generated_fixes ADD COLUMN IF NOT EXISTS evidence_source text DEFAULT 'auto_after_scan';
