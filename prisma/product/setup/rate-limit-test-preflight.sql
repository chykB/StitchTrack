-- OWNER ONLY, READ ONLY. phase=before (initial alone) or after (exact two applied).
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '5s';
SELECT set_config('stitchtrack.rate_phase', :'phase', true);
DO $guard$
DECLARE phase text := current_setting('stitchtrack.rate_phase'); expected_count integer;
BEGIN
  IF phase NOT IN ('before','after') OR current_database()<>'stitchtrack_product_test'
    OR current_user<>'stitchtrack_product_test_migrator' OR session_user<>current_user
    OR current_setting('port')<>'5432'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='_prisma_migrations' AND pg_get_userbyid(c.relowner)=current_user)
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='_prisma_migrations')
  THEN RAISE EXCEPTION 'Exact restricted product-test migrator, namespace and phase required'; END IF;
  expected_count := CASE phase WHEN 'before' THEN 1 ELSE 2 END;
  IF (SELECT count(*) FROM product._prisma_migrations)<>expected_count
    OR (SELECT count(*) FROM product._prisma_migrations WHERE
      migration_name='20261029_product_auth_initial'
      AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR EXISTS (SELECT 1 FROM product._prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL OR logs IS NOT NULL OR applied_steps_count<>1)
  THEN RAISE EXCEPTION 'Unexpected, failed, incomplete or nonreviewed migration history'; END IF;
  IF phase='before' AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='AuthRateBucket')
  THEN RAISE EXCEPTION 'Rate bucket already exists before deploy; stop for review'; END IF;
  IF phase='after' AND (
    (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket'
      AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      AND logs IS NULL AND applied_steps_count=1)<>1
    OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='AuthRateBucket' AND c.relkind='r' AND pg_get_userbyid(c.relowner)=current_user))
  THEN RAISE EXCEPTION 'Reviewed completed rate migration and owned table required'; END IF;
END;
$guard$;
SELECT current_database() AS database, current_user AS role, session_user AS session_role;
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM product._prisma_migrations ORDER BY started_at;
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='product' AND c.relname IN ('_prisma_migrations','AuthRateBucket') ORDER BY c.relname;
COMMIT;
