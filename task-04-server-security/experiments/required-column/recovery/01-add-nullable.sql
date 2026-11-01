-- OWNER ONLY: Step 1 add nullable name; prepared, not executed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
\ir preconditions.sql
DO LANGUAGE plpgsql $before_step$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='task04_test' AND table_name='User')<>3
    OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='task04_test' AND table_name='User' AND column_name='name') THEN
    RAISE EXCEPTION 'Step 1 requires original User without name; do not repeat recovery'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='task04_test'
    AND r.relname='User' AND c.conname='User_name_nonblank_check') THEN RAISE EXCEPTION 'Unexpected existing name CHECK'; END IF;
END;
$before_step$;

ALTER TABLE "task04_test"."User" ADD COLUMN "name" TEXT;

DO LANGUAGE plpgsql $after_step$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='task04_test' AND r.relname='User' AND a.attname='name'
    AND NOT a.attisdropped AND a.atttypid='pg_catalog.text'::REGTYPE
    AND NOT a.attnotnull AND NOT a.atthasdef) THEN RAISE EXCEPTION 'Expected nullable TEXT name without default'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='task04_test'
    AND r.relname='User' AND c.conname='User_name_nonblank_check') THEN RAISE EXCEPTION 'Required-stage check already exists'; END IF;
  IF (SELECT count(*) FROM "task04_test"."User" WHERE "name" IS NULL)<>2 THEN
    RAISE EXCEPTION 'Both names must still be NULL before backfill'; END IF;
END;
$after_step$;
\ir verify-unchanged.sql
\ir report.sql
COMMIT;

-- Verify committed state on this same connection; no repair/retry.
BEGIN READ ONLY;
DO LANGUAGE plpgsql $committed_state$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='task04_test' AND r.relname='User' AND a.attname='name'
    AND NOT a.attisdropped AND a.atttypid='pg_catalog.text'::REGTYPE
    AND NOT a.attnotnull AND NOT a.atthasdef) THEN RAISE EXCEPTION 'Expected nullable TEXT name without default'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='task04_test'
    AND r.relname='User' AND c.conname='User_name_nonblank_check') THEN RAISE EXCEPTION 'Required-stage check already exists'; END IF;
  IF (SELECT count(*) FROM "task04_test"."User" WHERE "name" IS NULL)<>2 THEN
    RAISE EXCEPTION 'Both names must still be NULL before backfill'; END IF;
END;
$committed_state$;
\ir verify-unchanged.sql
\ir report.sql
COMMIT;
