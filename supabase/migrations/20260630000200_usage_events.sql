-- Phase 2: optional analytics log for expensive requests (scans, AI inbox, etc.).
-- Written best-effort by lib/usageLog.ts; the app never depends on this table.

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ts timestamptz DEFAULT now(),
  user_id uuid,
  plan text,
  feature text NOT NULL,
  success boolean,
  cache_hit boolean DEFAULT false,
  duration_ms integer,
  platform_count integer,
  error text
);

CREATE INDEX IF NOT EXISTS usage_events_feature_idx ON usage_events(feature, ts);
CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events(user_id, ts);
