-- OWNER ONLY: two synthetic lab identities, not authentication accounts.
-- No upsert, delete or cleanup. Repeated/colliding runs stop for review.
BEGIN;
DO LANGUAGE plpgsql $seed_target$
BEGIN
    IF pg_catalog.current_database() <> 'stitchtrack_assessment'
        OR CURRENT_USER <> 'stitchtrack_task04_test_app' THEN
        RAISE EXCEPTION 'Synthetic seed requires the exact approved assessment target/role';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
        WHERE n.nspname='task04_test' AND r.rolname=CURRENT_USER
    ) THEN RAISE EXCEPTION 'Expected isolated schema ownership'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "task04_test"."_prisma_migrations"
        WHERE migration_name='20261028_task04_initial'
        AND checksum='1b2b7b3a988511ac6b73e7f82092e0a31807cb84ad3b385e896da7b0b0a88501'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
        RAISE EXCEPTION 'Expected successfully applied initial migration/checksum';
    END IF;
    IF (SELECT count(*) FROM "task04_test"."_prisma_migrations") <> 1 THEN
        RAISE EXCEPTION 'Unexpected migration history; stop before synthetic seeding';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='task04_test' AND table_name='User') <> 3
        OR (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='task04_test' AND table_name='User'
        AND column_name IN ('id','emailCanonical','createdAt')) <> 3 THEN
        RAISE EXCEPTION 'Expected initial three-column User table, without name';
    END IF;
END;
$seed_target$;
LOCK TABLE "task04_test"."User" IN SHARE ROW EXCLUSIVE MODE;
DO LANGUAGE plpgsql $empty_seed$
BEGIN
    IF EXISTS (SELECT 1 FROM "task04_test"."User") THEN
        RAISE EXCEPTION 'User table is not empty; do not overwrite or automatically reseed';
    END IF;
END;
$empty_seed$;
INSERT INTO "task04_test"."User" ("id", "emailCanonical", "createdAt") VALUES
    ('task04-required-name-01', 'required-name-01@example.invalid', CURRENT_TIMESTAMP),
    ('task04-required-name-02', 'required-name-02@example.invalid', CURRENT_TIMESTAMP);
COMMIT;
-- Committed rows must be visible before any Prisma attempt. This is actual
-- owner query output when executed, not predetermined assessment evidence.
SELECT "id", "emailCanonical", "createdAt" FROM "task04_test"."User" ORDER BY "id";
SELECT count(*) AS synthetic_user_count FROM "task04_test"."User";
