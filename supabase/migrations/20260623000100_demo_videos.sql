CREATE TABLE IF NOT EXISTS demo_videos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  script text,
  audio_url text,
  demo_page_url text,
  scan_data jsonb,
  created_at timestamptz DEFAULT now()
);
