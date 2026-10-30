-- Verified outcomes: records actual score changes after a fix was applied and a rescan completed
create table if not exists verified_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  original_scan_id uuid references rankall_scans(id) on delete set null,
  new_scan_id uuid references rankall_scans(id) on delete set null,
  fix_type text not null,
  score_before integer not null,
  score_after integer not null,
  delta integer not null,
  days_elapsed integer not null,
  industry text,
  city text,
  created_at timestamptz default now()
);

create index if not exists verified_outcomes_fix_type_idx on verified_outcomes(fix_type);
create index if not exists verified_outcomes_industry_idx on verified_outcomes(industry);
create index if not exists verified_outcomes_created_at_idx on verified_outcomes(created_at desc);

-- RLS: users can read their own outcomes; service role can insert
alter table verified_outcomes enable row level security;

create policy "Users can read own outcomes"
  on verified_outcomes for select
  using (auth.uid() = user_id);

create policy "Service role can insert outcomes"
  on verified_outcomes for insert
  with check (true);
