-- PROPOSAL: owner migrator only, not applied by this change.
-- Only stitchtrack_product_test is authorized; no development database path.
-- Existing SELECT on User, Account and Session is retained; no UPDATE is required
-- because this slice disables session renewal. token stores an HMAC digest, not the bearer.
-- User-wide revocation uses the same DELETE grant. No identity/Terms/history grants.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $guard$
DECLARE expected constant text := 'stitchtrack_product_test_migrator';
  runtime_role constant text := 'stitchtrack_product_test_app';
BEGIN
  IF current_database() <> 'stitchtrack_product_test' OR current_user <> expected OR current_user <> session_user
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=expected)
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_role AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relkind='r' AND pg_get_userbyid(c.relowner)<>expected)
  THEN RAISE EXCEPTION 'Exact restricted product migrator and nonowning runtime required'; END IF;
  IF to_regclass('product._prisma_migrations') IS NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='_prisma_migrations')
  THEN RAISE EXCEPTION 'Product-only migration history required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations) <> 1 OR NOT EXISTS (
    SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial'
      AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  THEN RAISE EXCEPTION 'Reviewed initial migration required'; END IF;
  IF NOT has_table_privilege(runtime_role, 'product."Session"', 'SELECT')
    OR has_schema_privilege(runtime_role, 'product', 'CREATE')
    OR has_any_column_privilege(runtime_role, 'product."Session"', 'UPDATE')
    OR has_table_privilege(runtime_role, 'product._prisma_migrations', 'SELECT')
    OR has_table_privilege(runtime_role, 'product._prisma_migrations', 'UPDATE')
  THEN RAISE EXCEPTION 'Existing minimum runtime permissions must be reviewed'; END IF;
END;
$guard$;
-- Better Auth createSession supplies these exact columns, including the ID.
GRANT INSERT ("id", "token", "userId", "expiresAt", "ipAddress", "userAgent", "createdAt", "updatedAt") ON product."Session" TO stitchtrack_product_test_app;
-- Adapter deleteSession uses DELETE WHERE token; PostgreSQL has no column DELETE grant.
GRANT DELETE ON product."Session" TO stitchtrack_product_test_app;
COMMIT;
