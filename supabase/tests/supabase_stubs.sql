-- Minimal stand-ins for what a real Supabase project already provides, so the
-- migration test (scripts/db/test-migrations.sh) can run on a plain Postgres
-- in CI. Used ONLY by that test — never applied to staging or production.
--
-- Provides: the anon / authenticated / service_role roles, the auth schema
-- with auth.users, auth.uid(), auth.jwt(), auth.role(), auth.email(), and the
-- extensions schema with pgcrypto + uuid-ossp (gen_random_uuid() is built in).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text,
  raw_app_meta_data  jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() ->> 'email'
$$;

GRANT USAGE ON SCHEMA auth, extensions TO anon, authenticated, service_role;

-- Supabase puts the extensions schema on the search path (so gen_random_bytes()
-- etc. work unqualified). Mirror that for every later connection to this test DB.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = "$user", public, extensions', current_database());
END $$;
