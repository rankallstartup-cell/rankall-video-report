-- Add nandish@rankall.io to admin RLS policies.
-- Adds the corporate email without removing rankallstartup@gmail.com or the
-- existing n4nandish addresses — all four remain admins. Also scopes the policy
-- to the `authenticated` role.
--
-- This mirrors exactly what was applied to the live database.
--
-- Rewritten (Oct 2026) from ALTER POLICY to DROP + CREATE so it is safe to run
-- again and works on a fresh database. Result is identical to the live policy
-- (checked on staging and production: cmd ALL, role authenticated, same USING).

DROP POLICY IF EXISTS "admin_outreach_intelligence" ON outreach_intelligence;
CREATE POLICY "admin_outreach_intelligence"
ON outreach_intelligence
TO authenticated
USING (
  (auth.jwt() ->> 'email'::text) IN (
    'rankallstartup@gmail.com',
    'n4nandish@gmail.com',
    'n4nandish@googlemail.com',
    'nandish@rankall.io'
  )
);
