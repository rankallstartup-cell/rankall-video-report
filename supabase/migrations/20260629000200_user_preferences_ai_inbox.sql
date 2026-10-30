-- User email/notification preferences + AI inbox search history

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY,
  weekly_report boolean DEFAULT true,
  competitor_alerts boolean DEFAULT true,
  milestone_emails boolean DEFAULT true,
  fix_recommendations boolean DEFAULT true,
  marketing_emails boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- [reconcile:user_preferences] user_preferences may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS weekly_report boolean;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS competitor_alerts boolean;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS milestone_emails boolean;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS fix_recommendations boolean;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS marketing_emails boolean;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS ai_inbox_searches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  query text,
  results jsonb,
  created_at timestamptz DEFAULT now()
);

-- [reconcile:ai_inbox_searches] ai_inbox_searches may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE ai_inbox_searches ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE ai_inbox_searches ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE ai_inbox_searches ADD COLUMN IF NOT EXISTS query text;
ALTER TABLE ai_inbox_searches ADD COLUMN IF NOT EXISTS results jsonb;
ALTER TABLE ai_inbox_searches ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE INDEX IF NOT EXISTS ai_inbox_searches_user_idx ON ai_inbox_searches(user_id);
