-- Recommendation Simulator tracking

CREATE TABLE IF NOT EXISTS simulation_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid,
  user_id uuid,
  current_score integer,
  projected_score integer,
  revenue_recovered numeric,
  industry text,
  viewed_at timestamptz DEFAULT now(),
  converted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS sim_views_scan_idx ON simulation_views(scan_id);
CREATE INDEX IF NOT EXISTS sim_views_converted_idx ON simulation_views(converted);
