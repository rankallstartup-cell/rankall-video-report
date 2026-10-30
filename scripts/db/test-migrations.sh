#!/usr/bin/env bash
# Proves every migration works on a real Postgres, twice in a row.
#
#   1. Load the Supabase stand-ins (roles, auth schema)   supabase/tests/supabase_stubs.sql
#   2. Apply every file in supabase/migrations/ in order, each in its own
#      transaction (the same way `supabase db push` does). Any error = fail.
#   3. Snapshot the schema.
#   4. Apply every file AGAIN. Any error = fail (the migration is not re-runnable).
#   5. Snapshot again. Any difference = fail (re-running changed something).
#
# Usage:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres scripts/db/test-migrations.sh
# The database should be EMPTY (CI starts a fresh Postgres container for it).
# Never point this at staging or production.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to an EMPTY throwaway Postgres (never staging/production)}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*)
    echo "refusing to run against a Supabase-hosted database: $DATABASE_URL" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/migrations"
STUBS="$ROOT/supabase/tests/supabase_stubs.sql"
OUT="${TMPDIR:-/tmp}/rankall-migration-test.$$"
mkdir -p "$OUT"
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

apply_all() {
  local pass="$1"
  for f in "$MIG"/*.sql; do
    if ! "${PSQL[@]}" --single-transaction -f "$f" >"$OUT/last.log" 2>&1; then
      echo "✗ pass $pass: $(basename "$f") failed:" >&2
      grep -v '^NOTICE' "$OUT/last.log" >&2 || true
      exit 1
    fi
  done
  echo "✓ pass $pass: all $(ls "$MIG"/*.sql | wc -l | tr -d ' ') migrations applied"
}

snapshot() {
  # Schema-only dump of the app schema; strip lines that legitimately differ.
  pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges --schema=public \
    | grep -v -E '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$1"
}

"${PSQL[@]}" -f "$STUBS" >/dev/null
apply_all 1
snapshot "$OUT/after1.sql"
apply_all 2
snapshot "$OUT/after2.sql"

if ! diff -u "$OUT/after1.sql" "$OUT/after2.sql" > "$OUT/diff.txt"; then
  echo "✗ running the migrations a second time CHANGED the schema:" >&2
  head -80 "$OUT/diff.txt" >&2
  exit 1
fi
echo "✓ second run changed nothing — every migration is safe to re-run"
rm -rf "$OUT"
