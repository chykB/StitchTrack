-- OWNER ONLY, PRODUCT TEST MIGRATOR. Explicit cleanup of one committed proof run.
-- Review run_id from the actual harness. No automatic execution or broad cleanup.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
SELECT set_config('stitchtrack.session_proof_run', :'run_id', true);
DO $guard$
DECLARE run text := current_setting('stitchtrack.session_proof_run'); ids text[];
BEGIN
  IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_migrator'
    OR current_user<>session_user OR NOT EXISTS (
      SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user)
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR run !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Exact restricted product-test migrator and proof UUID required'; END IF;
  ids := ARRAY['session-proof-' || run || '-verified', 'session-proof-' || run || '-unverified'];
  PERFORM 1 FROM product."User" WHERE id=ANY(ids) FOR UPDATE;
  IF (SELECT count(*) FROM product."User" WHERE id=ANY(ids) AND name='Synthetic session proof ' || run
      AND "emailCanonical"=id || '@example.invalid')<>2
    OR (SELECT count(*) FROM product."Account" WHERE "userId"=ANY(ids) AND id='credential-' || "userId"
      AND "accountId"="userId" AND "providerId"='credential')<>2
    OR EXISTS (SELECT 1 FROM product."Account" WHERE "userId"=ANY(ids) AND id<>'credential-' || "userId")
    OR EXISTS (SELECT 1 FROM product."TermsAcceptance" WHERE "userId"=ANY(ids))
    OR EXISTS (SELECT 1 FROM product."EmailVerificationIssuance" WHERE "userId"=ANY(ids))
  THEN RAISE EXCEPTION 'Expected fresh session-only fixture pair required; inspect unexpected/partial state'; END IF;
  DELETE FROM product."Session" WHERE "userId"=ANY(ids);
  DELETE FROM product."Account" WHERE "userId"=ANY(ids);
  DELETE FROM product."User" WHERE id=ANY(ids);
  IF EXISTS (SELECT 1 FROM product."User" WHERE id=ANY(ids))
    OR EXISTS (SELECT 1 FROM product."Account" WHERE "userId"=ANY(ids))
    OR EXISTS (SELECT 1 FROM product."Session" WHERE "userId"=ANY(ids))
  THEN RAISE EXCEPTION 'Fixture cleanup verification failed'; END IF;
  RAISE NOTICE 'Only this run synthetic fixtures removed; historical records untouched';
END;
$guard$;
COMMIT;
