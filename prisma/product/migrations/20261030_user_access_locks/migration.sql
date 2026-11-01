-- UNAPPLIED: additive account-access foundation, no public/admin/deletion endpoint.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $guard$
DECLARE expected text;
BEGIN
  expected := CASE current_database() WHEN 'stitchtrack_product_test' THEN 'stitchtrack_product_test_migrator'
    WHEN 'stitchtrack_product_dev' THEN 'stitchtrack_product_dev_migrator' END;
  IF expected IS NULL OR current_user<>expected OR session_user<>expected OR current_setting('port')<>'5432'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=expected)
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname IN ('User','_prisma_migrations') AND c.relkind='r' AND pg_get_userbyid(c.relowner)=expected)<>2
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations')
  THEN RAISE EXCEPTION 'Exact restricted isolated product migrator and owned objects required'; END IF;
  -- Exactly two completed reviewed predecessors and THIS clean in-flight Prisma row.
  -- File manifest pins this file's checksum; embedding its own digest is circular.
  IF (SELECT count(*) FROM product._prisma_migrations)<>3
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial'
      AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket'
      AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks'
      AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NULL
      AND applied_steps_count=0 AND checksum ~ '^[0-9a-f]{64}$')<>1
  THEN RAISE EXCEPTION 'Only exact successful predecessors and current clean Prisma record permitted'; END IF;
END;
$guard$;
ALTER TABLE "product"."User"
  ADD COLUMN "disabledAt" TIMESTAMPTZ(3),
  ADD COLUMN "deletionRequestedAt" TIMESTAMPTZ(3);
COMMIT;
