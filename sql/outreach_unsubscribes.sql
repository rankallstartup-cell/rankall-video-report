-- Run in Supabase SQL editor

create table if not exists outreach_unsubscribes (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  unsubscribed_at  timestamptz not null default now()
);

create index if not exists outreach_unsubscribes_email_idx on outreach_unsubscribes (email);

alter table outreach_unsubscribes enable row level security;
