#!/usr/bin/env node
// Creates a new, correctly named migration file from a safe template.
//
//   npm run db:new -- add_invoice_table
//   -> supabase/migrations/20261017093000_add_invoice_table.sql
//
// The timestamp is UTC "now", so files always sort in the order they were made.
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dir = join(root, 'supabase', 'migrations')

const raw = process.argv.slice(2).join('_').trim()
const name = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
if (!name) {
  console.error('Usage: npm run db:new -- <what_it_does>   e.g. npm run db:new -- add_invoice_table')
  process.exit(1)
}

const d = new Date()
const p = (n) => String(n).padStart(2, '0')
let version = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`

// Never reuse a version (two files in the same second, or a clock behind the newest file).
const taken = new Set(readdirSync(dir).map((f) => f.slice(0, 14)))
const newest = [...taken].filter((v) => /^\d{14}$/.test(v)).sort().pop()
if (newest && version <= newest) version = String(BigInt(newest) + 1n)
while (taken.has(version)) version = String(BigInt(version) + 1n)

const file = join(dir, `${version}_${name}.sql`)
if (existsSync(file)) {
  console.error(`${file} already exists`)
  process.exit(1)
}

writeFileSync(
  file,
  `-- ${name.replace(/_/g, ' ')}
--
-- Why: <what problem this solves; link the ClickUp task>
-- Code that needs it: <file paths>
--
-- RULES (checked automatically by \`npm run db:check\` and in every PR):
--   * Must be safe to run twice: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--     DROP POLICY IF EXISTS before CREATE POLICY, DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT.
--   * No BEGIN/COMMIT (each file already runs in one transaction).
--   * Data changes (UPDATE/DELETE/INSERT) need a "-- rerun-safe: <why>" comment.
--   * New tables: ENABLE ROW LEVEL SECURITY + policies in this same file.
--   * App code must keep working if this migration has not run yet.
--   * Never edit a migration after it has been merged — write a new one.

-- Example:
-- CREATE TABLE IF NOT EXISTS public.example (
--   id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
--   created_at timestamptz NOT NULL DEFAULT now()
-- );
-- ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "example_owner_select" ON public.example;
-- CREATE POLICY "example_owner_select" ON public.example FOR SELECT USING (user_id = auth.uid());


-- Make the API see the change immediately.
NOTIFY pgrst, 'reload schema';
`,
)
console.log(`Created supabase/migrations/${version}_${name}.sql`)
console.log('Next: write the SQL, then run  npm run db:check')
