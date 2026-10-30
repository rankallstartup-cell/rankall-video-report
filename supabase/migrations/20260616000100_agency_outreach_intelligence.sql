-- ============================================================
-- Migration: Agency + Outreach Intelligence tables
-- Run in Supabase SQL editor
-- ============================================================

-- F: Outreach intelligence (hot leads from scans)
CREATE TABLE IF NOT EXISTS outreach_intelligence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id         uuid REFERENCES rankall_scans(id) ON DELETE SET NULL,
  business_name   text,
  email           text,
  score           integer,
  country_code    text,
  status          text NOT NULL DEFAULT 'new',   -- new | contacted | engaged | converted | unsubscribed
  tracking_token  text UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  last_engaged_at timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_intelligence_status_idx   ON outreach_intelligence(status);
CREATE INDEX IF NOT EXISTS outreach_intelligence_score_idx    ON outreach_intelligence(score DESC);
CREATE INDEX IF NOT EXISTS outreach_intelligence_country_idx  ON outreach_intelligence(country_code);

-- F: Outreach events (open/click tracking)
CREATE TABLE IF NOT EXISTS outreach_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL,
  event       text NOT NULL,  -- open | click
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_events_token_idx ON outreach_events(token);

-- H: Agency clients
CREATE TABLE IF NOT EXISTS agency_clients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name      text,
  client_email     text,
  business_name    text,
  location         text,
  country_code     text,
  query            text,
  latest_scan_id   uuid REFERENCES rankall_scans(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_clients_agency_idx ON agency_clients(agency_user_id);

-- H: Agency invites
CREATE TABLE IF NOT EXISTS agency_invites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_email     text NOT NULL,
  client_name      text,
  business_name    text,
  token            text UNIQUE NOT NULL,
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_invites_token_idx ON agency_invites(token);

-- RLS policies
ALTER TABLE outreach_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_invites         ENABLE ROW LEVEL SECURITY;

-- outreach_intelligence: admins only (service role bypasses RLS)
DROP POLICY IF EXISTS "admin_outreach_intelligence" ON outreach_intelligence;
CREATE POLICY "admin_outreach_intelligence" ON outreach_intelligence
  USING (auth.jwt() ->> 'email' IN ('rankallstartup@gmail.com','n4nandish@gmail.com','n4nandish@googlemail.com'));

-- outreach_events: insert-only from tracking pixel (anon)
DROP POLICY IF EXISTS "insert_outreach_events" ON outreach_events;
CREATE POLICY "insert_outreach_events" ON outreach_events
  FOR INSERT TO service_role WITH CHECK (true);  -- was: any role (Oct 2026 fix); every writer is server-side

-- agency_clients: owner only
DROP POLICY IF EXISTS "agency_clients_owner" ON agency_clients;
CREATE POLICY "agency_clients_owner" ON agency_clients
  USING (agency_user_id = auth.uid());

-- agency_invites: owner only
DROP POLICY IF EXISTS "agency_invites_owner" ON agency_invites;
CREATE POLICY "agency_invites_owner" ON agency_invites
  USING (agency_user_id = auth.uid());
