-- UNAPPLIED, TEST ONLY. Separate authorization for the deletion lifecycle writer.
-- Existing Session DELETE and User SELECT/updatedAt rights are REQUIRED, not broadened.
-- Column grants do not implement actor authorization or a restoration policy.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $guard$
BEGIN
  IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator' OR session_user<>current_user
    OR current_setting('port')<>'5432'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stitchtrack_product_test_app' AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname IN ('User','Session','_prisma_migrations') AND pg_get_userbyid(c.relowner)=current_user AND c.relkind='r')<>3
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations')
    OR pg_has_role('stitchtrack_product_test_app',current_user,'MEMBER')
  THEN RAISE EXCEPTION 'Exact nonowning restricted product-test writer and migrator required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>3
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial'
      AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket'
      AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks'
      AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR EXISTS (SELECT 1 FROM product._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL OR logs IS NOT NULL OR applied_steps_count<>1)
  THEN RAISE EXCEPTION 'Three exact reviewed successful migrations required'; END IF;
  IF NOT has_table_privilege('stitchtrack_product_test_app','product."User"','SELECT')
    OR NOT has_column_privilege('stitchtrack_product_test_app','product."User"','updatedAt','UPDATE')
    OR NOT has_table_privilege('stitchtrack_product_test_app','product."Session"','DELETE')
    OR has_table_privilege('stitchtrack_product_test_app','product."User"','UPDATE,DELETE,TRUNCATE')
    OR has_column_privilege('stitchtrack_product_test_app','product."User"','emailCanonical','UPDATE')
    OR has_schema_privilege('stitchtrack_product_test_app','product','CREATE')
    OR has_table_privilege('stitchtrack_product_test_app','product._prisma_migrations','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'Existing least privileges required; no blanket identity/history rights'; END IF;
END;
$guard$;
GRANT UPDATE ("deletionRequestedAt") ON product."User" TO stitchtrack_product_test_app;
COMMIT;
