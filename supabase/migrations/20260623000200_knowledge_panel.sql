-- Knowledge Panel feature migration

ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS knowledge_panel_exists boolean DEFAULT false;
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS knowledge_panel_claimed boolean DEFAULT false;
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS knowledge_panel_completeness integer DEFAULT 0;
ALTER TABLE rankall_scans ADD COLUMN IF NOT EXISTS knowledge_panel_data jsonb;

CREATE TABLE IF NOT EXISTS knowledge_panel_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid UNIQUE,
  result jsonb,
  cached_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kp_cache_user_idx ON knowledge_panel_cache(user_id);
CREATE INDEX IF NOT EXISTS kp_cache_cached_at_idx ON knowledge_panel_cache(cached_at);

CREATE TABLE IF NOT EXISTS knowledge_panel_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  scan_id uuid,
  exists boolean,
  claimed boolean,
  completeness integer,
  checked_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kp_history_user_idx ON knowledge_panel_history(user_id);
