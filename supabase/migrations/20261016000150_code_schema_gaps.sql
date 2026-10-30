-- Close the gaps between what the app code reads/writes and what the staging
-- and production databases actually contain (audit of 2026-10-17, read-only
-- catalog queries on both projects). Additive only: no column, row or table is
-- removed. Runs BEFORE 20261016000200_backfill_app_metadata_plan, which needs
-- subscriptions.trial_end.
--
-- Anything another migration in this folder already creates is NOT repeated
-- here (on production those older files run first in the same deploy).
-- rerun-safe: every UPDATE below only fills values that are still NULL, so a
-- second run finds nothing to change.

-- ── 1. subscriptions: billing could not record anything ─────────────────────
-- lib/stripeWebhook.ts buildSubscriptionUpsert, app/api/billing/webhook/route.ts
-- (upsert onConflict 'user_id', .eq('stripe_customer_id')), app/api/cron/expire-trials.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_end timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency text;
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx ON public.subscriptions (stripe_customer_id);

DO $$
BEGIN
  -- onConflict 'user_id' needs a unique constraint (0 duplicate user_ids on both DBs).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.subscriptions'::regclass AND conname = 'subscriptions_user_id_key') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;

  -- Production's user_id foreign key points at the legacy public.users table,
  -- which is EMPTY, so every subscription insert failed. Point it at auth.users
  -- like every other table.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'f'
      AND confrelid = 'auth.users'::regclass
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Production's status CHECK rejected values the code writes
-- (lib/stripeWebhook.ts mapStripeStatus, webhook cancel/expire, expire-trials cron).
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IS NULL OR status = ANY (ARRAY[
    'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired',
    'paused', 'canceled', 'cancelled', 'expired'
  ]::text[]));

-- ── 2. profiles.account_type (webhook + expire-trials upsert it) ──────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type text;

-- ── 3. unique keys that upserts rely on ──────────────────────────────────────
DO $$
BEGIN
  -- app/api/generate-fixes upsert onConflict 'scan_id,fix_type' (prod lacks it; 0 duplicates).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_fixes_scan_fix_unique') THEN
    ALTER TABLE public.generated_fixes ADD CONSTRAINT generated_fixes_scan_fix_unique UNIQUE (scan_id, fix_type);
  END IF;
  -- app/api/outreach/intelligence upsert onConflict 'scan_id' (missing on both; 0 duplicates).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_intelligence_scan_id_key') THEN
    ALTER TABLE public.outreach_intelligence ADD CONSTRAINT outreach_intelligence_scan_id_key UNIQUE (scan_id);
  END IF;
END $$;
-- app/api/agency/invite/accept onConflict 'agency_user_id,client_user_id': the
-- existing unique index is partial, which ON CONFLICT cannot use. NULLs stay distinct.
CREATE UNIQUE INDEX IF NOT EXISTS agency_clients_agency_user_client_uidx
  ON public.agency_clients (agency_user_id, client_user_id);

-- ── 4. rankall_scans.basket_hash (lib/supabase.ts saveScan; prod lacks it) ──
ALTER TABLE public.rankall_scans ADD COLUMN IF NOT EXISTS basket_hash text;

-- ── 5. score_history: staging and production have different shapes ─────────
-- Writers: app/api/scan, app/api/rescan-weekly, lib/weeklyReport, trigger-sequence.
-- Readers: app/dashboard (recorded_at, score), app/dashboard/score-history (created_at, overall_score).
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS platforms_count integer;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS competitor_score integer;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS basket_hash text;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS business_input text;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS overall_score integer;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS trust_score integer;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS competitor_name text;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS competitor_share integer;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS mentioned_count integer;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS scan_type text DEFAULT 'manual';
-- Timestamps: add WITHOUT a default first, copy the real time from the other
-- column, then set the default — so existing rows keep their true dates.
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS recorded_at timestamptz;
ALTER TABLE public.score_history ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE public.score_history SET recorded_at = created_at WHERE recorded_at IS NULL AND created_at IS NOT NULL;
UPDATE public.score_history SET created_at = recorded_at WHERE created_at IS NULL AND recorded_at IS NOT NULL;
UPDATE public.score_history SET score = overall_score WHERE score IS NULL AND overall_score IS NOT NULL;
UPDATE public.score_history SET overall_score = score WHERE overall_score IS NULL AND score IS NOT NULL;
ALTER TABLE public.score_history ALTER COLUMN recorded_at SET DEFAULT now();
ALTER TABLE public.score_history ALTER COLUMN created_at SET DEFAULT now();
-- prod: business_input NOT NULL without default, but inserts omit it.
ALTER TABLE public.score_history ALTER COLUMN business_input DROP NOT NULL;

