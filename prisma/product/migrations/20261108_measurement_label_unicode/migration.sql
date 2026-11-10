-- PREPARED ONLY: ninth migration, isolated product-test. Owner review/execution required.
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
  IF (SELECT count(*) FROM product._prisma_migrations)<>9
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_password_reset' AND checksum='2a13abcd028ab3a37b840f6c62d7a46d761e96d3029201a0a67f1eca927de4ed' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_user_administrator' AND checksum='e6fd462d9de12bb85cb749b54f068819b6862213ab2348b7a25747de8c04e665' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261106_business_ownership' AND checksum='2da4b064634968dccac5cc8e05bbf767c5b5755b871915ae83a9be468e75c9f2' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261107_client_records' AND checksum='970d877fd5516d63200b8017e10d06bb437a20ecaa7b3c42b43e7616876ccb52' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261108_measurement_history' AND checksum='af18b1306e90c9833cd613cd3d9df2163084f250a96ff74df6b66731480c39d1' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261108_measurement_label_unicode' AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=0 AND checksum ~ '^[0-9a-f]{64}$')<>1
  THEN RAISE EXCEPTION 'Eight completed migrations and this pending migration required'; END IF;
END;
$guard$;

-- Serialize duplicate inspection and index replacement, including readers/other DDL.
LOCK TABLE product."MeasurementEntry" IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace
      WHERE n.nspname='pg_catalog' AND c.collname='und-x-icu' AND c.collprovider='i')
    OR EXISTS (SELECT 1 FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace
      WHERE n.nspname='product' AND c.collname='measurement_label_ci')
    OR NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='MeasurementEntry_version_label_key'
      AND i.indrelid='product."MeasurementEntry"'::regclass AND i.indisunique AND i.indisvalid AND i.indisready
      AND i.indnkeyatts=2 AND i.indnatts=2 AND i.indpred IS NULL
      AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='measurementVersionId' AND NOT attisdropped)
      AND i.indkey[1]=0 AND pg_get_expr(i.indexprs,i.indrelid) IN ('lower(name)','lower("name")')
      AND i.indcollation[1]=(SELECT attcollation FROM pg_attribute WHERE attrelid=i.indrelid AND attname='name' AND NOT attisdropped))
  THEN RAISE EXCEPTION 'Reviewed original label index, ICU support and unused collation name required'; END IF;
END;
$guard$;

-- Owned by the executing product-test schema owner. No role/schema/column privilege changes.
CREATE COLLATION product.measurement_label_ci
  (provider = icu, locale = 'und-u-kk-true-ks-level2', deterministic = false);
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace
    WHERE n.nspname='product' AND c.collname='measurement_label_ci' AND pg_get_userbyid(c.collowner)=current_user
      AND c.collprovider='i' AND NOT c.collisdeterministic
      AND c.colliculocale IN ('und-u-kk-true-ks-level2','und-u-kk-ks-level2')
      AND c.collversion IS NOT NULL AND pg_collation_actual_version(c.oid) IS NOT NULL
      AND c.collversion=pg_collation_actual_version(c.oid))
  THEN RAISE EXCEPTION 'Exact owned ICU collation and current provider version required'; END IF;
  -- Required semantic canaries run on the real ICU implementation, without rewriting labels.
  IF NOT ('Chest' COLLATE product.measurement_label_ci='CHEST')
    OR NOT (U&'\00C9paule' COLLATE product.measurement_label_ci=U&'\00E9PAULE')
    OR NOT (U&'\00CCB\00C0D\00CD' COLLATE product.measurement_label_ci=U&'\00ECb\00E0d\00ED')
    OR NOT (U&'\00E9paule' COLLATE product.measurement_label_ci=U&'e\0301paule')
    OR NOT (U&'e\0323\0302' COLLATE product.measurement_label_ci=U&'e\0302\0323')
    OR (U&'\00E9paule' COLLATE product.measurement_label_ci='Epaule')
    OR (U&'\00ECb\00E0d\00ED' COLLATE product.measurement_label_ci=U&'\00ECb\00E1d\00ED')
  THEN RAISE EXCEPTION 'Required case, canonical-equivalence and accent-distinction semantics not met'; END IF;
  -- Uses precisely the future unique key, under the same transaction/table lock.
  -- Return no IDs, labels, values or duplicate groups to the migration log.
  IF EXISTS (SELECT 1 FROM product."MeasurementEntry"
      GROUP BY "measurementVersionId","name" COLLATE product.measurement_label_ci HAVING count(*)>1)
  THEN RAISE EXCEPTION 'Measurement label collisions require separate owner review; no labels changed' USING ERRCODE='23505'; END IF;
END;
$guard$;

-- RESTRICT/default dependency handling; no CASCADE or changes to the composite primary key.
DROP INDEX product."MeasurementEntry_version_label_key";
CREATE UNIQUE INDEX "MeasurementEntry_version_label_key"
  ON product."MeasurementEntry"("measurementVersionId","name" COLLATE product.measurement_label_ci);
COMMIT;
