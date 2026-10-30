-- rerun-safe: the UPDATE only touches users whose app_metadata.account_type
-- differs from their live subscription plan; after one run there are none.
-- 20261016000200_backfill_app_metadata_plan.sql
--
-- OWNER ACTION (run once in the Supabase SQL editor; idempotent, safe to
-- re-run). Review the SELECT preview first.
--
-- Why: every access decision now resolves the plan as
--   subscriptions row (active/trialing/past_due) → app_metadata.account_type → free
-- and NEVER reads user_metadata (users can write it themselves via
-- supabase.auth.updateUser, so it was a self-grant hole). Paying users whose
-- plan was only ever stamped into user_metadata are still covered by their
-- subscriptions row; this backfill additionally copies that plan into
-- app_metadata so the trusted fallback agrees with billing.
--
-- SOURCE OF TRUTH: public.subscriptions ONLY, status in
-- ('active','trialing','past_due'). This deliberately does NOT copy from
-- user_metadata / raw_user_meta_data — doing so would launder any
-- self-granted plan into the trusted app_metadata.
--
-- Expired trials (status = 'trialing' AND trial_end <= now()) are skipped,
-- mirroring resolvePlanFromSources.

-- Preview (run this first):
-- SELECT u.id, u.email, u.raw_app_meta_data->>'account_type' AS current_app_plan, s.plan AS subscription_plan, s.status
-- FROM auth.users u
-- JOIN LATERAL (
--   SELECT plan, status FROM public.subscriptions s
--   WHERE s.user_id = u.id
--     AND s.status IN ('active','trialing','past_due')
--     AND s.plan IS NOT NULL
--     AND NOT (s.status = 'trialing' AND s.trial_end IS NOT NULL AND s.trial_end <= now())
--   ORDER BY s.created_at DESC NULLS LAST
--   LIMIT 1
-- ) s ON true
-- WHERE COALESCE(u.raw_app_meta_data->>'account_type', '') IS DISTINCT FROM s.plan;

UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('account_type', s.plan)
FROM (
  SELECT DISTINCT ON (user_id) user_id, plan
  FROM public.subscriptions
  WHERE status IN ('active','trialing','past_due')
    AND plan IS NOT NULL
    AND NOT (status = 'trialing' AND trial_end IS NOT NULL AND trial_end <= now())
  ORDER BY user_id, created_at DESC NULLS LAST
) s
WHERE s.user_id = u.id
  AND COALESCE(u.raw_app_meta_data->>'account_type', '') IS DISTINCT FROM s.plan;

-- Pause state: app/api/scan now reads account_paused / pause_until from
-- app_metadata. Users paused before this release only have it in
-- user_metadata; the scan route still honours that legacy flag in the
-- restrictive direction. No backfill needed.
