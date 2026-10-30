-- Add crawler check results to scan records for analytics
-- (how many prospects block AI crawlers?)
ALTER TABLE rankall_scans
  ADD COLUMN IF NOT EXISTS crawler_blocked_bots text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS crawler_check_raw jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS crawler_check_done boolean DEFAULT false;
