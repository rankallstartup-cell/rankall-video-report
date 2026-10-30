-- A5: Alina chat logging tables (chat_sessions, chat_leads).
--
-- SQL-AND-STOP: Nandish runs this in the Supabase SQL editor, STAGING
-- first, then `NOTIFY pgrst, 'reload schema';`. The app NEVER auto-applies
-- it. Until it is run, the chat route logs a "chat logging skipped" line
-- and the chat / lead flow continues normally (degrades honestly).
--
-- PRIVACY: chat_sessions stores NO message content and NO IP — only the
-- session id, the page the widget was on, the tools used, and the
-- outcome. chat_leads stores the lead's own contact details (needed for
-- follow-up) plus whether the email delivery succeeded.
--
-- RETENTION (90 days): rows older than 90 days should be pruned, e.g.
--   DELETE FROM chat_sessions WHERE created_at < now() - interval '90 days';
--   DELETE FROM chat_leads   WHERE created_at < now() - interval '90 days';
-- Run as a scheduled cleanup (or manually). No automatic deletion here.
--
-- RLS: enabled with NO public policies — only service_role (server-side
-- code) can read or write these tables. The anon key can do neither.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  page text NOT NULL DEFAULT '',
  tools_used text[] NOT NULL DEFAULT '{}',
  outcome text NOT NULL CHECK (outcome IN ('scan_started', 'fix_plan_shown', 'lead_captured', 'no_outcome', 'error')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_sessions_session_idx ON chat_sessions (session_id, created_at DESC);
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS chat_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  name text NOT NULL,
  email text NOT NULL,
  business text,
  summary text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('demo', 'enterprise', 'billing', 'bug', 'other')),
  captured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_leads_created_idx ON chat_leads (created_at DESC);
ALTER TABLE chat_leads ENABLE ROW LEVEL SECURITY;
