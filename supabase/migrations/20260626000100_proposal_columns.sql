-- Additional columns for Agency Proposal Builder

ALTER TABLE agency_proposals ADD COLUMN IF NOT EXISTS prospect_city text;
ALTER TABLE agency_proposals ADD COLUMN IF NOT EXISTS prospect_state text;
ALTER TABLE agency_proposals ADD COLUMN IF NOT EXISTS prospect_score numeric;
ALTER TABLE agency_proposals ADD COLUMN IF NOT EXISTS prospect_competitor_score numeric;
ALTER TABLE agency_proposals ADD COLUMN IF NOT EXISTS prospect_industry text;
ALTER TABLE agency_proposals ADD COLUMN IF NOT EXISTS agency_name text;
