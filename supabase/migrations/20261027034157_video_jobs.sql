-- video jobs
--
-- Why: video-report jobs lived in a per-instance module Map, so a job
-- accepted on one Vercel instance (202) vanished from later polls routed
-- to other instances (proven Oct 26: first poll "processing", then 7
-- consecutive 404 "Job not found"). Durable job state is the fix.
-- Code that needs it: lib/video/jobStore.ts,
-- app/api/hackathon/video-report/route.ts (POST/GET),
-- app/api/hackathon/video-report/jobs/route.ts,
-- app/hackathon/video-report/jobs/page.tsx.
--
-- HOW THIS FILE IS APPLIED (hackathon branch exception): this branch has
-- no staging-merge pipeline, so the normal `.github/workflows/db-migrate`
-- path does not apply. Paste this whole file into the Supabase SQL editor
-- and Run it. It is safe to run twice (see below).
-- Until it runs, the video-report API returns an explicit, honest 503
-- 'job_store_unavailable' instead of accepting jobs it cannot track —
-- a visible error beats invisible job loss.
--
-- RULES (checked automatically by `npm run db:check` and in every PR):
--   * Must be safe to run twice: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--     DROP POLICY IF EXISTS before CREATE POLICY, DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT.
--   * No BEGIN/COMMIT (each file already runs in one transaction).
--   * Data changes (UPDATE/DELETE/INSERT) need a "-- rerun-safe: <why>" comment.
--   * New tables: ENABLE ROW LEVEL SECURITY + policies in this same file.
--   * App code must keep working if this migration has not run yet.
--   * Never edit a migration after it has been merged — write a new one.

-- One row per video-report job. scan_id is deliberately NOT a foreign key:
-- scan rows live in rankall_scans (uuid) while this branch table uses the
-- API's text job/scan identifiers, and a hard FK would couple the
-- hackathon branch table to the scan table's exact column type.
CREATE TABLE IF NOT EXISTS public.video_jobs (
  job_id text PRIMARY KEY,
  scan_id text,
  business_name text,
  status text NOT NULL CHECK (status IN ('processing', 'complete', 'failed')),
  video_url text,
  heygen_video_id text,
  avatar_id text,
  script_source text,
  error text,
  failed_stage text,
  stages jsonb,
  costs jsonb,
  warnings jsonb,
  total_latency_ms bigint,
  resume_context jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Newest-first job listing (jobs dashboard + jobs API).
CREATE INDEX IF NOT EXISTS video_jobs_created_at_idx ON public.video_jobs (created_at DESC);
-- Jobs for one scan (delivery page / regenerate lookups).
CREATE INDEX IF NOT EXISTS video_jobs_scan_id_idx ON public.video_jobs (scan_id);

ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

-- Only server-side (service-role) access is intended. The service role
-- bypasses RLS; this policy documents that intent. There is deliberately
-- NO policy for anon or authenticated: with RLS enabled they are denied
-- by default, so no client-side key can read or write job rows.
DROP POLICY IF EXISTS video_jobs_service_role_all ON public.video_jobs;
CREATE POLICY video_jobs_service_role_all ON public.video_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.video_jobs TO service_role;

-- Make the API see the change immediately.
NOTIFY pgrst, 'reload schema';
