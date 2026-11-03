-- UNEXECUTED owner-only assignment/revocation. No email match or public API.
-- Required psql variables: admin_assignment_confirmed=true, admin_user_id, admin_action=grant|revoke.
\set ON_ERROR_STOP on
\if :{?admin_assignment_confirmed}
\else
\quit 3
\endif
\if :admin_assignment_confirmed
\else
\quit 3
\endif
\if :{?admin_user_id}
\else
\quit 3
\endif
\if :{?admin_action}
\else
\quit 3
\endif
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
SELECT set_config('stitchtrack.admin_user_id', :'admin_user_id', true) IS NOT NULL AS target_supplied,
       set_config('stitchtrack.admin_action', :'admin_action', true) IS NOT NULL AS action_supplied;
DO $guard$
DECLARE target product."User"%ROWTYPE; action text:=current_setting('stitchtrack.admin_action');
BEGIN
  IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator'
    OR session_user<>current_user OR current_setting('port')<>'5432'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stitchtrack_product_test_app' AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind='r')<>10
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind='r' AND pg_get_userbyid(c.relowner)<>current_user)
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations')
  THEN RAISE EXCEPTION 'Exact owned and restricted product-test target required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>5
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_password_reset' AND checksum='2a13abcd028ab3a37b840f6c62d7a46d761e96d3029201a0a67f1eca927de4ed' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_user_administrator' AND checksum='e6fd462d9de12bb85cb749b54f068819b6862213ab2348b7a25747de8c04e665' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
  THEN RAISE EXCEPTION 'Exact reviewed product migration history required'; END IF;
  IF has_column_privilege('stitchtrack_product_test_app','product."User"','isAdministrator','INSERT')
    OR has_column_privilege('stitchtrack_product_test_app','product."User"','isAdministrator','UPDATE')
    OR action NOT IN ('grant','revoke') OR length(current_setting('stitchtrack.admin_user_id'))=0
  THEN RAISE EXCEPTION 'Role assignment prerequisites required'; END IF;
  SELECT * INTO target FROM product."User" WHERE "id"=current_setting('stitchtrack.admin_user_id') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact target required'; END IF;
  IF action='grant' AND (target."isAdministrator" OR NOT target."emailVerified" OR target."disabledAt" IS NOT NULL OR target."deletionRequestedAt" IS NOT NULL
    OR (SELECT count(*) FROM product."Account" WHERE "userId"=target."id" AND "accountId"=target."id" AND "providerId"='credential' AND "password" IS NOT NULL)<>1)
  THEN RAISE EXCEPTION 'Verified active non-admin credential account required'; END IF;
  IF action='revoke' AND NOT target."isAdministrator" THEN RAISE EXCEPTION 'Existing administrator required'; END IF;
  UPDATE product."User" SET "isAdministrator"=(action='grant') WHERE "id"=target."id";
END;
$guard$;
COMMIT;
