-- OWNER ONLY: exact run cleanup after separately reviewing real proof results.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
SELECT set_config('stitchtrack.reset_cleanup_run', :'run_id', true);
DO $guard$
DECLARE run text:=current_setting('stitchtrack.reset_cleanup_run'); ids text[]; labels text[]:=ARRAY['success','rollback','replay','race','expired','attempts','client','unverified'];
  baseline integer; removed_users integer; removed_accounts integer; removed_sessions integer; removed_issues integer; removed_jobs integer; removed_verifications integer;
BEGIN
  IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator' OR session_user<>current_user
    OR run !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
  THEN RAISE EXCEPTION 'Exact restricted product-test migrator and proof UUID required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>4
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_password_reset' AND checksum='2a13abcd028ab3a37b840f6c62d7a46d761e96d3029201a0a67f1eca927de4ed' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
  THEN RAISE EXCEPTION 'Four reviewed successful migrations required'; END IF;
  IF NOT pg_try_advisory_xact_lock(1398031176,1) THEN RAISE EXCEPTION 'Worker/proof must be stopped'; END IF;
  LOCK TABLE product."User", product."Account", product."Session", product."EmailVerificationIssuance", product."EmailOutbox", product."Verification" IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg('reset-proof-'||run||'-'||label) INTO ids FROM unnest(labels) label;
  SELECT count(*) INTO baseline FROM product."User";
  IF (SELECT count(*) FROM product."User" WHERE "id"=ANY(ids))<>8
    OR EXISTS (SELECT 1 FROM product."User" WHERE "id"=ANY(ids) AND ("emailCanonical"<>"id"||'@example.invalid'
      OR "name"<>'Synthetic password-reset proof' OR "image" IS NOT NULL OR "disabledAt" IS NOT NULL OR "deletionRequestedAt" IS NOT NULL
      OR "emailVerified"<>("id"<>'reset-proof-'||run||'-unverified')))
    OR (SELECT count(*) FROM product."Account" WHERE "userId"=ANY(ids))<>7
    OR EXISTS (SELECT 1 FROM product."Account" WHERE "userId"=ANY(ids) AND ("id"<>"userId"||'-credential' OR "accountId"<>"userId" OR "providerId"<>'credential' OR "password" IS NULL))
    OR EXISTS (SELECT 1 FROM product."TermsAcceptance" WHERE "userId"=ANY(ids))
    OR EXISTS (SELECT 1 FROM product."EmailVerificationIssuance" WHERE "userId"=ANY(ids) AND ("purpose"<>'password-reset' OR "emailCanonical"<>"userId"||'@example.invalid'))
    OR EXISTS (SELECT 1 FROM product."Verification" v JOIN product."EmailVerificationIssuance" i ON i."verificationId"=v."id"
      WHERE i."userId"=ANY(ids) AND v."identifier"<>'forget-password-otp-'||i."emailCanonical")
    OR EXISTS (SELECT 1 FROM product."EmailOutbox" j JOIN product."EmailVerificationIssuance" i ON i."id"=j."issuanceId" WHERE i."userId"=ANY(ids)
      AND (j."templateVersion"<>'tailor-password-reset-v1' OR j."status" NOT IN ('pending','cancelled') OR j."attemptCount"<>0 OR j."sentAt" IS NOT NULL))
  THEN RAISE EXCEPTION 'Exact complete synthetic fixture relationships required; preserve partial state'; END IF;
  -- Only verification rows linked by the exact reset issuances may be removed.
  DELETE FROM product."Verification" WHERE "id" IN (SELECT "verificationId" FROM product."EmailVerificationIssuance" WHERE "userId"=ANY(ids));GET DIAGNOSTICS removed_verifications=ROW_COUNT;
  DELETE FROM product."EmailOutbox" WHERE "issuanceId" IN (SELECT "id" FROM product."EmailVerificationIssuance" WHERE "userId"=ANY(ids));GET DIAGNOSTICS removed_jobs=ROW_COUNT;
  DELETE FROM product."EmailVerificationIssuance" WHERE "userId"=ANY(ids);GET DIAGNOSTICS removed_issues=ROW_COUNT;
  DELETE FROM product."Session" WHERE "userId"=ANY(ids);GET DIAGNOSTICS removed_sessions=ROW_COUNT;
  DELETE FROM product."Account" WHERE "userId"=ANY(ids);GET DIAGNOSTICS removed_accounts=ROW_COUNT;
  DELETE FROM product."User" WHERE "id"=ANY(ids);GET DIAGNOSTICS removed_users=ROW_COUNT;
  IF removed_users<>8 OR removed_accounts<>7 OR (SELECT count(*) FROM product."User")<>baseline-8 THEN RAISE EXCEPTION 'Cleanup counts differ'; END IF;
  RAISE NOTICE 'Removed synthetic users=%, accounts=%, sessions=%, issuances=%, outbox=%, verification=%; unrelated users retained',removed_users,removed_accounts,removed_sessions,removed_issues,removed_jobs,removed_verifications;
END;
$guard$;
COMMIT;
