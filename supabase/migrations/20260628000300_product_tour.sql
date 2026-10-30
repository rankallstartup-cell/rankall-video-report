CREATE TABLE IF NOT EXISTS product_tour (
  id text PRIMARY KEY,
  steps jsonb,
  generated_at timestamptz DEFAULT now()
);
