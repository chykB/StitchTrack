-- Initial product authentication DRAFT: prepared offline, never executed.
-- Owner must approve/provision exact migration identity and guarded deploy first.
-- Existing namespace required; no schema, role, grants or history are created here.
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $target$
BEGIN
  IF current_database() NOT IN ('stitchtrack_product_dev', 'stitchtrack_product_test')
    OR current_user IN ('stitchtrack_product_dev_app', 'stitchtrack_product_test_app')
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'product' AND nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user))
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
  THEN RAISE EXCEPTION 'Approved isolated product migration target/namespace owner required'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'product' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND c.relname <> '_prisma_migrations')
  THEN RAISE EXCEPTION 'Initial product namespace must be empty except migration tracking'; END IF;
END;
$target$;

-- Checks validate storage shape; application validation never rewrites accepted passwords.
-- PHC parameters are positive and versioned, not pinned to one work-factor profile.

CREATE TABLE "product"."User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "emailCanonical" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_name_nonblank_check" CHECK (length(translate("name", U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF', '')) > 0),
  CONSTRAINT "User_email_canonical_check" CHECK ("emailCanonical" COLLATE "C" ~ '^[!-~]+$' AND "emailCanonical" COLLATE "C" !~ '[A-Z]' AND "emailCanonical" LIKE '%@%')
);

CREATE TABLE "product"."Account" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "password" TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ(3),
  "refreshTokenExpiresAt" TIMESTAMPTZ(3),
  "scope" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Account_credential_check" CHECK ("providerId" = 'credential' AND "accountId" = "userId" AND "password" IS NOT NULL
    AND "password" COLLATE "C" ~ '^[$]argon2id[$]v=19[$]m=[1-9][0-9]*,t=[1-9][0-9]*,p=[1-9][0-9]*[$][A-Za-z0-9+/]{22,}[$][A-Za-z0-9+/]{43,}$'
    AND "accessToken" IS NULL AND "refreshToken" IS NULL AND "idToken" IS NULL AND "scope" IS NULL
    AND "accessTokenExpiresAt" IS NULL AND "refreshTokenExpiresAt" IS NULL)
);

CREATE TABLE "product"."Session" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_expiry_check" CHECK (isfinite("createdAt") AND isfinite("expiresAt") AND "expiresAt" > "createdAt")
);

CREATE TABLE "product"."Verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Verification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Verification_expiry_check" CHECK (isfinite("createdAt") AND isfinite("expiresAt") AND "expiresAt" > "createdAt")
);

CREATE TABLE "product"."TermsVersion" (
  "id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "contentDigest" TEXT NOT NULL,
  "immutableDocumentRef" TEXT NOT NULL,
  "isTestFixture" BOOLEAN NOT NULL DEFAULT false,
  "approvedAt" TIMESTAMPTZ(3),
  "effectiveAt" TIMESTAMPTZ(3),
  CONSTRAINT "TermsVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TermsVersion_artifact_check" CHECK (length(btrim("version")) > 0 AND length(btrim("immutableDocumentRef")) > 0 AND "contentDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "TermsVersion_approval_check" CHECK (("isTestFixture" AND "approvedAt" IS NULL AND "effectiveAt" IS NULL)
    OR (NOT "isTestFixture" AND "approvedAt" IS NOT NULL AND "effectiveAt" IS NOT NULL AND isfinite("approvedAt") AND isfinite("effectiveAt") AND "approvedAt" <= "effectiveAt"))
);

CREATE TABLE "product"."TermsAcceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "termsVersionId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "context" TEXT NOT NULL,
  CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TermsAcceptance_event_check" CHECK (isfinite("acceptedAt") AND "context" IN ('synthetic-test', 'tailor-registration'))
);

CREATE TABLE "product"."EmailOutbox" (
  "id" TEXT NOT NULL,
  "issuanceId" TEXT NOT NULL,
  "templateVersion" TEXT NOT NULL,
  "payloadCiphertext" BYTEA NOT NULL,
  "nonce" BYTEA NOT NULL,
  "authTag" BYTEA NOT NULL,
  "keyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "sentAt" TIMESTAMPTZ(3),
  CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Outbox_envelope_check" CHECK (octet_length("nonce") = 12 AND octet_length("authTag") = 16
    AND octet_length("payloadCiphertext") BETWEEN 1 AND 4096 AND "keyId" COLLATE "C" ~ '^[A-Za-z0-9_-]{1,64}$' AND length(btrim("templateVersion")) > 0),
  CONSTRAINT "Outbox_state_check" CHECK ("status" IN ('pending', 'sent', 'cancelled') AND "attemptCount" >= 0),
  CONSTRAINT "Outbox_delivery_check" CHECK (isfinite("createdAt") AND isfinite("availableAt") AND "availableAt" >= "createdAt"
    AND (("status" = 'sent' AND "sentAt" IS NOT NULL AND isfinite("sentAt") AND "sentAt" >= "availableAt" AND "attemptCount" >= 1)
      OR ("status" IN ('pending', 'cancelled') AND "sentAt" IS NULL)))
);

