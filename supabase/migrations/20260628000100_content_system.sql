-- Content System: educational TikTok / social content pieces.
-- Strictly educational. No fake claims, no fake customers — generation enforces this.

CREATE TABLE IF NOT EXISTS content_pieces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  content_type text NOT NULL,          -- live_scan | competitor_reveal | ai_education | fix_breakdown | case_study | founder_story
  format text,                         -- platform format hint (e.g. tiktok_vertical)
  platform text DEFAULT 'tiktok',      -- tiktok | reels | shorts | linkedin
  hook text,
  script text,
  captions text,
  shot_list text,
  cta text,
  hashtags text[] DEFAULT '{}',
  scan_id uuid,
  status text DEFAULT 'draft',         -- draft | scripted | filmed | posted
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- [reconcile:content_pieces] content_pieces may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS content_type text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS format text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS hook text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS script text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS captions text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS shot_list text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS cta text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS hashtags text[];
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS content_pieces_user_idx ON content_pieces(user_id);
CREATE INDEX IF NOT EXISTS content_pieces_status_idx ON content_pieces(user_id, status);
CREATE INDEX IF NOT EXISTS content_pieces_type_idx ON content_pieces(user_id, content_type);
