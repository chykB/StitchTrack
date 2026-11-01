# Internal tailor session PostgreSQL verification

The owner completed the committed-session PostgreSQL proof for run `efa712f4-94f6-431a-958a-bc2decb8f893` with integration exit status **0**, followed by the reviewed synthetic cleanup with **DO, COMMIT and exit status 0**. Both database connections closed successfully. The owner confirmed that PostgreSQL reported the exact synthetic fixtures removed. These are owner-reported results, not agent-executed operations. Public authentication remains disabled.

The completed scope includes invalid/unverified login refusal, two distinct tokens/digests, committed digest-only persistence, independent-connection lookup, individual logout, expiry and user-wide revocation. See the [Task Five session record](../../task-05-sessions-compliance-defence/docs/sessions.md) for the evidence boundary and unfinished browser requirements. No token values, raw output, screenshots or execution date are invented. The retained procedures below are provenance, **not instructions to rerun this completed run or reapply grants**.

Historical permission sequence: the initial preflight found Session SELECT only. The first additive-SQL attempt failed in its DO guard with permission denied for schema public (psql exit 3); no GRANT or COMMIT occurred during that failed attempt. The later successful harness checked its required runtime permissions and exercised Session insertion/deletion. A separate successful grant-command transcript has not been supplied here, and no development grant is inferred.

The failing expression was `to_regclass('public._prisma_migrations')`: resolving that qualified name requires public-schema access even when the relation is absent. The corrected guard uses a read-only pg_catalog.pg_class/pg_namespace EXISTS check, still rejecting any relation named public._prisma_migrations without accessing that schema. No public USAGE/CREATE grant is introduced. The remaining product-qualified lookups/history reads are intentional: the exact migrator owns product and its reviewed tables. Catalog/role inspection uses pg_catalog through the restricted search_path. The owner subsequently completed the scoped proof above; preserve the original failed output as history.

The retained initial-only permission script belongs to the original controlled sequence.
Product-test now has three applied migrations; its initial-only history guard will reject
that later state. Do not rerun grants, weaken guards or alter history. Any future setup
needs a separately reviewed sequence and actual ACL inspection.

## 1. Retained permission review procedure

Review [session-permissions.sql](setup/session-permissions.sql) and the [owner harness](../../tests/product-auth/session.integration.mjs). Existing User/Account/Session SELECT grants remain. Better Auth 1.7.7 inserts all eight Session columns, uses the public adapter wrapper to store/lookup only the domain-separated HMAC digest of the signed-cookie bearer, and deletes by digest on logout/expiry. User-wide revocation deletes by userId. The proposal authorizes only stitchtrack_product_test, stitchtrack_product_test_migrator and stitchtrack_product_test_app; no development-database path remains. Grant only those INSERT columns and table DELETE; PostgreSQL has no column-level DELETE. No Session UPDATE is needed because renewal is explicitly disabled. The service never exposes the Better Auth handler or registration/OTP endpoints.

The following **read-only** preflight is retained for reference; the owner already passed it and need not repeat it solely for this change. Use the private password prompt; do not paste URLs or credentials into logs. Do not read or source private environment files through agent tooling.

```bash
cd /home/bmalik/stitchtrack
/usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
  --set=ON_ERROR_STOP=on --pset=pager=off <<'SQL'
SELECT current_database(), current_user;
SELECT nspname, pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='product';
SELECT migration_name, checksum, finished_at, rolled_back_at FROM product._prisma_migrations;
SELECT has_table_privilege('stitchtrack_product_test_app','product."Session"','SELECT') AS can_read,
       has_any_column_privilege('stitchtrack_product_test_app','product."Session"','INSERT') AS can_insert,
       has_any_column_privilege('stitchtrack_product_test_app','product."Session"','UPDATE') AS can_update,
       has_table_privilege('stitchtrack_product_test_app','product."Session"','DELETE') AS can_delete;
SQL
```

At that historical stage, an unexpected database/role/owner, unresolved migration, checksum mismatch or UPDATE grant required stopping. The sole expected completed initial migration checksum was `7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff`. The historical pre-grant baseline had SELECT only. The completed harness required Session SELECT/INSERT/DELETE and no UPDATE. The additive script targets test only; its retained invocation uses the same psql flags and `--file=prisma/product/setup/session-permissions.sql` instead of the heredoc. Do not reapply it merely to follow this record. No development grant is implied.

