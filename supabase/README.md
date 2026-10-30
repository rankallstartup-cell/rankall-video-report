# Database changes (Supabase migrations)

**One rule: every database change is a migration file in `supabase/migrations/`.**
Never change the schema in the Supabase dashboard or SQL editor. Merging the file
is what applies it, and every applied file is recorded in the database
(`supabase_migrations.schema_migrations`), so we always know what ran where.

## How a change reaches the databases

```
 you write a file ──► open a PR ──► checks (automatic) ──► merge to staging ──► staging DB updated
   npm run db:new                    • rules                (automatic)
                                     • applied twice to a
                                       fresh Postgres
                                     • preview of staging     merge to main ──► production DB
                                                                                (preview, then approve)
```

| When | What happens | Workflow |
|---|---|---|
| You open / update a PR that touches `supabase/` | Rules check, full chain applied **twice** to an empty Postgres (proves it works and is re-runnable), and a dry-run list of what will run on staging | `Database checks` (`.github/workflows/db-check.yml`) |
| PR merged into `staging` | Pending migrations applied to **staging** and recorded | `Database migrate` (`.github/workflows/db-migrate.yml`) |
| `staging` merged into `main` | **Preview only** for production, until the owner turns on auto-apply (see below) | `Database migrate` |
| Manual | Actions → *Database migrate* → *Run workflow* → pick staging/production, dry run on/off | `Database migrate` |

If a migration fails, **only that file is rolled back** — the ones before it stay
applied and recorded, the job turns red, and nothing is half-done. Fix it with a
new migration file and merge again.

## Making a change (step by step)

1. Create the file — never name it by hand:
   ```bash
   npm run db:new -- add_invoice_table
   # → supabase/migrations/20261017093000_add_invoice_table.sql (with a template)
   ```
2. Write the SQL following the rules below.
3. Check it:
   ```bash
   npm run db:check          # rules (needs: pip install 'pglast>=7,<8')
   npm run db:test           # optional, needs a local empty Postgres, see below
   ```
4. Make the app code work **even before the migration has run** (catch the
   "column/table does not exist" error and degrade safely). Vercel and the
   migration deploy at the same time, so for a minute the new code can meet the
   old schema.
5. Open a PR into `staging`. The checks must be green. Merge → staging DB is updated
   automatically. Look at the *Database migrate* run summary to see what ran.

## The rules (enforced automatically)

Our databases were partly built by hand, so a migration can meet objects that
already exist. **Every file must be safe to run twice.**

| Write this | Not this |
|---|---|
| `CREATE TABLE IF NOT EXISTS` | `CREATE TABLE` |
| `ALTER TABLE t ADD COLUMN IF NOT EXISTS c …` | `ADD COLUMN c …` |
| `CREATE INDEX IF NOT EXISTS name ON …` | `CREATE INDEX …` (or `CONCURRENTLY`) |
| `CREATE OR REPLACE FUNCTION` / `VIEW` / `TRIGGER` | `CREATE FUNCTION` |
| `DROP POLICY IF EXISTS "p" ON t;` then `CREATE POLICY "p" ON t …` | `CREATE POLICY` alone, or `ALTER POLICY` |
| `ALTER TABLE t DROP CONSTRAINT IF EXISTS c;` then `ADD CONSTRAINT c …` | `ADD CONSTRAINT` alone |
| `DROP … IF EXISTS` | `DROP …` |
| Enum types: create inside a `DO $$ … $$` block that checks `pg_type` | `CREATE TYPE … AS ENUM` |
| No `BEGIN` / `COMMIT` (each file is already one transaction) | |

Also:
- **Data changes** (`UPDATE` / `DELETE` / `INSERT` without `ON CONFLICT`) need a
  comment `-- rerun-safe: <why running it twice is harmless>`.
