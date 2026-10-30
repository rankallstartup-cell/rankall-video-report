-- Extend agency_invites to track which user accepted
ALTER TABLE IF EXISTS agency_invites ADD COLUMN IF NOT EXISTS client_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Extend agency_clients to track the linked Supabase user (from invite accept)
ALTER TABLE IF EXISTS agency_clients ADD COLUMN IF NOT EXISTS client_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS agency_clients ADD COLUMN IF NOT EXISTS contact_name   text;
ALTER TABLE IF EXISTS agency_clients ADD COLUMN IF NOT EXISTS status         text DEFAULT 'active';

-- Unique constraint for upsert on invite accept
CREATE UNIQUE INDEX IF NOT EXISTS agency_clients_agency_client_idx ON agency_clients(agency_user_id, client_user_id)
  WHERE client_user_id IS NOT NULL;