## 2. Completed proof and retained procedure

Pause other product-test writers/workers. Preserve existing records; do not rerun the old empty-database registration harness. Privately supply the existing guarded `PRODUCT_TEST_DATABASE_URL` to the owner's shell, without echoing it. The generated isolated product client must already exist; this command generates nothing.

```bash
cd /home/bmalik/stitchtrack
set -o pipefail
NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
  PRODUCT_SESSION_INTEGRATION_CONFIRMED=true \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/session.integration.mjs --owner-integration
```

The owner reported integration exit status 0 for the completed run. Preserve any genuine existing output privately; this summary does not reconstruct a terminal transcript. A future run requires separate authorization and actual status capture. Test policy is explicitly 600 seconds/fixed expiry, plus a separate one-second expiry probe, not an approved tailor policy.

The revised harness uses **two independent Prisma/adapter pools** and confirms different PostgreSQL backend PIDs, the exact runtime identity and minimum grants. It atomically creates and commits two fresh, uniquely marked synthetic User/Account fixtures. One is deliberately verified only as a session-test fixture; this is not OTP or Terms approval evidence. No Terms, issuance or outbox record is created.

Two independent logins then commit sessions. The other connection checks that stored values equal the expected HMAC digests, differ from the original bearer tokens, and resolve through both original signed cookies. It tests individual logout while the other session survives, a separately committed one-second expiry probe, and authenticated user-wide revocation. Logging contains only named outcomes and a nonsecret run UUID; no tokens, digests, cookie values, addresses, hashes, keys or URLs are printed. The original rollback-only harness was not proof of committed persistence; the owner has now executed this committed revision successfully. Future repetitions require separate review and authorization.

**Completed fixture lifecycle:** the proof committed two new synthetic User and Account records and removed their sessions; the owner subsequently removed the exact fresh fixtures using the reviewed cleanup SQL. No cleanup remains pending for this run. Fixture setup uses ordinary CREATE with fresh UUID-derived primary keys and unique emails, never upsert/update; a collision aborts its real transaction. The unknown-account probe is checked absent before fixture creation. Pause other test writers throughout the proof. Only fixture cookies/user IDs drive revocation; no historical identity is intentionally authenticated or modified. Aggregate counts must differ only by those two pairs. On failure partial committed fixture sessions may remain; preserve output and do not automatically rerun. Keys are random in memory and lost on exit, so these fixtures are not reusable operational sessions. Every successfully constructed client is registered inside a try/finally before constructing the next. Success, assertion failure and second-constructor failure all attempt cleanup; one disconnect failure does not prevent the other attempt. A disconnect failure produces a sanitized failure rather than a cleanup-success banner. No application operation is automatically retried. A lost signing/storage key invalidates access; it does not delete persisted rows.

The reviewed [runtime permissions](setup/permissions.sql) already grant table-level SELECT on all eight domain models listed by totals(), including TermsVersion and TermsAcceptance. Their restricted INSERT/UPDATE permissions do not prevent COUNT. Migration history is not included. No reporting grants are added. Effective missing SELECT will stop the baseline before fixture writes; this is still owner-run verification, not a live grant inspection by the agent. Aggregate counts are change indicators, not a row-by-row historical audit.

## 3. Completed owner cleanup and retained procedure

Committed persistence cannot be demonstrated using rollback-only fixture setup. The runtime has no User/Account DELETE privilege, and none is proposed. Review [session-test-cleanup.sql](setup/session-test-cleanup.sql) **before** authorizing the harness. Afterwards, the existing product-test migrator may remove only that run's exact fresh fixture pair. No historical fixture, Terms acceptance, issuance or migration history is deleted. Cleanup locks the users and stops on unexpected identity/relationship state; the whole cleanup transaction rolls back on failure.

The owner completed cleanup for `efa712f4-94f6-431a-958a-bc2decb8f893` with DO, COMMIT and exit status 0. Do not rerun it: its fixture-presence guards should now stop. For any separately authorized future run, replace the retained placeholder below with that run's actual UUID. It is a cleanup correlation, not a password or token. Supply only the existing migrator password at its private prompt.

```bash
cd /home/bmalik/stitchtrack
/usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
  --set=ON_ERROR_STOP=on --set=run_id=REPLACE_WITH_ACTUAL_RUN_UUID \
  --file=prisma/product/setup/session-test-cleanup.sql
```

