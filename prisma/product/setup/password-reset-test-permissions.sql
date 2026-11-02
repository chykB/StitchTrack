-- UNAPPLIED: owner only, after reviewed fourth product-test migration.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $guard$
BEGIN
  IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator' OR session_user<>current_user
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stitchtrack_product_test_app' AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product'
      AND c.relname IN ('Account','Session','EmailVerificationIssuance','_prisma_migrations') AND c.relkind='r' AND pg_get_userbyid(c.relowner)=current_user)<>4
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations')
    OR has_table_privilege('stitchtrack_product_test_app','product."Account"','UPDATE')
    OR has_any_column_privilege('stitchtrack_product_test_app','product._prisma_migrations','UPDATE')
    OR has_schema_privilege('stitchtrack_product_test_app','product','CREATE')
    OR NOT has_table_privilege('stitchtrack_product_test_app','product."Session"','DELETE')
  THEN RAISE EXCEPTION 'Existing restricted product-test runtime and owned history required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>4
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_password_reset' AND checksum='2a13abcd028ab3a37b840f6c62d7a46d761e96d3029201a0a67f1eca927de4ed' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
  THEN RAISE EXCEPTION 'Four exact completed migrations required'; END IF;
END;
$guard$;
GRANT UPDATE ("password","updatedAt") ON product."Account" TO stitchtrack_product_test_app;
COMMIT;
