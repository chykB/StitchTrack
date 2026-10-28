-- OWNER ONLY: Step 3 require name and exact failed-migration CHECK; prepared, not executed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
\ir preconditions.sql
DO LANGUAGE plpgsql $before_step$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='task04_test' AND r.relname='User' AND a.attname='name'
    AND NOT a.attisdropped AND a.atttypid='pg_catalog.text'::REGTYPE
    AND NOT a.attnotnull AND NOT a.atthasdef) THEN RAISE EXCEPTION 'Expected nullable TEXT name without default'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='task04_test'
    AND r.relname='User' AND c.conname='User_name_nonblank_check') THEN RAISE EXCEPTION 'Required-stage check already exists'; END IF;
  IF (SELECT count(*) FROM "task04_test"."User" WHERE
    ("id"='task04-required-name-01' AND "name"='Synthetic User 01') OR
    ("id"='task04-required-name-02' AND "name"='Synthetic User 02'))<>2 THEN
    RAISE EXCEPTION 'Expected exact deterministic nonblank synthetic names'; END IF;
END;
$before_step$;

ALTER TABLE "task04_test"."User"
    ALTER COLUMN "name" SET NOT NULL,
    ADD CONSTRAINT "User_name_nonblank_check" CHECK (
        pg_catalog.btrim("name", U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''
    );

DO LANGUAGE plpgsql $after_step$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='task04_test' AND r.relname='User' AND a.attname='name'
    AND NOT a.attisdropped AND a.atttypid='pg_catalog.text'::REGTYPE
    AND a.attnotnull AND NOT a.atthasdef) THEN RAISE EXCEPTION 'Expected required TEXT name without default'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace JOIN pg_catalog.pg_attribute a
    ON a.attrelid=r.oid AND a.attname='name' AND NOT a.attisdropped
    WHERE n.nspname='task04_test' AND r.relname='User' AND c.conname='User_name_nonblank_check'
    AND c.contype='c' AND c.convalidated AND c.conkey=ARRAY[a.attnum]) THEN
    RAISE EXCEPTION 'Expected validated named CHECK attached only to name'; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='task04_test' AND table_name='User')<>4 THEN
    RAISE EXCEPTION 'Unexpected User column count'; END IF;
  IF (SELECT count(*) FROM "task04_test"."User" WHERE
    ("id"='task04-required-name-01' AND "name"='Synthetic User 01') OR
    ("id"='task04-required-name-02' AND "name"='Synthetic User 02'))<>2 THEN
    RAISE EXCEPTION 'Expected exact deterministic nonblank synthetic names'; END IF;
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
    AND a.attnotnull AND NOT a.atthasdef) THEN RAISE EXCEPTION 'Expected required TEXT name without default'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace JOIN pg_catalog.pg_attribute a
    ON a.attrelid=r.oid AND a.attname='name' AND NOT a.attisdropped
    WHERE n.nspname='task04_test' AND r.relname='User' AND c.conname='User_name_nonblank_check'
    AND c.contype='c' AND c.convalidated AND c.conkey=ARRAY[a.attnum]) THEN
    RAISE EXCEPTION 'Expected validated named CHECK attached only to name'; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='task04_test' AND table_name='User')<>4 THEN
    RAISE EXCEPTION 'Unexpected User column count'; END IF;
  IF (SELECT count(*) FROM "task04_test"."User" WHERE
    ("id"='task04-required-name-01' AND "name"='Synthetic User 01') OR
    ("id"='task04-required-name-02' AND "name"='Synthetic User 02'))<>2 THEN
    RAISE EXCEPTION 'Expected exact deterministic nonblank synthetic names'; END IF;
END;
$committed_state$;
\ir verify-unchanged.sql
\ir report.sql
COMMIT;
