CREATE TABLE IF NOT EXISTS user_integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  integration_type text NOT NULL,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  site_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, integration_type)
);

CREATE TABLE IF NOT EXISTS gsc_ai_impressions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  ai_overview_impressions integer DEFAULT 0,
  ai_mode_impressions integer DEFAULT 0,
  regular_impressions integer DEFAULT 0,
  ai_ctr numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ucp_waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  business_name text,
  joined_at timestamptz DEFAULT now()
);