-- ── 6. verified_outcomes (prod lacks staging's columns) ──────────────────────
-- app/api/scan insert, lib/verifiedOutcomes, app/api/rescan-weekly, outcomes + simulator APIs.
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS scan_id_before uuid;
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS scan_id_after uuid;
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS fix_description text;
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS fix_applied_at timestamptz;
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS rescanned_at timestamptz;
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS score_improvement integer;
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS platforms_before integer;
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS platforms_after integer;
ALTER TABLE public.verified_outcomes ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;
ALTER TABLE public.verified_outcomes ALTER COLUMN verified SET DEFAULT false;  -- column may pre-exist without one
DO $$
BEGIN
  -- prod: fix_type NOT NULL without default, but app/api/scan omits it.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'verified_outcomes' AND column_name = 'fix_type') THEN
    ALTER TABLE public.verified_outcomes ALTER COLUMN fix_type DROP NOT NULL;
  END IF;
END $$;

-- ── 7. simulation_views.industry (simulator save/share; prod lacks it) ──────
ALTER TABLE public.simulation_views ADD COLUMN IF NOT EXISTS industry text;

-- ── 8. outreach_log / outreach_unsubscribes (different shapes per DB) ───────
-- app/api/outreach/send-email, send-whatsapp, unsubscribe.
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS body_html text;
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS body_text text;
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS template_version text;
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS competitor_name text;
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS resolved_category text;
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS overall_score integer;
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS verification_status text;
ALTER TABLE public.outreach_log ADD COLUMN IF NOT EXISTS verification_checked_at timestamptz;
ALTER TABLE public.outreach_unsubscribes ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.outreach_unsubscribes ALTER COLUMN created_at SET DEFAULT now();
-- Staging lacked unsubscribed_at, so unsubscribe inserts failed (compliance).
ALTER TABLE public.outreach_unsubscribes ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;
UPDATE public.outreach_unsubscribes SET unsubscribed_at = created_at WHERE unsubscribed_at IS NULL AND created_at IS NOT NULL;
ALTER TABLE public.outreach_unsubscribes ALTER COLUMN unsubscribed_at SET DEFAULT now();

-- ── 9. small missing columns ─────────────────────────────────────────────────
ALTER TABLE public.outreach_targets ADD COLUMN IF NOT EXISTS last_error text;          -- outreach/send-email
ALTER TABLE public.video_views ADD COLUMN IF NOT EXISTS user_agent text;               -- outreach/track
ALTER TABLE public.cancellation_requests ADD COLUMN IF NOT EXISTS winback_sent boolean DEFAULT false;  -- cron/winback-email
ALTER TABLE public.cancellation_requests ADD COLUMN IF NOT EXISTS winback_sent_at timestamptz;

-- ── 10. tables the code uses that exist on NEITHER database ─────────────────
-- Shapes follow the code that writes them. RLS on; server routes use the service role.
CREATE TABLE IF NOT EXISTS public.cron_runs (            -- lib/cronRuns.ts, admin/health
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job    text NOT NULL,
  status text,
  sent   integer,
  failed integer,
  error  text,
  ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cron_runs_job_ran_at_idx ON public.cron_runs (job, ran_at DESC);
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.personal_authority_snapshots (   -- scan-personal, dashboard/personal-brand
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_date              timestamptz DEFAULT now(),
  wikipedia_exists       boolean DEFAULT false,
  knowledge_panel_exists boolean DEFAULT false,
  healthgrades_score     integer DEFAULT 0,
  pubmed_citations       integer DEFAULT 0,
  press_mentions         integer DEFAULT 0,
  podcast_appearances    integer DEFAULT 0,
  linkedin_followers     integer DEFAULT 0,
  personal_ai_score      integer,
  created_at             timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_authority_snapshots_user_date_idx
  ON public.personal_authority_snapshots (user_id, scan_date DESC);
ALTER TABLE public.personal_authority_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_authority_snapshots_owner_select ON public.personal_authority_snapshots;
CREATE POLICY personal_authority_snapshots_owner_select ON public.personal_authority_snapshots
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS personal_authority_snapshots_owner_insert ON public.personal_authority_snapshots;
CREATE POLICY personal_authority_snapshots_owner_insert ON public.personal_authority_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.seo_audits (            -- app/api/seo-audit
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url        text,
  seo_score  integer,
  result     jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.seo_audits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.spend_intelligence (    -- app/api/intelligence/spend-analysis
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid,
  scan_id            uuid,
  google_ads         numeric,
  meta_ads           numeric,
  seo_agency         numeric,
  review_management  numeric,
  directories        numeric,
  other_marketing    numeric,
  total_spend        numeric,
  analysis_result    jsonb,
  created_at         timestamptz DEFAULT now()
);
ALTER TABLE public.spend_intelligence ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.waitlist_signups (      -- app/waitlist, city-intelligence (browser insert)
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text,
  business_name text,
  city          text,
  organisation  text,
  title_role    text,
  plan_type     text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;
-- Public sign-up form: anyone may ADD a row; nobody can read the list from the browser.
DROP POLICY IF EXISTS waitlist_signups_public_insert ON public.waitlist_signups;
CREATE POLICY waitlist_signups_public_insert ON public.waitlist_signups
  FOR INSERT TO anon, authenticated WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
