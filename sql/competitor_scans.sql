-- Run in Supabase SQL editor

create table if not exists competitor_scans (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  scan_id                   uuid references rankall_scans(id) on delete set null,
  competitor_name           text not null,
  competitor_score          int  not null default 0,
  competitor_trust_score    int  not null default 0,
  competitor_platforms_count int not null default 0,
  scanned_at                timestamptz not null default now()
);

create index if not exists competitor_scans_user_id_idx on competitor_scans (user_id);
create index if not exists competitor_scans_scanned_at_idx on competitor_scans (scanned_at);

alter table competitor_scans enable row level security;

create policy "Users can read own competitor scans"
  on competitor_scans for select
  using (auth.uid() = user_id);

create policy "Users can insert own competitor scans"
  on competitor_scans for insert
  with check (auth.uid() = user_id);
