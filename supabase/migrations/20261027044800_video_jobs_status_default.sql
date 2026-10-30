-- video_jobs: DEFAULT for the NOT NULL status column.
--
-- Why (proven Oct 26, Vercel runtime logs 11:33–11:43 PM CDT): every
-- saveResume upsert failed with `null value in column "status" of
-- relation "video_jobs" violates not-null constraint`, so no input
-- checkpoint, no continuation claim, and no stage checkpoint ever
-- persisted — jobs stalled at script and the watchdog failed them.
--
-- Postgres upsert gotcha behind it: an upsert validates NOT NULL on the
-- PROPOSED row even when the row already exists and the operation is
-- really an update. lib/video/jobStore.ts saveResume() by design upserts
-- ONLY { job_id, resume_context, updated_at } (save() owns job columns),
-- so any NOT NULL column it omits MUST have a DEFAULT or every
-- saveResume fails. The fix belongs in the schema, not in the payload:
-- stuffing status into saveResume would break the save()/saveResume()
-- column separation the code documents.
--
-- Column-by-column audit of public.video_jobs (from
-- 20261027034157_video_jobs.sql): job_id is the PRIMARY KEY (always
-- supplied by every upsert); scan_id, business_name, video_url,
-- heygen_video_id, avatar_id, script_source, error, failed_stage,
-- stages, costs, warnings, total_latency_ms, resume_context are all
-- nullable; created_at and updated_at are NOT NULL WITH DEFAULT now().
-- status was the ONLY NOT NULL column WITHOUT a default — fixed here.
--
-- HOW THIS FILE IS APPLIED (same hackathon branch exception as the
-- original file): this branch has no staging-merge pipeline, so paste
-- this whole file into the Supabase SQL editor and Run it.
-- Rerun-safe: ALTER COLUMN ... SET DEFAULT is idempotent (setting the
-- same default twice is a no-op). No data change is needed: status is
-- NOT NULL, so no NULL values can exist to backfill. RLS and policies
-- are untouched (ALTER COLUMN does not affect them).

ALTER TABLE public.video_jobs ALTER COLUMN status SET DEFAULT 'processing';

-- Make the API see the change immediately.
NOTIFY pgrst, 'reload schema';
