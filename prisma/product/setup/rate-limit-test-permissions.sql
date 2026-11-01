-- UNAPPLIED additive proposal: ONLY stitchtrack_product_test, as its exact migrator.
-- No Session/User/Account/Terms/history permissions change; no runtime DELETE.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $guard$
BEGIN
  IF current_database() <> 'stitchtrack_product_test' OR current_user <> 'stitchtrack_product_test_migrator' OR session_user <> current_user
    OR current_setting('port') <> '5432'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stitchtrack_product_test_app' AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)='stitchtrack_product_test_migrator')
    OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='AuthRateBucket' AND c.relkind='r' AND pg_get_userbyid(c.relowner)='stitchtrack_product_test_migrator')
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND pg_get_userbyid(c.relowner)='stitchtrack_product_test_app')
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='_prisma_migrations')
  THEN RAISE EXCEPTION 'Exact isolated restricted product target and owners required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>2
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations
    WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations
      WHERE migration_name='20261029_product_auth_initial'
        AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)
    OR EXISTS (SELECT 1 FROM product._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
  THEN RAISE EXCEPTION 'Successful reviewed initial and rate-bucket migrations required'; END IF;
  IF has_schema_privilege('stitchtrack_product_test_app', 'product', 'CREATE')
    OR has_table_privilege('stitchtrack_product_test_app', 'product._prisma_migrations', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('stitchtrack_product_test_app', 'product."AuthRateBucket"', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_column_privilege('stitchtrack_product_test_app', 'product."AuthRateBucket"', 'keyDigest', 'UPDATE')
    OR has_column_privilege('stitchtrack_product_test_app', 'product."AuthRateBucket"', 'capacity', 'UPDATE')
    OR has_column_privilege('stitchtrack_product_test_app', 'product."AuthRateBucket"', 'refillIntervalMs', 'UPDATE')
    OR pg_has_role('stitchtrack_product_test_app', current_user, 'MEMBER')
  THEN RAISE EXCEPTION 'Existing runtime privileges exceed the reviewed boundary'; END IF;
END;
$guard$;
GRANT SELECT ON product."AuthRateBucket" TO stitchtrack_product_test_app;
GRANT INSERT ("keyDigest", "capacity", "refillIntervalMs", "tokens", "refilledAt", "expiresAt", "lastAllowed") ON product."AuthRateBucket" TO stitchtrack_product_test_app;
GRANT UPDATE ("tokens", "refilledAt", "expiresAt", "lastAllowed") ON product."AuthRateBucket" TO stitchtrack_product_test_app;
COMMIT;
