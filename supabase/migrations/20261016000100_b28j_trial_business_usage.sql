-- b28j: one trial per business.
-- A trialing scan records the business key (normalized scan input) here.
-- A different trialing account scanning the same business is blocked in
-- the scan route. Only TRIALING scans record usage; paid and free scans
-- never consume a business's trial.
--
-- Nandish: run in the Supabase SQL editor (staging first, then prod).
-- Until applied, the scan route FAILS OPEN (no block) — see
-- lib/trialAntiAbuse.checkTrialBusinessUsed.
--
-- To manually clear a business's trial (e.g. support override for a
-- legitimate second trial): delete from trial_business_usage where
-- business_key = '<normalized business input>';

create table if not exists public.trial_business_usage (
  business_key text primary key,
  user_id uuid not null,
  used_at timestamptz not null default now()
);

alter table public.trial_business_usage enable row level security;
-- No permissive policies: only the service-role key (server routes)
-- reads/writes this table. No client access.
