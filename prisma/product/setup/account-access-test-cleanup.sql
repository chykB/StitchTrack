-- OWNER ONLY: separately authorized exact-run cleanup, never called by the harness.
-- Inputs are nonsecret run_id (v4 UUID) and cleanup_confirmed=yes, supplied via psql -v.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='5s';
SELECT set_config('stitchtrack.account_proof_run', :'run_id', true);
SELECT set_config('stitchtrack.account_proof_cleanup', :'cleanup_confirmed', true);
DO $cleanup$
DECLARE
  run text:=current_setting('stitchtrack.account_proof_run'); ids text[]; found integer;
  users_removed integer; accounts_removed integer; sessions_removed integer;
BEGIN
  IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator'
    OR session_user<>current_user OR current_setting('port')<>'5432'
    OR current_setting('stitchtrack.account_proof_cleanup')<>'yes'
    OR run !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relkind='r' AND pg_get_userbyid(c.relowner)=current_user)<>10
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relname='_prisma_migrations' AND n.nspname<>'product')
  THEN RAISE EXCEPTION 'Exact restricted product-test migrator, confirmation and proof UUID required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>3
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff')
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c')
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd')
    OR EXISTS (SELECT 1 FROM product._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL OR logs IS NOT NULL OR applied_steps_count<>1)
  THEN RAISE EXCEPTION 'Three exact successful reviewed migrations required'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('stitchtrack/account-access-proof',0))
    OR EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND application_name='stitchtrack-account-proof-' || run AND pid<>pg_backend_pid())
  THEN RAISE EXCEPTION 'Proof still active; close its connections before cleanup'; END IF;
  SELECT array_agg('al-proof-' || run || '-' || label ORDER BY label) INTO ids
    FROM unnest(ARRAY['login-first','lock-first','simultaneous','deletion','rollback','commit-failure','unrelated','unverified']) AS fixture(label);
  PERFORM 1 FROM product."User" WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO found FROM product."User" WHERE id=ANY(ids);
  -- Fixture setup is atomic: zero or all eight are valid interrupted states.
  IF found NOT IN (0,8) OR (SELECT count(*) FROM product."User")<>10+found
    OR EXISTS (SELECT 1 FROM product."User" WHERE id=ANY(ids) AND
      (name<>'Synthetic account-lock proof ' || run OR "emailCanonical"<>id || '@example.invalid'
       OR image IS NOT NULL OR "emailVerified"<>(id<>'al-proof-' || run || '-unverified')))
    OR (SELECT count(*) FROM product."Account" WHERE "userId"=ANY(ids))<>found
    OR EXISTS (SELECT 1 FROM product."Account" WHERE "userId"=ANY(ids) AND
      (id<>'credential-' || "userId" OR "accountId"<>"userId" OR "providerId"<>'credential'))
    OR EXISTS (SELECT 1 FROM product."TermsAcceptance" WHERE "userId"=ANY(ids))
    OR EXISTS (SELECT 1 FROM product."EmailVerificationIssuance" WHERE "userId"=ANY(ids))
    OR EXISTS (SELECT 1 FROM product."Session" WHERE "userId"=ANY(ids) AND token !~ '^hmac-sha256:v1:[0-9a-f]{64}$')
  THEN RAISE EXCEPTION 'Unexpected fixture/baseline relationships; preserve state for review'; END IF;
  DELETE FROM product."Session" WHERE "userId"=ANY(ids); GET DIAGNOSTICS sessions_removed=ROW_COUNT;
  DELETE FROM product."Account" WHERE "userId"=ANY(ids); GET DIAGNOSTICS accounts_removed=ROW_COUNT;
  DELETE FROM product."User" WHERE id=ANY(ids); GET DIAGNOSTICS users_removed=ROW_COUNT;
  IF users_removed<>found OR accounts_removed<>found OR (SELECT count(*) FROM product."User")<>10
    OR EXISTS (SELECT 1 FROM product."User" WHERE id=ANY(ids))
    OR EXISTS (SELECT 1 FROM product."Session" WHERE "userId"=ANY(ids))
    OR EXISTS (SELECT 1 FROM product."Account" WHERE "userId"=ANY(ids))
  THEN RAISE EXCEPTION 'Exact cleanup verification failed; transaction rolled back'; END IF;
  RAISE NOTICE 'Exact run cleanup: users=%, accounts=%, sessions=%. Ten baseline users retained.',users_removed,accounts_removed,sessions_removed;
END;
$cleanup$;
COMMIT;
