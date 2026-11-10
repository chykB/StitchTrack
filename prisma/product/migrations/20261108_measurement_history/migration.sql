-- PREPARED ONLY: eighth migration, isolated product-test. Owner review/execution required.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
SET LOCAL TimeZone='UTC';
DO $guard$
BEGIN
  IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator'
    OR session_user<>current_user OR current_setting('port')<>'5432'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
    OR current_setting('server_encoding')<>'UTF8'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stitchtrack_product_test_app' AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') AND (c.relkind<>'r' OR pg_get_userbyid(c.relowner)<>current_user))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations')
    OR (SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind='r')
      IS DISTINCT FROM ARRAY['Account','AuthRateBucket','Business','BusinessMember','Client','EmailOutbox','EmailVerificationIssuance','Session','TermsAcceptance','TermsVersion','User','Verification','_prisma_migrations']::text[]
  THEN RAISE EXCEPTION 'Exact owned and restricted product-test target required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>8
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_password_reset' AND checksum='2a13abcd028ab3a37b840f6c62d7a46d761e96d3029201a0a67f1eca927de4ed' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_user_administrator' AND checksum='e6fd462d9de12bb85cb749b54f068819b6862213ab2348b7a25747de8c04e665' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261106_business_ownership' AND checksum='2da4b064634968dccac5cc8e05bbf767c5b5755b871915ae83a9be468e75c9f2' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261107_client_records' AND checksum='970d877fd5516d63200b8017e10d06bb437a20ecaa7b3c42b43e7616876ccb52' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261108_measurement_history' AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=0 AND checksum ~ '^[0-9a-f]{64}$')<>1
  THEN RAISE EXCEPTION 'Seven completed migrations and this pending migration required'; END IF;
END;
$guard$;

-- Reference key only: no existing Client values or ownership are changed.
CREATE UNIQUE INDEX "Client_businessId_id_key" ON product."Client"("businessId","id");
CREATE TABLE product."MeasurementVersion" (
  "id" UUID NOT NULL,
  "businessId" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeasurementVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeasurementVersion_versionNumber_check" CHECK ("versionNumber">=1),
  CONSTRAINT "MeasurementVersion_unit_check" CHECK ("unit" IN ('cm','in'))
);
CREATE UNIQUE INDEX "MeasurementVersion_clientId_versionNumber_key"
  ON product."MeasurementVersion"("clientId","versionNumber");
ALTER TABLE product."MeasurementVersion" ADD CONSTRAINT "MeasurementVersion_businessId_clientId_fkey"
  FOREIGN KEY ("businessId","clientId") REFERENCES product."Client"("businessId","id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE TABLE product."MeasurementEntry" (
  "measurementVersionId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  -- No numeric(p,s) typmod: never silently round input before CHECK evaluation.
  "value" NUMERIC NOT NULL,
  CONSTRAINT "MeasurementEntry_pkey" PRIMARY KEY ("measurementVersionId","name"),
  CONSTRAINT "MeasurementEntry_name_check" CHECK (char_length("name") BETWEEN 1 AND 60 AND
    "name"=btrim("name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') AND
    length(translate("name", U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF', ''))>0),
  CONSTRAINT "MeasurementEntry_value_check" CHECK ("value">0 AND "value"<=1000 AND scale("value")<=2)
);
-- Required in addition to Prisma's composite primary key; expression indexes are SQL-only.
CREATE UNIQUE INDEX "MeasurementEntry_version_label_key"
  ON product."MeasurementEntry"("measurementVersionId",lower("name"));
ALTER TABLE product."MeasurementEntry" ADD CONSTRAINT "MeasurementEntry_measurementVersionId_fkey"
  FOREIGN KEY ("measurementVersionId") REFERENCES product."MeasurementVersion"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
-- A complete 1-50-entry set and sequential allocation require the future service transaction.
-- No UPDATE/DELETE/cascade, runtime grants, cleanup grants, triggers or extensions.
REVOKE ALL ON TABLE product."MeasurementVersion", product."MeasurementEntry" FROM PUBLIC, stitchtrack_product_test_app;
COMMIT;
