-- UNAPPLIED product-test-only reset purpose separation. Owner review/execution required.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $guard$
BEGIN
  IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator'
    OR session_user<>current_user OR current_setting('port')<>'5432'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname IN ('EmailVerificationIssuance','EmailOutbox','Account','_prisma_migrations') AND c.relkind='r' AND pg_get_userbyid(c.relowner)=current_user)<>4
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations')
  THEN RAISE EXCEPTION 'Exact owned product-test target required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>4
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_password_reset'
      AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=0 AND checksum ~ '^[0-9a-f]{64}$')<>1
  THEN RAISE EXCEPTION 'Only reviewed predecessors and clean current migration permitted'; END IF;
END;
$guard$;
-- Existing rows are signup verification. Purpose is immutable to the runtime role.
ALTER TABLE product."EmailVerificationIssuance" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'email-verification';
ALTER TABLE product."EmailVerificationIssuance" ADD CONSTRAINT "Issuance_purpose_check" CHECK ("purpose" IN ('email-verification','password-reset'));
DROP INDEX product."Issuance_one_open_per_user";
CREATE UNIQUE INDEX "Issuance_one_open_per_user" ON product."EmailVerificationIssuance" ("userId","purpose")
  WHERE "consumedAt" IS NULL AND "supersededAt" IS NULL;
COMMIT;
