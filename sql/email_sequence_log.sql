-- Run this in your Supabase SQL editor to create the email sequence log table.

create table if not exists email_sequence_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  trigger_event text not null,
  scan_id       uuid references rankall_scans(id) on delete set null,
  sent_at       timestamptz not null default now()
);

-- Unique constraint prevents sending the same sequence email twice per user
create unique index if not exists email_sequence_log_user_event_uidx
  on email_sequence_log (user_id, trigger_event);

-- RLS: users can only read their own logs; inserts are done server-side
alter table email_sequence_log enable row level security;

create policy "Users can read own email logs"
  on email_sequence_log for select
  using (auth.uid() = user_id);
