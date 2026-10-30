-- 20261017_outreach_sequence_variant.sql — Outreach #7: sequence robustness.
-- Idempotent: safe to run more than once. Run in the Supabase SQL editor
-- (staging first, then prod). Nandish runs the prod SQL BEFORE the PR that
-- uses these columns merges (standing rule: SQL first, then merge).
--
-- Two columns on outreach_sequence_log:
--   variant     — A/B test variant for Day-1 subjects ('A' | 'B'), NULL for
--                 all other touches and for rows sent before the A/B test.
--   claimed_at  — when the row was claimed for sending ('sending' status).
--                 Lets a later run reclaim a claim left stale by a crashed
--                 cron run, without ever double-sending (the Resend call
--                 carries an Idempotency-Key derived from the row id).
--
-- 'sending' is a transient claim status: pending -> sending -> sent/skipped/
-- error/stopped. Until this migration runs, the cron degrades to the old
-- behavior (no claims, no variants, default Day-1 subject) instead of
-- crashing — see sequenceColumnsSupported() in lib/outreachSequences.ts.

ALTER TABLE outreach_sequence_log ADD COLUMN IF NOT EXISTS variant text;
ALTER TABLE outreach_sequence_log ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS seq_log_variant_idx
  ON outreach_sequence_log(sequence_day, variant, sent_at);

COMMENT ON COLUMN outreach_sequence_log.variant IS
  'Outreach #7: A/B variant for Day-1 subjects (A = control, B = alternate). NULL for other touches.';
COMMENT ON COLUMN outreach_sequence_log.claimed_at IS
  'Outreach #7: when the row was claimed for sending. Claims older than 30 min are treated as crashed and may be reclaimed.';
