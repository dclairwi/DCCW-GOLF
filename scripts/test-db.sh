#!/usr/bin/env bash
# Runs the migrations + RLS tests against a throwaway PostgreSQL database.
# Needs a local PostgreSQL server; set PGHOST/PGPORT/PGUSER as needed.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="dccw_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/harness/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
psql -tA -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/rls_test.sql 2>&1 \
  | sed 's/^psql:[^ ]* NOTICE:  /  /' | grep -v '^$'