Preserve actual cleanup output/status and require COMMIT/exit zero. The UUID, exact synthetic IDs/names/email shape, credential ownership and absence of Terms/issuance relationships are checked before deletion. If the harness failed before fixture creation or a required row is missing, stop for investigation instead of bypassing cleanup guards. Do not reapply grants, reset, bulk-delete or edit migration history. The owner completed the cleanup reported above; the agent executed no cleanup command.

## HTTP activation remains separate

The owner subsequently approved fixed seven-day tailor expiry, no renewal/inactivity timeout and no remember-me choice. The current local composition enforces it, disables cookie caching and rejects production mode; the historical proof retains its isolated test lifetimes. Header objects contain sensitive Set-Cookie transport metadata and must never be logged or serialized as application JSON. Current local HTTP wiring forwards each cookie separately, enforces socket/Origin/CSRF and account/IP limits, and never returns raw library response bodies. Authentication still grants no business membership.

## Transaction boundary

The digest adapter's transaction(callback) only calls callback with the same wrapped adapter. It does **not** start BEGIN, COMMIT, rollback, or provide isolation; this preserves the underlying Prisma adapter's transaction:false configuration. If the supplied client is already an interactive Prisma transaction, operations inherit that real outer transaction. The harness uses a real writer.$transaction for fixture creation, then intentionally autocommits the session writes to prove cross-connection persistence.

Current Login reads credentials and inserts one Session row; it does not mutate User/Account/Terms state. Lookup reads live state and may delete an expired session. Individual logout deletes one token-selected session and verifies refusal afterwards. User-wide logout issues a userId-scoped DELETE and checks the result, but it is not an atomic barrier against a concurrent new login. None relies on the adapter callback for rollback. Cookie creation/clearing cannot be atomic with PostgreSQL: committed session changes may survive a later cookie/response failure. Preserve failure output rather than assuming rollback or retrying. Password reset remains unimplemented. Account locking subsequently gained a real transaction/User-lock protocol and passed its separate [PostgreSQL proof](account-access-postgres-verification.md); the historical session harness itself does not establish those later results.

## Digest boundary and version-specific limits

[session-adapter.server.ts](../../lib/product-auth/session-adapter.server.ts) composes Better Auth 1.7.7's public DBAdapter around the installed Prisma adapter. It is not a native hashed-session option and does not change the library's random-token generation, password checks or signed-cookie format. Creation stores `hmac-sha256:v1:` plus HMAC-SHA-256 over the domain `stitchtrack/session-token/v1` followed by a NUL and the original 32-character bearer. Equality/in predicates are transformed exactly once. Create/token-directed read results restore the raw token from that call's inputs so expiry deletion and cookie behavior stay correct. There is no process-wide raw-token cache or reverse lookup.

User/id-based enumeration removes token fields rather than exposing digests as credentials; this suffices for the installed no-hook bulk-deletion path. Token-bearing listSessions/revokeOtherSessions APIs are **not enabled** and need a separate metadata/session-ID design review. Session updates/renewal, plugins/session hooks, secondary storage, cached-cookie authority, model/field remapping and session joins from other models are rejected or unavailable in this scoped configuration. Do not expose a generic Better Auth handler or reuse an unwrapped adapter for these sessions. Upgrade compatibility must be rechecked against actual library behavior.

Callers must privately provision an independent random 32-byte sessionTokenKey, separate from Better Auth's signing secret, OTP HMAC and outbox encryption keys. No operational key or new environment-file value is supplied by this change. Rotation currently invalidates all prior-key sessions; there is no legacy plaintext fallback or multi-key rotation protocol. Existing raw-token rows, if any, are not converted or modified and cannot authenticate through the new wrapper. The owner must review existing session state before operational adoption.

The browser cookie still carries a replayable random bearer plus HMAC signature; the database now holds only its keyed digest. Signing is integrity protection, digest storage protects token material at rest, and neither prevents replay of a stolen full cookie. The owner has now passed the scoped PostgreSQL lookup/logout proof; the earlier offline tests remain separate evidence. The later owner-run Next.js loopback HTTP registration/SMTP/OTP/login/session journey passed; PostgreSQL limits and lock checks are implemented. Production transport/rate policy, logout browser evidence, two-session comparison and HTTPS browser cookie evidence remain pending. See the [current Task Five record](../../task-05-sessions-compliance-defence/docs/sessions.md).
