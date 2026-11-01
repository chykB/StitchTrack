-- Deliberate Evidence 04 migration candidate: not executed by the agent.
-- Apply only after the owner has committed and captured two synthetic User rows.
-- No DEFAULT: existing rows have no name, so PostgreSQL should reject NOT NULL.
-- Preflight also permits the verified shadow pair for eventual empty replay.
-- No explicit outer transaction: the single failing ALTER statement is atomic,
-- and must not leave Prisma's connection in an aborted transaction for logging.
DO LANGUAGE plpgsql $task04_preflight$
BEGIN
    IF NOT (
        (pg_catalog.current_database() = 'stitchtrack_assessment'
            AND CURRENT_USER = 'stitchtrack_task04_test_app')
        OR
        (pg_catalog.current_database() = 'stitchtrack_task04_shadow'
            AND CURRENT_USER = 'stitchtrack_task04_shadow_app')
    ) THEN
        RAISE EXCEPTION 'Task Four migration target/role mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS n
        JOIN pg_catalog.pg_roles AS r ON r.oid = n.nspowner
        WHERE n.nspname = 'task04_test' AND r.rolname = CURRENT_USER
    ) THEN
        RAISE EXCEPTION 'Expected existing task04_test schema owned by current role'
            USING ERRCODE = '42501';
    END IF;
    IF pg_catalog.current_setting('server_encoding') <> 'UTF8' THEN
        RAISE EXCEPTION 'Task Four Unicode text checks require UTF8 server encoding';
    END IF;
END;
$task04_preflight$;

ALTER TABLE "task04_test"."User"
    ADD COLUMN "name" TEXT NOT NULL
    CONSTRAINT "User_name_nonblank_check" CHECK (
        pg_catalog.btrim("name", U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''
    );
