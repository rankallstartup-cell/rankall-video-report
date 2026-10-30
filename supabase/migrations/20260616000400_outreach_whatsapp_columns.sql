-- I/G: WhatsApp + Apollo outreach support
-- Additive columns so the WhatsApp sender and Apollo webhook can log/dedupe.
-- Safe to run multiple times.

-- outreach_log: add channel + phone (table is created by the outreach email flow)
ALTER TABLE IF EXISTS outreach_log ADD COLUMN IF NOT EXISTS channel text DEFAULT 'email';
ALTER TABLE IF EXISTS outreach_log ADD COLUMN IF NOT EXISTS phone   text;

-- outreach_unsubscribes: support phone-based opt-out for WhatsApp
ALTER TABLE IF EXISTS outreach_unsubscribes ADD COLUMN IF NOT EXISTS phone text;


-- If outreach_log doesn't exist yet (fresh env), create a minimal version
CREATE TABLE IF NOT EXISTS outreach_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text,
  email         text,
  phone         text,
  city          text,
  industry      text,
  scan_id       uuid,
  channel       text DEFAULT 'email',
  score         integer,
  status        text DEFAULT 'sent',
  sent_at       timestamptz NOT NULL DEFAULT now()
);

-- [reconcile:outreach_log] outreach_log may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE TABLE IF NOT EXISTS outreach_unsubscribes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text,
  phone      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- [reconcile:outreach_unsubscribes] outreach_unsubscribes may already exist with a different set of columns
-- (it did on production). Make sure every column this file uses exists.
ALTER TABLE outreach_unsubscribes ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE outreach_unsubscribes ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE outreach_unsubscribes ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE outreach_unsubscribes ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- (index moved below the CREATE TABLE so this file also works on a fresh database)
CREATE INDEX IF NOT EXISTS outreach_unsubscribes_phone_idx ON outreach_unsubscribes(phone);
