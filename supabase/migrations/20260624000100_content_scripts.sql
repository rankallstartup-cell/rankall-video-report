CREATE TABLE IF NOT EXISTS tiktok_scripts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  format text,
  hook text,
  body text,
  cta text,
  hashtags text[],
  industry text,
  city text,
  full_script text,
  posted boolean DEFAULT false,
  generated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linkedin_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_type text,
  content text,
  scheduled_for date,
  posted boolean DEFAULT false,
  generated_at timestamptz DEFAULT now()
);
