CREATE TABLE IF NOT EXISTS market_index_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month text UNIQUE,
  data jsonb,
  generated_at timestamptz DEFAULT now()
);
