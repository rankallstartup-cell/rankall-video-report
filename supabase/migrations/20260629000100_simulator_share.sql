-- Phase 15: shareable public simulator projections.
-- simulation_views already exists (20260626000200_simulator.sql) — add share columns.

ALTER TABLE simulation_views ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;
ALTER TABLE simulation_views ADD COLUMN IF NOT EXISTS share_id text UNIQUE;
ALTER TABLE simulation_views ADD COLUMN IF NOT EXISTS projection_data jsonb;

CREATE INDEX IF NOT EXISTS sim_views_share_idx ON simulation_views(share_id);
