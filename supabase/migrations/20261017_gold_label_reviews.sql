-- 20261017_gold_label_reviews.sql — Labeling Phase 2a: gold-set tooling.
-- Idempotent: safe to run more than once. Run in the Supabase SQL editor
-- (staging first, then prod). Nandish runs the prod SQL BEFORE the PR that
-- uses these tables merges (standing rule: SQL first, then merge).
--
-- Two tables:
--   gold_label_reviews — one row per (scan, reviewer, label field).
--     Human verdicts on the system labels. System labels in data_labels
--     are NEVER overwritten — gold verdicts live only here.
--   gold_scan_status — one row per scan: pending / gold / needs_adjudication,
--     plus explicit adjudication provenance when an admin resolves a
--     conflict by hand.
-- Until applied, the gold-label API routes return 503 migration_pending
-- and the admin page shows a "migration pending" notice (no crash, no
-- fake data).

-- ── 1. Per-field human reviews ────────────────────────────────────────────
create table if not exists public.gold_label_reviews (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  reviewer text not null,
  field_name text not null,
  system_value text,
  verdict text not null check (verdict in ('agree', 'disagree')),
  corrected_value text,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (scan_id, reviewer, field_name)
);
create index if not exists gold_label_reviews_scan_idx on public.gold_label_reviews (scan_id);
create index if not exists gold_label_reviews_reviewer_idx on public.gold_label_reviews (reviewer);
alter table public.gold_label_reviews enable row level security;
-- No policies: service role only. Reviewer identity always comes from the
-- server-verified session (auth.getUser), never a client-supplied field.

-- ── 2. Per-scan gold status + adjudication ────────────────────────────────
create table if not exists public.gold_scan_status (
  scan_id uuid primary key,
  status text not null check (status in ('pending', 'gold', 'needs_adjudication')),
  gold_at timestamptz,
  adjudicated_by text,
  adjudicated_at timestamptz,
  adjudication_notes text,
  final_values jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gold_scan_status enable row level security;
-- No policies: service role only.