- **Destructive changes** (`DROP TABLE`, `DROP COLUMN`, `… CASCADE`, `TRUNCATE`,
  `ALTER COLUMN … TYPE`, renames) need a comment `-- reviewed: <why this is safe>`
  directly above that statement — and a second person should read the PR.
- **Policies that allow everything** (`USING (true)` / `WITH CHECK (true)`) must
  name the role (`TO service_role`, or `TO anon` for a public form). Without a
  `TO`, a policy applies to everyone, including anonymous visitors.
- **New tables** must `ENABLE ROW LEVEL SECURITY` and add their policies in the
  same file. The browser can reach any table that has RLS off.
- **Never edit a migration after it has been merged** — it has already run.
  Write a new file that changes what you need.
- End with `NOTIFY pgrst, 'reload schema';` so the API sees the change at once
  (the pipeline also does this after every run).

## Running the full test locally (optional)

Needs an **empty, throwaway** Postgres 15+ (never staging/production — the script refuses Supabase hosts):

```bash
docker run --rm -d -p 54329:5432 -e POSTGRES_PASSWORD=postgres --name pgtest postgres:17
DATABASE_URL=postgresql://postgres:postgres@localhost:54329/postgres npm run db:test
docker rm -f pgtest
```

It loads small stand-ins for Supabase's own objects (`supabase/tests/supabase_stubs.sql`:
roles, `auth.users`, `auth.uid()`), applies every migration, applies them all
again, and fails if the second run errors or changes anything.

## One-time setup (owner)

1. **Secrets — as *environment* secrets, not repository secrets.** GitHub repo →
   Settings → Environments → create **`staging`** and **`production`** (the
   workflows already refer to them). Then add one secret to each:
   - environment `staging` → secret `SUPABASE_DB_URL_STAGING` — Supabase dashboard →
     project **rankall-staging** → *Connect* → **Session pooler** → URI, with your
     database password filled in.
   - environment `production` → secret `SUPABASE_DB_URL_PRODUCTION` — the same from
     project **rankall**.

   Environment secrets are only given to jobs for that environment, so the
   production password never reaches PR checks or staging runs. Use the
   *Session pooler* string (port 5432), not "Direct connection" (GitHub cannot
   reach that). If the password has symbols like `@ # / ?`, URL-encode them.
   The pipeline refuses to run if a URL points at the wrong project.
   **Add the staging secret before merging this pipeline** — the merge itself
   triggers the first staging run.
2. **Lock production (recommended)** — Settings → Environments → `production`:
   *Required reviewers* → add yourself (every production run waits for your click),
   and *Deployment branches* → `main` only. The workflow also refuses production
   runs from any other branch.
3. **Production auto-apply** — off by default: merging into `main` only shows the
   list of what would run. Apply it with Actions → *Database migrate* → *Run
   workflow* → `production`, untick *dry run*. When you're happy, set the
   repository **variable** `AUTO_MIGRATE_PRODUCTION` = `true` to apply automatically
   on every merge to `main`.

## First run on each database (already prepared)

Before this pipeline, migrations were pasted into the SQL editor and nothing was
recorded. `supabase/migration-baseline/<env>.txt` lists the files that were
**already applied by hand** on each database (checked against the live schema on
2026-10-17). On the very first run, the pipeline records exactly those as done
so they never re-run, then applies the rest. After that, the baseline files are
never read again.

## Files

| Path | What it is |
|---|---|
| `supabase/migrations/` | The migrations, applied in file-name order |
| `supabase/migration-baseline/` | One-time list of hand-applied migrations per database |
| `supabase/tests/supabase_stubs.sql` | Supabase stand-ins for the CI test only |
| `scripts/db/new-migration.mjs` | `npm run db:new` |
| `scripts/db/check_migrations.py` | `npm run db:check` — the rules |
| `scripts/db/test-migrations.sh` | `npm run db:test` — apply twice on a fresh Postgres |
| `scripts/db/migrate.sh` | What the deploy workflow runs |
