-- Scan result cache — prevents repeated AI-platform API cost for the same query.

CREATE TABLE IF NOT EXISTS scan_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text UNIQUE NOT NULL,
  scan_id uuid,
  results jsonb,
  score integer,
  country_code text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS scan_cache_key_idx ON scan_cache(cache_key);
CREATE INDEX IF NOT EXISTS scan_cache_expires_idx ON scan_cache(expires_at);
