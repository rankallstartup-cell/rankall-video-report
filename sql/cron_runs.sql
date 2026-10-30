-- ax74: cron run log — makes cron failures visible in admin health.
-- Run this in your Supabase SQL editor (staging + prod). Until it runs,
-- logCronRun() no-ops and admin health reports "not configured".
create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null check (status in ('ok', 'partial', 'failed')),
  sent int not null default 0,
  failed int not null default 0,
  error text,
  ran_at timestamptz not null default now()
);
create index if not exists cron_runs_job_ran_idx on cron_runs (job, ran_at desc);
alter table cron_runs enable row level security;
-- Service-role (crons + admin health) bypasses RLS; no user-facing reads.
