-- Durable per-IP rate limits for public, unauthenticated endpoints
-- (/api/contact, /api/chat). The in-memory limiter resets on every
-- serverless cold start and is per-instance, so it cannot stop a spammer
-- on its own. Rows store a truncated SHA-256 of the IP, never the raw IP.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.public_form_events (
  id          bigserial PRIMARY KEY,
  kind        text        NOT NULL,          -- 'contact' | 'chat'
  ip_hash     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_form_events_kind_ip_created_idx
  ON public.public_form_events (kind, ip_hash, created_at DESC);

-- Service-role only: RLS on, no policies for anon/authenticated.
ALTER TABLE public.public_form_events ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
