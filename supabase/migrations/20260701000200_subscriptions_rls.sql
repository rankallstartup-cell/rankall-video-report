-- Fix: the client (authenticated user) was getting HTTP 400 reading `subscriptions`
-- because RLS blocked SELECT, so usePlan()'s subscription lookup silently failed.
-- Allow a user to read (only) their own subscription rows.

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;
CREATE POLICY "Users can read own subscription"
  ON subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);
