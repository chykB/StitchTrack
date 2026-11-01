-- OWNER MIGRATOR ONLY: additive grants on the reviewed product target.
-- Owner-applied to stitchtrack_product_test; no development/production application is implied.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
DECLARE expected text; runtime text;
BEGIN
  expected:=CASE current_database() WHEN 'stitchtrack_product_dev' THEN 'stitchtrack_product_dev_migrator'
    WHEN 'stitchtrack_product_test' THEN 'stitchtrack_product_test_migrator' END;
  runtime:=CASE current_database() WHEN 'stitchtrack_product_dev' THEN 'stitchtrack_product_dev_app'
    WHEN 'stitchtrack_product_test' THEN 'stitchtrack_product_test_app' END;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=runtime)
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND pg_get_userbyid(c.relowner)=runtime)
  THEN RAISE EXCEPTION 'Existing non-owning restricted product runtime required'; END IF;
  IF expected IS NULL OR current_user<>expected OR session_user<>expected OR current_setting('port')<>'5432'
    OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=expected)
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
  THEN RAISE EXCEPTION 'Exact restricted product migrator required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='product' AND c.relname='_prisma_migrations' AND pg_get_userbyid(c.relowner)=expected)
  THEN RAISE EXCEPTION 'Owned product migration history required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>1 OR NOT EXISTS(SELECT 1 FROM product._prisma_migrations
    WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  THEN RAISE EXCEPTION 'Successful reviewed initial migration required'; END IF;
END;
$guard$;
SELECT CASE current_database() WHEN 'stitchtrack_product_test' THEN 'stitchtrack_product_test_app' ELSE 'stitchtrack_product_dev_app' END AS runtime_role \gset
-- Existing SELECT/status/updatedAt rights remain. No identity, Terms, history,
-- schema ownership, INSERT, DELETE or blanket table UPDATE grant is added.
GRANT UPDATE ("attemptCount", "availableAt", "sentAt") ON product."EmailOutbox" TO :"runtime_role";
COMMIT;
