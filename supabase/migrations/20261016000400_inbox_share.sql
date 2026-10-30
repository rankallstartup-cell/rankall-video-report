-- AI Inbox results are private to their owner unless explicitly shared.
-- /api/inbox/[id] used to return any user's saved search to anyone with
-- the id; it now requires the owner's session OR is_shared = true, which
-- only the owner can set (POST /api/inbox/[id] {action:'share'}, the
-- "Share Results" button). Until this migration runs, shared links show
-- "not found" to non-owners (fail closed).
ALTER TABLE IF EXISTS ai_inbox_searches ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS ai_inbox_searches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_inbox_searches' AND policyname = 'ai_inbox_searches_owner_select'
  ) THEN
    CREATE POLICY ai_inbox_searches_owner_select ON ai_inbox_searches
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
