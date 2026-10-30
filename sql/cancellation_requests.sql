-- Run in Supabase SQL editor

create table if not exists cancellation_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  reason           text not null,
  feedback         text,
  offered_discount boolean not null default false,
  accepted_offer   boolean not null default false,
  cancelled_at     timestamptz not null default now()
);

alter table cancellation_requests enable row level security;

create policy "Users can read own cancellation requests"
  on cancellation_requests for select
  using (auth.uid() = user_id);
