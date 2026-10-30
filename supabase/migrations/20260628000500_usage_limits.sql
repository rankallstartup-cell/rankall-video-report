-- Usage tracking + atomic monthly increment

CREATE TABLE IF NOT EXISTS usage_tracking (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  feature_key text NOT NULL,
  month text NOT NULL,
  count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, feature_key, month)
);

CREATE INDEX IF NOT EXISTS usage_tracking_user_month_idx
  ON usage_tracking(user_id, month);

CREATE INDEX IF NOT EXISTS usage_tracking_feature_idx
  ON usage_tracking(user_id, feature_key, month);

-- Atomic increment: insert with count 1, or bump existing row by 1.
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id uuid,
  p_feature_key text,
  p_month text
) RETURNS void AS $$
BEGIN
  INSERT INTO usage_tracking(user_id, feature_key, month, count)
  VALUES (p_user_id, p_feature_key, p_month, 1)
  ON CONFLICT (user_id, feature_key, month)
  DO UPDATE SET
    count = usage_tracking.count + 1,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;
