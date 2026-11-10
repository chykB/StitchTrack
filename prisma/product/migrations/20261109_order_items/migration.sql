-- PREPARED ONLY: tenth migration, isolated product-test. Owner review/execution required.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
SET LOCAL TimeZone='UTC';
DO $guard$
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999
    OR current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator'
    OR session_user<>current_user OR current_setting('port')<>'5432'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
    OR current_setting('server_encoding')<>'UTF8'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stitchtrack_product_test_app' AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') AND (c.relkind<>'r' OR pg_get_userbyid(c.relowner)<>current_user))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations')
    OR (SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind='r')
      IS DISTINCT FROM ARRAY['Account','AuthRateBucket','Business','BusinessMember','Client','EmailOutbox','EmailVerificationIssuance','MeasurementEntry','MeasurementVersion','Session','TermsAcceptance','TermsVersion','User','Verification','_prisma_migrations']::text[]
  THEN RAISE EXCEPTION 'Exact owned and restricted product-test target required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>10
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_password_reset' AND checksum='2a13abcd028ab3a37b840f6c62d7a46d761e96d3029201a0a67f1eca927de4ed' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_user_administrator' AND checksum='e6fd462d9de12bb85cb749b54f068819b6862213ab2348b7a25747de8c04e665' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261106_business_ownership' AND checksum='2da4b064634968dccac5cc8e05bbf767c5b5755b871915ae83a9be468e75c9f2' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261107_client_records' AND checksum='970d877fd5516d63200b8017e10d06bb437a20ecaa7b3c42b43e7616876ccb52' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261108_measurement_history' AND checksum='af18b1306e90c9833cd613cd3d9df2163084f250a96ff74df6b66731480c39d1' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261108_measurement_label_unicode' AND checksum='93897652a948ee943a6e51f1ca2e48d9ea085abde59f3e68dc859a46725a7275' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261109_order_items' AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=0 AND checksum ~ '^[0-9a-f]{64}$')<>1
  THEN RAISE EXCEPTION 'Nine completed migrations and this pending migration required'; END IF;
END;
$guard$;

-- Reference key only: retained measurement rows and existing grants are unchanged.
CREATE UNIQUE INDEX "MeasurementVersion_clientId_id_key"
  ON product."MeasurementVersion"("clientId","id");
CREATE TABLE product."Order" (
  "id" UUID NOT NULL,
  "businessId" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Order_id_clientId_key" ON product."Order"("id","clientId");
CREATE INDEX "Order_businessId_createdAt_id_idx" ON product."Order"("businessId","createdAt","id");
CREATE INDEX "Order_businessId_clientId_createdAt_id_idx" ON product."Order"("businessId","clientId","createdAt","id");
ALTER TABLE product."Order" ADD CONSTRAINT "Order_businessId_clientId_fkey"
  FOREIGN KEY ("businessId","clientId") REFERENCES product."Client"("businessId","id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE TABLE product."OrderItem" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "measurementVersionId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItem_description_check" CHECK (char_length("description") BETWEEN 1 AND 500 AND
    "description"=btrim("description", U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
);
CREATE INDEX "OrderItem_orderId_createdAt_id_idx" ON product."OrderItem"("orderId","createdAt","id");
CREATE INDEX "OrderItem_clientId_measurementVersionId_idx" ON product."OrderItem"("clientId","measurementVersionId");
ALTER TABLE product."OrderItem" ADD CONSTRAINT "OrderItem_orderId_clientId_fkey"
  FOREIGN KEY ("orderId","clientId") REFERENCES product."Order"("id","clientId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
-- MATCH SIMPLE permits NULL selection. Required clientId plus a non-NULL version
-- must match one complete parent key; it can never select another Client's version.
ALTER TABLE product."OrderItem" ADD CONSTRAINT "OrderItem_clientId_measurementVersionId_fkey"
  FOREIGN KEY ("clientId","measurementVersionId") REFERENCES product."MeasurementVersion"("clientId","id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Atomic creation with 1-50 initial items is a future service transaction requirement.
-- No prices, lifecycle fields, images, agreements, triggers, data writes or runtime grants.
REVOKE ALL ON TABLE product."Order", product."OrderItem" FROM PUBLIC, stitchtrack_product_test_app;
COMMIT;
