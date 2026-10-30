-- 20261017_outreach_pipeline_log.sql — Outreach improvement #5: nightly prospect pipeline.
-- Idempotent: safe to run more than once. Run in the Supabase SQL editor
-- (staging first, then prod). Nandish runs the prod SQL BEFORE the PR that
-- uses these tables merges (standing rule: SQL first, then merge).
--
-- One table:
--   outreach_pipeline_log — one row per pipeline attempt (prospect, outcome,
--   scan_id or error). The nightly spend cap is enforced by counting today's
--   rows with outcome in ('scanned', 'failed', 'scanned_enroll_failed'), so
--   the cap survives restarts and overlapping runs.
--
-- The prospect queue itself needs NO new table: prospects live in the
-- existing outreach_targets (seeded rows carry status 'queued') and
-- outreach_intelligence (status 'new', promoted into outreach_targets).
-- Until applied, the pipeline cron route returns 500 (missing-table) — the
-- route must not be deployed before this migration runs on that project.

create table if not exists public.outreach_pipeline_log (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  source text not null,          -- outreach_targets | outreach_intelligence | prospect_seed
  source_id uuid,
  business_name text,
  email text,
  outcome text not null,         -- scanned | cached | enrolled_only | failed | scanned_enroll_failed | skipped_*
  scan_id uuid,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists outreach_pipeline_log_run_date_idx on public.outreach_pipeline_log(run_date, outcome);
create index if not exists outreach_pipeline_log_source_idx on public.outreach_pipeline_log(source, source_id);

alter table public.outreach_pipeline_log enable row level security;
-- No policies: service-role only (same pattern as gold_label_reviews).
