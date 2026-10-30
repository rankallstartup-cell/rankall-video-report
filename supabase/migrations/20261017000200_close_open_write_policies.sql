-- Security: two policies let ANY role write, because they had no TO clause.
--   * businesses "service_role_can_manage_businesses" FOR ALL USING (true)
--     -> anyone with the public anon key could insert/update/delete business
--        profiles (staging has it today; production would have got it on the
--        first automatic run).
--   * outreach_events "insert_outreach_events" FOR INSERT WITH CHECK (true)
--     -> anyone could inject fake open/click/bounce events (skewing hot-lead
--        and spam-guard logic). On both staging and production today.
-- Every writer of both tables uses the service-role key (lib/businessEntity.ts,
-- app/api/outreach/track, app/api/webhooks/resend, lib/outreachGuard.ts), so
-- restricting the policies to service_role breaks nothing.

DROP POLICY IF EXISTS "service_role_can_manage_businesses" ON public.businesses;
CREATE POLICY "service_role_can_manage_businesses" ON public.businesses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "insert_outreach_events" ON public.outreach_events;
CREATE POLICY "insert_outreach_events" ON public.outreach_events
  FOR INSERT TO service_role WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
