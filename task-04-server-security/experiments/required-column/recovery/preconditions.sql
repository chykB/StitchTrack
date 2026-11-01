-- Included only inside each recovery transaction; no persistent history writes.
DO LANGUAGE plpgsql $context$
BEGIN
  IF pg_catalog.current_database()<>'stitchtrack_assessment'
      OR CURRENT_USER<>'stitchtrack_task04_test_app' THEN
    RAISE EXCEPTION 'Recovery requires the exact isolated assessment database/role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
      WHERE n.nspname='task04_test' AND r.rolname=CURRENT_USER) THEN
    RAISE EXCEPTION 'Recovery schema ownership mismatch';
  END IF;
  IF pg_catalog.current_setting('server_encoding')<>'UTF8' THEN RAISE EXCEPTION 'UTF8 is required'; END IF;
END;
$context$;
-- Consistent order prevents racing a resolver/writer; timeouts are set by caller.
LOCK TABLE "task04_test"."_prisma_migrations" IN SHARE MODE;
LOCK TABLE "task04_test"."User" IN ACCESS EXCLUSIVE MODE;
DO LANGUAGE plpgsql $state$
BEGIN
  IF (SELECT count(*) FROM "task04_test"."_prisma_migrations")<>2 THEN
    RAISE EXCEPTION 'Unexpected history; preserve it and stop';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "task04_test"."_prisma_migrations"
      WHERE migration_name='20261028_task04_initial'
      AND checksum='1b2b7b3a988511ac6b73e7f82092e0a31807cb84ad3b385e896da7b0b0a88501'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Initial history mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "task04_test"."_prisma_migrations"
      WHERE migration_name='20261028_task04_user_name'
      AND checksum='482f61d709079ac088dda61c1d901d17a4d6f42dd3cd81c690211ad03f105e33'
      AND finished_at IS NULL AND rolled_back_at IS NULL
      AND logs LIKE '%23502%' AND logs LIKE '%name%') THEN
    RAISE EXCEPTION 'Expected original unresolved NOT NULL diagnostic is absent';
  END IF;
  IF (SELECT count(*) FROM "task04_test"."User")<>2 OR
      (SELECT count(*) FROM "task04_test"."User" WHERE
        ("id"='task04-required-name-01' AND "emailCanonical"='required-name-01@example.invalid') OR
        ("id"='task04-required-name-02' AND "emailCanonical"='required-name-02@example.invalid'))<>2 THEN
    RAISE EXCEPTION 'Expected exactly the two original synthetic users';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='task04_test' AND table_name='User'
      AND column_name IN ('id','emailCanonical','createdAt'))<>3 THEN RAISE EXCEPTION 'Original User columns missing'; END IF;
END;
$state$;
-- psql memory only: exact full-history and identity snapshots, not evidence files.
SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.id)::TEXT AS task04_history_snapshot
FROM "task04_test"."_prisma_migrations" m
\gset
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array("id","emailCanonical","createdAt") ORDER BY "id")::TEXT AS task04_identity_snapshot
FROM "task04_test"."User"
\gset
