#!/usr/bin/env bash
# OWNER-ONLY: --review is offline; the explicit confirmation branch executes SQL.
# Fixed disposable shadow target. No reset, evidence capture or Prisma history edits.
set -euo pipefail

usage() {
  printf '%s\n' \
    'Offline: bash rehearse-initial-shadow.sh --review' \
    'Owner execution: bash rehearse-initial-shadow.sh --confirm-shadow-rehearsal REVIEWED_SQL_SHA256'
}

if [[ $# -eq 1 && $1 == --review ]]; then
  task04_mode=review
elif [[ $# -eq 2 && $1 == --confirm-shadow-rehearsal && $2 =~ ^[0-9a-f]{64}$ ]]; then
  task04_mode=execute
else
  usage >&2
  exit 64
fi

task04_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
task04_sql_file="$task04_script_dir/../prisma/migrations/20261028_task04_initial/migration.sql"
task04_sql_hash="$(sha256sum -- "$task04_sql_file")"
task04_sql_hash="${task04_sql_hash%% *}"
printf 'Purpose: disposable shadow SQL rehearsal; NOT Evidence 03\n'
printf 'Target: 127.0.0.1:5432 / stitchtrack_task04_shadow / task04_test / stitchtrack_task04_shadow_app\n'
printf 'SQL SHA-256: %s\n' "$task04_sql_hash"
if [[ $task04_mode == review ]]; then
  printf 'Offline review only. No database client was started.\n'
  exit 0
fi
if [[ $2 != "$task04_sql_hash" ]]; then
  printf 'Reviewed SQL checksum mismatch; no database client started.\n' >&2
  exit 65
fi
if [[ ! -x /usr/lib/postgresql/16/bin/psql ]]; then
  printf 'Expected PostgreSQL 16 psql executable is unavailable; no fallback.\n' >&2
  exit 69
fi

if ! { exec {task04_tty_fd}<>/dev/tty; } 2>/dev/null; then
  printf 'An interactive owner terminal is required for the private password prompt.\n' >&2
  exit 69
fi
exec {task04_tty_fd}>&-

# One psql connection: this narrower guard must succeed BEFORE the SQL file.
# Do not remove or broaden this block. A completed rehearsal is not auto-reset.
read -r -d '' task04_shadow_check <<'SQL' || true
DO LANGUAGE plpgsql $task04_shadow_only$
BEGIN
    IF pg_catalog.current_database() <> 'stitchtrack_task04_shadow'
        OR CURRENT_USER <> 'stitchtrack_task04_shadow_app' THEN
        RAISE EXCEPTION 'Shadow-only rehearsal target/role mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace AS n
        JOIN pg_catalog.pg_roles AS r ON r.oid = n.nspowner
        WHERE n.nspname = 'task04_test' AND r.rolname = CURRENT_USER
    ) THEN
        RAISE EXCEPTION 'Expected existing shadow schema owned by current role' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS c
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'task04_test'
    ) THEN
        RAISE EXCEPTION 'Shadow schema is not empty; stop without reset';
    END IF;
END;
$task04_shadow_only$;
SQL

# Discard libpq/service/hostaddr/password/loader overrides; use fixed arguments.
# Password is entered privately at psql's terminal prompt, never as a URL/argument.
# -X skips psqlrc; ON_ERROR_STOP aborts before --file if the narrow guard fails.
# The migration already owns its BEGIN/COMMIT; do not add --single-transaction.
printf 'Shadow-only prerequisite SQL:\n%s\n' "$task04_shadow_check"
printf 'Starting owner-confirmed shadow-only psql rehearsal; password prompt follows.\n'
exec /usr/bin/env -i \
  PATH=/usr/bin:/bin \
  PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGCLIENTENCODING=UTF8 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql \
  --no-psqlrc --password \
  --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_task04_shadow --username=stitchtrack_task04_shadow_app \
  --set=ON_ERROR_STOP=on --set=VERBOSITY=verbose --pset=pager=off \
  --echo-all \
  --command="$task04_shadow_check" \
  --file="$task04_sql_file"
