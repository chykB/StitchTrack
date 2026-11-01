-- OWNER ONLY READ-ONLY test preflight. phase=before or after the third migration.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '5s';
SELECT set_config('stitchtrack.account_access_phase', :'phase', true);
DO $guard$
DECLARE phase text := current_setting('stitchtrack.account_access_phase'); count_expected integer;
BEGIN
  IF phase NOT IN ('before','after') OR current_database()<>'stitchtrack_product_test'
    OR current_user<>'stitchtrack_product_test_migrator' OR current_user<>session_user OR current_setting('port')<>'5432'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname IN ('User','Session','_prisma_migrations') AND c.relkind='r' AND pg_get_userbyid(c.relowner)=current_user)<>3
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations')
  THEN RAISE EXCEPTION 'Exact restricted isolated product-test migrator and phase required'; END IF;
  count_expected := CASE phase WHEN 'before' THEN 2 ELSE 3 END;
  IF (SELECT count(*) FROM product._prisma_migrations)<>count_expected
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial'
      AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff')
    OR NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket'
      AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c')
    OR EXISTS (SELECT 1 FROM product._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL OR logs IS NOT NULL OR applied_steps_count<>1)
    OR (phase='after' AND NOT EXISTS (SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd'))
  THEN RAISE EXCEPTION 'Exact reviewed completed history required; stop without retry/reset'; END IF;
  IF (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='User' AND a.attname IN ('disabledAt','deletionRequestedAt') AND NOT a.attisdropped)
      <> (CASE phase WHEN 'before' THEN 0 ELSE 2 END)
    OR (phase='after' AND EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='User' AND a.attname IN ('disabledAt','deletionRequestedAt')
        AND (a.attnotnull OR a.atthasdef OR a.atttypid<>'timestamptz'::regtype OR a.atttypmod<>3)))
  THEN RAISE EXCEPTION 'Expected absent or nullable precision-3 timestamp columns without defaults'; END IF;
END;
$guard$;
SELECT current_database() AS database, current_user AS role;
SELECT migration_name,checksum,finished_at,applied_steps_count FROM product._prisma_migrations ORDER BY migration_name;
SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.atthasdef
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='product' AND c.relname='User' AND a.attname IN ('disabledAt','deletionRequestedAt') AND NOT a.attisdropped;
SELECT count(*) AS user_row_count FROM product."User";
COMMIT;
