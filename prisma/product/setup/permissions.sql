-- OWNER MIGRATOR ONLY, after successful initial deploy; applies to this database only.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
DECLARE expected text;
BEGIN
  expected := CASE current_database()
    WHEN 'stitchtrack_product_dev' THEN 'stitchtrack_product_dev_migrator'
    WHEN 'stitchtrack_product_test' THEN 'stitchtrack_product_test_migrator' END;
  IF expected IS NULL OR current_user<>expected OR current_user<>session_user
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=expected)
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
  THEN RAISE EXCEPTION 'Exact isolated product migrator required'; END IF;
  IF to_regclass('product._prisma_migrations') IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations')
  THEN RAISE EXCEPTION 'Migration history must exist only in product'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>1 OR NOT EXISTS (
    SELECT 1 FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial'
      AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  THEN RAISE EXCEPTION 'Reviewed initial migration must be successfully recorded'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind='r')<>9
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relkind='r' AND pg_get_userbyid(c.relowner)<>expected)
  THEN RAISE EXCEPTION 'Expected eight product tables plus owned migration history'; END IF;
END;
$guard$;
SELECT CASE current_database() WHEN 'stitchtrack_product_test' THEN 'stitchtrack_product_test_app' ELSE 'stitchtrack_product_dev_app' END AS runtime_role,
  current_database()='stitchtrack_product_test' AS is_test \gset
-- Explicit tables: never grant on ALL TABLES or implicitly expose future tables/history.
REVOKE ALL ON TABLE product."User", product."Account", product."Session", product."Verification", product."TermsVersion",
  product."TermsAcceptance", product."EmailVerificationIssuance", product."EmailOutbox", product._prisma_migrations FROM PUBLIC, :"runtime_role";
GRANT SELECT ON TABLE product."User", product."Account", product."Session", product."Verification", product."TermsVersion",
  product."TermsAcceptance", product."EmailVerificationIssuance", product."EmailOutbox" TO :"runtime_role";
GRANT INSERT ON TABLE product."User", product."Account", product."Verification", product."TermsAcceptance",
  product."EmailVerificationIssuance", product."EmailOutbox" TO :"runtime_role";
GRANT UPDATE ("emailVerified", "updatedAt") ON product."User" TO :"runtime_role";
GRANT UPDATE ("failedAttempts", "consumedAt", "supersededAt") ON product."EmailVerificationIssuance" TO :"runtime_role";
GRANT UPDATE ("status", "updatedAt") ON product."EmailOutbox" TO :"runtime_role";
GRANT DELETE ON product."Verification" TO :"runtime_role";
\if :is_test
-- Fixture-only exception: no approval/effective columns, updates or deletes.
GRANT INSERT ("id", "version", "contentDigest", "immutableDocumentRef", "isTestFixture") ON product."TermsVersion" TO stitchtrack_product_test_app;
\endif
COMMIT;