CREATE TABLE "product"."EmailVerificationIssuance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailCanonical" TEXT NOT NULL,
  "verificationId" TEXT,
  "verifier" BYTEA NOT NULL,
  "verifierKeyId" TEXT NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "supersededAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationIssuance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Issuance_verifier_check" CHECK (octet_length("verifier") = 32 AND "verifierKeyId" COLLATE "C" ~ '^[A-Za-z0-9_-]{1,64}$'),
  CONSTRAINT "Issuance_attempts_check" CHECK ("failedAttempts" BETWEEN 0 AND 3),
  CONSTRAINT "Issuance_expiry_check" CHECK (isfinite("createdAt") AND isfinite("expiresAt") AND "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '5 minutes'),
  CONSTRAINT "Issuance_terminal_check" CHECK (NOT ("consumedAt" IS NOT NULL AND "supersededAt" IS NOT NULL)
    AND ("consumedAt" IS NULL OR (isfinite("consumedAt") AND "consumedAt" >= "createdAt" AND "consumedAt" < "expiresAt" AND "failedAttempts" < 3 AND "verificationId" IS NULL))
    AND ("supersededAt" IS NULL OR (isfinite("supersededAt") AND "supersededAt" >= "createdAt")))
);

-- Standard unique and lookup indexes mirror schema.prisma. Each adds insert/update maintenance.
CREATE UNIQUE INDEX "User_emailCanonical_key" ON "product"."User"("emailCanonical");
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "product"."Account"("providerId", "accountId");
CREATE INDEX "Account_userId_idx" ON "product"."Account"("userId");
CREATE UNIQUE INDEX "Session_token_key" ON "product"."Session"("token");
CREATE INDEX "Session_userId_idx" ON "product"."Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "product"."Session"("expiresAt");
CREATE INDEX "Verification_identifier_idx" ON "product"."Verification"("identifier");
CREATE INDEX "Verification_expiresAt_idx" ON "product"."Verification"("expiresAt");
CREATE UNIQUE INDEX "TermsVersion_version_key" ON "product"."TermsVersion"("version");
CREATE UNIQUE INDEX "TermsAcceptance_userId_termsVersionId_key" ON "product"."TermsAcceptance"("userId", "termsVersionId");
CREATE INDEX "TermsAcceptance_termsVersionId_idx" ON "product"."TermsAcceptance"("termsVersionId");
CREATE UNIQUE INDEX "EmailOutbox_issuanceId_key" ON "product"."EmailOutbox"("issuanceId");
CREATE INDEX "EmailOutbox_status_availableAt_idx" ON "product"."EmailOutbox"("status", "availableAt");
CREATE UNIQUE INDEX "EmailVerificationIssuance_verificationId_key" ON "product"."EmailVerificationIssuance"("verificationId");
CREATE INDEX "EmailVerificationIssuance_userId_createdAt_idx" ON "product"."EmailVerificationIssuance"("userId", "createdAt");
CREATE INDEX "EmailVerificationIssuance_expiresAt_idx" ON "product"."EmailVerificationIssuance"("expiresAt");

-- Expired/exhausted rows retain this slot until the locked writer supersedes them.
-- Terminal-first reissue avoids a transient uniqueness violation; no volatile time predicate.
CREATE UNIQUE INDEX "Issuance_one_open_per_user" ON "product"."EmailVerificationIssuance"("userId")
  WHERE "consumedAt" IS NULL AND "supersededAt" IS NULL;

ALTER TABLE "product"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "product"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "product"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "product"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "product"."TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "product"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "product"."TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_termsVersionId_fkey" FOREIGN KEY ("termsVersionId") REFERENCES "product"."TermsVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "product"."EmailOutbox" ADD CONSTRAINT "EmailOutbox_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "product"."EmailVerificationIssuance"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "product"."EmailVerificationIssuance" ADD CONSTRAINT "EmailVerificationIssuance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "product"."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "product"."EmailVerificationIssuance" ADD CONSTRAINT "EmailVerificationIssuance_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "product"."Verification"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

COMMIT;
