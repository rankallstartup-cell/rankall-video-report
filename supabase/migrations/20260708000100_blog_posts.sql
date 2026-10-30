-- Matches the actual production blog_posts schema.
CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  industry text,
  city text,
  state text,
  meta_description text,
  excerpt text,
  published boolean DEFAULT true,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  published_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_slug_idx ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_industry_idx ON blog_posts(industry, city);
