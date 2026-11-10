-- PREPARED ONLY: sixth migration, isolated product-test. Owner review/execution required.
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
      IS DISTINCT FROM ARRAY['Account','AuthRateBucket','EmailOutbox','EmailVerificationIssuance','Session','TermsAcceptance','TermsVersion','User','Verification','_prisma_migrations']::text[]
  THEN RAISE EXCEPTION 'Exact owned and restricted product-test target required'; END IF;
  IF (SELECT count(*) FROM product._prisma_migrations)<>6
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261029_product_auth_initial' AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_auth_rate_bucket' AND checksum='282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261030_user_access_locks' AND checksum='89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_password_reset' AND checksum='2a13abcd028ab3a37b840f6c62d7a46d761e96d3029201a0a67f1eca927de4ed' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261102_user_administrator' AND checksum='e6fd462d9de12bb85cb749b54f068819b6862213ab2348b7a25747de8c04e665' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=1)<>1
    OR (SELECT count(*) FROM product._prisma_migrations WHERE migration_name='20261106_business_ownership' AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NULL AND applied_steps_count=0 AND checksum ~ '^[0-9a-f]{64}$')<>1
  THEN RAISE EXCEPTION 'Five completed migrations and this pending migration required'; END IF;
END;
$guard$;

CREATE TABLE product."Business" (
  "id" TEXT NOT NULL,
  "primaryOwnerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Business_pkey" PRIMARY KEY ("id"),
  -- PostgreSQL UTF8 char_length counts Unicode code points. Store the trimmed value.
  CONSTRAINT "Business_name_check" CHECK (char_length("name") BETWEEN 2 AND 120 AND
    "name"=btrim("name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  CONSTRAINT "Business_timeZone_check" CHECK ("timeZone"='Africa/Lagos')
);
CREATE TABLE product."BusinessMember" (
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessMember_pkey" PRIMARY KEY ("businessId","userId")
);
-- This is owner-specific uniqueness; ordinary memberships have no user-wide unique key.
CREATE UNIQUE INDEX "Business_primaryOwnerUserId_key" ON product."Business"("primaryOwnerUserId");
CREATE INDEX "BusinessMember_userId_idx" ON product."BusinessMember"("userId");
ALTER TABLE product."BusinessMember" ADD CONSTRAINT "BusinessMember_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES product."Business"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE product."BusinessMember" ADD CONSTRAINT "BusinessMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES product."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Required owner must be a member of THIS business at COMMIT. Insert Business,
-- then BusinessMember in one transaction; an incomplete pair cannot commit.
-- NO ACTION remains non-cascading but permits future reviewed transactional
-- removal of both rows. Circular immediate RESTRICT edges would prevent that.
ALTER TABLE product."Business" ADD CONSTRAINT "Business_id_primaryOwnerUserId_fkey"
  FOREIGN KEY ("id","primaryOwnerUserId") REFERENCES product."BusinessMember"("businessId","userId")
  ON DELETE NO ACTION ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
REVOKE ALL ON TABLE product."Business", product."BusinessMember" FROM PUBLIC, stitchtrack_product_test_app;
COMMIT;
