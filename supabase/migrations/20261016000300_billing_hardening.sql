-- 20261016000300_billing_hardening.sql — QA billing fix-all.
-- Idempotent: safe to run more than once. Run in the Supabase SQL editor
-- (staging first, then prod). Every piece of code that uses these objects
-- degrades safely until this is applied (see notes per section).

-- ── 1. Stripe webhook idempotency ─────────────────────────────────────────
-- One row per Stripe event id. Until applied, the webhook logs and
-- processes every delivery (no dedupe).
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.stripe_webhook_events enable row level security;
-- No policies: service role only.

-- ── 2. Shared rate limiter ────────────────────────────────────────────────
-- Fixed-window counters keyed by "<bucket>:<subject>:<window start ms>".
-- rate_limit_hit atomically inserts-or-increments and returns the new
-- count. Until applied, lib/rateLimit.checkRateLimitDb falls back to the
-- per-instance in-memory limiter.
create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null,
  expires_at timestamptz not null
);
create index if not exists rate_limits_expires_at_idx on public.rate_limits (expires_at);
alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(p_key text, p_window_start timestamptz, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (key, count, window_start, expires_at)
  values (p_key, 1, p_window_start, p_window_start + make_interval(secs => p_window_seconds))
  on conflict (key) do update set count = r.count + 1
  returning r.count into v_count;
  -- Opportunistic cleanup of long-expired windows.
  delete from public.rate_limits where expires_at < now() - interval '1 day';
  return v_count;
end;
$$;
revoke all on function public.rate_limit_hit(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, timestamptz, integer) to service_role;

-- ── 3. One trial per card ─────────────────────────────────────────────────
-- Every trialing subscription records its card fingerprint. The earliest
-- subscription for a fingerprint keeps its trial; later ones (any account)
-- have their trial ended by the webhook. Until applied, the check fails
-- open (logged).
create table if not exists public.trial_fingerprints (
  id bigserial primary key,
  fingerprint text not null,
  user_id uuid not null,
  stripe_subscription_id text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists trial_fingerprints_fingerprint_idx on public.trial_fingerprints (fingerprint);
create index if not exists trial_fingerprints_user_idx on public.trial_fingerprints (user_id);
alter table public.trial_fingerprints enable row level security;

-- ── 4. Business-key usage: one row per (business, user) ───────────────────
-- b28j stored only the FIRST account per business (primary key
-- business_key), which let a competitor "claim" a business. The check now
-- only blocks accounts that share a trial card with the earlier trialer, so
-- every (business, user) pair is recorded.
create table if not exists public.trial_business_usage (
  business_key text not null,
  user_id uuid not null,
  used_at timestamptz not null default now()
);
alter table public.trial_business_usage drop constraint if exists trial_business_usage_pkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trial_business_usage_business_user_key'
  ) then
    alter table public.trial_business_usage
      add constraint trial_business_usage_business_user_key unique (business_key, user_id);
  end if;
end $$;
alter table public.trial_business_usage enable row level security;

-- ── 5. Money-back guarantee: once per person ──────────────────────────────
-- One row per refund, keyed by user AND card fingerprint. The refund route
-- refuses a second claim by either key, and FAILS CLOSED (points the user
-- to hello@rankall.io) until this table exists.
create table if not exists public.money_back_refunds (
  id bigserial primary key,
  user_id uuid not null,
  card_fingerprint text,
  stripe_customer_id text,
  charge_id text not null unique,
  amount_cents integer,
  currency text,
  created_at timestamptz not null default now()
);
create index if not exists money_back_refunds_user_idx on public.money_back_refunds (user_id);
create index if not exists money_back_refunds_fp_idx on public.money_back_refunds (card_fingerprint);
alter table public.money_back_refunds enable row level security;

-- ── 6. agency_settings RLS (white-label during trial) ─────────────────────
-- agency_settings had no RLS, so any signed-in user (including a trialing
-- one) could upsert white_label_enabled=true straight from the browser with
-- the anon key, bypassing the trial cap in PUT /api/agency/settings.
-- Reads: the owner (agency_user_id = auth.uid()) and that agency's own
-- clients (client portal shows the agency name/email). Writes: NO client
-- policy — all writes go through /api/agency/settings (service role),
-- which enforces the white-label trial cap.
alter table public.agency_settings enable row level security;

drop policy if exists "agency_settings owner read" on public.agency_settings;
create policy "agency_settings owner read"
  on public.agency_settings for select
  using (agency_user_id = auth.uid());

drop policy if exists "agency_settings client read" on public.agency_settings;
create policy "agency_settings client read"
  on public.agency_settings for select
  using (
    exists (
      select 1 from public.agency_clients c
      where c.agency_user_id = agency_settings.agency_user_id
        and c.client_user_id = auth.uid()
    )
  );

-- Remove any permissive write policies that may have been added by hand.
drop policy if exists "agency_settings owner write" on public.agency_settings;
drop policy if exists "agency_settings owner insert" on public.agency_settings;
drop policy if exists "agency_settings owner update" on public.agency_settings;

notify pgrst, 'reload schema';
