-- Run in Supabase SQL editor

create table if not exists outreach_log (
  id            uuid primary key default gen_random_uuid(),
  business_name text not null,
  email         text not null,
  city          text not null,
  industry      text not null,
  scan_id       uuid references rankall_scans(id) on delete set null,
  score         int  not null default 0,
  sent_at       timestamptz not null default now(),
  status        text not null default 'sent'
);

create index if not exists outreach_log_sent_at_idx on outreach_log (sent_at desc);

alter table outreach_log enable row level security;
