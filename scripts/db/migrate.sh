#!/usr/bin/env bash
# Applies pending migrations to ONE Supabase database and records them in its
# migration history (supabase_migrations.schema_migrations).
#
# Used by .github/workflows/db-migrate.yml — you normally never run this by hand.
#
# Required env:
#   TARGET                  staging | production
#   DB_URL_STAGING          (when TARGET=staging)    Supabase "Session pooler" connection string
#   DB_URL_PRODUCTION       (when TARGET=production) Supabase "Session pooler" connection string
# Optional env:
#   DB_URL + EXPECTED_REF=local   only for testing against a local throwaway Postgres
#   DRY_RUN=1     only show what would be applied
#   SUPABASE      CLI command (default: supabase)
set -euo pipefail

: "${TARGET:?TARGET must be staging or production}"
case "$TARGET" in
  staging)    REF=akagdtdcopupaddxisbt; URL="${DB_URL_STAGING:-}";    SECRET=SUPABASE_DB_URL_STAGING ;;
  production) REF=lphrlyhhahlaqxhsmmpv; URL="${DB_URL_PRODUCTION:-}"; SECRET=SUPABASE_DB_URL_PRODUCTION ;;
  *) echo "TARGET must be staging or production" >&2; exit 2 ;;
esac
if [[ "${EXPECTED_REF:-}" == "local" ]]; then REF=local; URL="${DB_URL:?}"; fi
DB_URL="$URL"
EXPECTED_REF="$REF"
if [[ -z "$DB_URL" ]]; then
  echo "✗ The GitHub secret $SECRET is not set — see supabase/README.md (one-time setup)." >&2
  exit 2
fi
SUPABASE="${SUPABASE:-supabase}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
say() { echo "$*"; echo "$*" >> "$SUMMARY"; }

if [[ "$EXPECTED_REF" != "local" && "$DB_URL" != *"$EXPECTED_REF"* ]]; then
  echo "✗ The $TARGET database URL does not point at project $EXPECTED_REF." >&2
  echo "  Refusing to run — check the $SECRET secret." >&2
  exit 2
fi

PSQL=(psql "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1)

# 1. First run only: record migrations that were already applied by hand
#    (listed in supabase/migration-baseline/<target>.txt) so they are NOT re-run.
# (Connection errors must stop the run — never mistake them for "empty history".)
has_history_table="$("${PSQL[@]}" -c "select to_regclass('supabase_migrations.schema_migrations') is not null")" \
  || { echo "✗ Cannot connect to the $TARGET database — check the $SECRET secret." >&2; exit 1; }
history_count=0
if [[ "$has_history_table" == "t" ]]; then
  history_count="$("${PSQL[@]}" -c "select count(*) from supabase_migrations.schema_migrations")"
fi
if [[ "$history_count" == "0" ]]; then
  baseline="supabase/migration-baseline/$TARGET.txt"
  mapfile -t versions < <(grep -oE '^[0-9]{14}' "$baseline" || true)
  say "### First run on $TARGET: migration history is empty"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then verb="Would record"; else verb="Recording"; fi
  say "$verb ${#versions[@]} migrations that were already applied by hand (from \`$baseline\`) as done — they will not be re-run."
  if [[ "${DRY_RUN:-0}" != "1" && ${#versions[@]} -gt 0 ]]; then
    "$SUPABASE" migration repair --db-url "$DB_URL" --status applied "${versions[@]}"
  fi
fi

# 2. Show what will run.
say "### Pending migrations on $TARGET"
if [[ "$history_count" == "0" && "${DRY_RUN:-0}" == "1" ]]; then
  # History not recorded yet (dry run skipped step 1): list files not in the baseline.
  plan="$(ls supabase/migrations/*.sql | xargs -n1 basename | grep -vxF -f <(grep -E '^[0-9]{14}_' "supabase/migration-baseline/$TARGET.txt") || true)"
  plan="Would push these migrations:"$'\n'"$(sed 's/^/ • /' <<<"$plan")"
else
  # No "|| true": if the CLI says the push would fail, the preview must fail too.
  plan="$("$SUPABASE" db push --db-url "$DB_URL" --include-all --dry-run 2>&1)" \
    || { echo "$plan"; say "✗ The dry run failed — the real run would fail too (details above)."; exit 1; }
fi
echo "$plan"
{ echo '```'; echo "$plan"; echo '```'; } >> "$SUMMARY"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  say "Dry run only — nothing was changed."
  if [[ "$TARGET" == "production" && "${GITHUB_EVENT_NAME:-}" == "push" ]]; then
    say "Production auto-migrate is OFF. To apply: Actions → Database migrate → Run workflow → production, untick dry run. (Or set the repository variable AUTO_MIGRATE_PRODUCTION=true to apply automatically on every merge to main.)"
  fi
  exit 0
fi

# 3. Apply. Each migration runs in its own transaction: if one fails, it is
#    rolled back, the ones before it stay applied and recorded, and the job fails.
"$SUPABASE" db push --db-url "$DB_URL" --include-all </dev/null

# 4. Make the API (PostgREST) see new tables/columns/policies immediately.
"${PSQL[@]}" -c "NOTIFY pgrst, 'reload schema'" >/dev/null

# 5. Verify: every migration file in the repo is now recorded as applied.
mapfile -t local_versions < <(ls supabase/migrations/*.sql | xargs -n1 basename | grep -oE '^[0-9]{14}')
mapfile -t remote_versions < <("${PSQL[@]}" -c "select version from supabase_migrations.schema_migrations order by version")
missing=()
for v in "${local_versions[@]}"; do
  printf '%s\n' "${remote_versions[@]}" | grep -qx "$v" || missing+=("$v")
done
if (( ${#missing[@]} )); then
  say "✗ Not applied on $TARGET: ${missing[*]}"
  exit 1
fi
say "✓ $TARGET is up to date: all ${#local_versions[@]} migrations are applied and recorded."
