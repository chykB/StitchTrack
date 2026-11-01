-- UNAPPLIED additive migration; only the exact reviewed product Prisma manifest admits it.
-- No changes to the applied eight-table baseline, sessions, identities or history.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $guard$
DECLARE expected text;
BEGIN
  expected := CASE current_database()
    WHEN 'stitchtrack_product_test' THEN 'stitchtrack_product_test_migrator'
    WHEN 'stitchtrack_product_dev' THEN 'stitchtrack_product_dev_migrator' END;
  IF expected IS NULL OR current_user <> expected OR session_user <> expected
    OR current_setting('port') <> '5432'
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=expected)
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='_prisma_migrations' AND pg_get_userbyid(c.relowner)=expected)
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='_prisma_migrations')
  THEN RAISE EXCEPTION 'Exact isolated product migrator and history required'; END IF;
  -- Prisma inserts THIS migration's clean tracking row before executing its SQL.
  -- The read-only owner preflight requires the initial row alone BEFORE deploy.
  -- Here exactly that completed initial row plus our own in-flight row may exist.
  -- Our file checksum is pinned outside this SQL by the Prisma file manifest;
  -- embedding its own checksum here would require a self-referential digest.
  IF (SELECT count(*) FROM product._prisma_migrations) <> 2
    OR (SELECT count(*) FROM product._prisma_migrations
      WHERE migration_name='20261029_product_auth_initial'
        AND checksum='7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL
        AND applied_steps_count=1) <> 1
    OR (SELECT count(*) FROM product._prisma_migrations
      WHERE migration_name='20261030_auth_rate_bucket'
        AND started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL
        AND logs IS NULL AND applied_steps_count=0 AND checksum ~ '^[0-9a-f]{64}$') <> 1
  THEN RAISE EXCEPTION 'Only the exact completed initial and current clean Prisma migration records are permitted'; END IF;
END;
$guard$;
CREATE TABLE "product"."AuthRateBucket" (
  "keyDigest" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "refillIntervalMs" INTEGER NOT NULL,
  "tokens" INTEGER NOT NULL,
  "refilledAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "lastAllowed" BOOLEAN NOT NULL,
  CONSTRAINT "AuthRateBucket_pkey" PRIMARY KEY ("keyDigest"),
  CONSTRAINT "AuthRateBucket_digest_check" CHECK ("keyDigest" COLLATE "C" ~ '^rl:v1:[0-9a-f]{64}$'),
  CONSTRAINT "AuthRateBucket_policy_check" CHECK (
    "capacity" > 0 AND "refillIntervalMs" > 0 AND "capacity"::bigint * "refillIntervalMs" <= 2147483647),
  CONSTRAINT "AuthRateBucket_tokens_check" CHECK ("tokens" BETWEEN 0 AND "capacity"),
  CONSTRAINT "AuthRateBucket_time_check" CHECK (
    isfinite("refilledAt") AND isfinite("expiresAt") AND "expiresAt" >= "refilledAt"
    AND "expiresAt" = "refilledAt" + ("capacity" - "tokens") * "refillIntervalMs" * INTERVAL '1 millisecond')
);
CREATE INDEX "AuthRateBucket_expiresAt_keyDigest_idx" ON "product"."AuthRateBucket"("expiresAt", "keyDigest");
COMMIT;
