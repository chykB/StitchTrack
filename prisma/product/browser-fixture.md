# Owner-only single-origin browser fixture

Status: the original procedure is prepared and offline-tested; the owner reports an existing
fixture for run `cb2f5b71-d19e-4427-b2c9-cf839eeae89c` whose original rate key is lost.
Use the exceptional recovery section below before any fresh setup. This procedure creates one directly verified
synthetic User and Argon2id credential in `stitchtrack_product_test.product`, solely for
browser Login/session/logout through the [Next-only session transport](../../task-05-sessions-compliance-defence/docs/http-session-integration.md#owner-controlled-next-only-browser-prerequisite).
The standard setup/cleanup instructions below apply only to a separately authorized future
new run; they do not authorize reuse of the lost-key run.
It does not test registration, OTP, Terms acceptance or business authorization. It creates
no session, Terms, verification or outbox record. Public authentication stays disabled.

## Before setup

Review [the helper](../../tests/product-auth/browser-fixture.mjs). Pause all other product-test
writers, workers and proofs, close database GUI connections, and keep the gateway stopped.
The expected historical baseline is **ten User records** and three exact completed product
migrations. The helper checks the exact database/role/schema ownership, migration-file and
record checksums, restricted runtime privileges, absent fixture identities and rate keys.
A mismatch stops before fixture creation; do not alter a baseline to make it pass.

Use Node 24 in WSL from `/home/bmalik/stitchtrack`. Supply only the existing product-test
runtime and migrator URLs; no assessment/development target or new grants are needed.
The migrator performs read-only preflight during setup. User and Account creation uses
one real transaction on the existing product-test Prisma runtime client and shared
Argon2id utility. Password characters remain exact; choose at least 12 Unicode code points
under the existing Signup validation rules, and retain the password in your private manager.

Before any fresh setup, retain the exact password and rate key in the owner's secure password/secret manager, outside Git; shell variables are not durable storage.
An already generated, securely retained replacement key may be used for a **new** run only,
never substituted into the old manifest. In a private terminal, disable tracing and silently supply values. Do not use `tee`, terminal
recording, shell literal assignments containing secrets, or screenshots of credentials:

```bash
cd /home/bmalik/stitchtrack
set +x
umask 077
read -r -s -p 'Private product-test runtime URL: ' PRODUCT_TEST_DATABASE_URL
printf '\n'
read -r -s -p 'Private product-test migrator URL: ' PRODUCT_TEST_MIGRATION_DATABASE_URL
printf '\n'
read -r -s -p 'Private synthetic password: ' PRODUCT_BROWSER_FIXTURE_PASSWORD
printf '\n'
read -r -s -p 'Privately retained independent base64 32-byte rate key: ' PRODUCT_LOCAL_RATE_IDENTIFIER_KEY
printf '\n'
env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test \
  PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
  PRODUCT_BROWSER_SETUP_CONFIRMED=true \
  PRODUCT_TEST_DATABASE_URL="$PRODUCT_TEST_DATABASE_URL" \
  PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
  PRODUCT_BROWSER_FIXTURE_PASSWORD="$PRODUCT_BROWSER_FIXTURE_PASSWORD" \
  PRODUCT_LOCAL_RATE_IDENTIFIER_KEY="$PRODUCT_LOCAL_RATE_IDENTIFIER_KEY" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/browser-fixture.mjs --owner-setup
browser_setup_exit=$?
printf 'browser_setup_exit=%s\n' "$browser_setup_exit"
unset PRODUCT_BROWSER_FIXTURE_PASSWORD PRODUCT_TEST_MIGRATION_DATABASE_URL
```

Continue only after exit 0, confirmed setup commit, private setup-completion receipt and connection closure. The helper prints
only a fresh nonsecret UUID and fixed status messages. Set `PRODUCT_SINGLE_ORIGIN_RUN_ID`
to that UUID in the gateway terminal; **do not generate a second UUID**. Reuse the same rate
HMAC key there and for cleanup, stored privately outside Git. Never send migrator credentials
to the gateway or Next. Only the runtime URL is used by the gateway.

The synthetic login email is `ht-proof-<UUID>@example.invalid`; the sole permitted unknown
email probe is `ht-unknown-<UUID>@example.invalid`. These reuse the verified transport-fixture
naming pattern with a newly generated UUID. Enter the email and privately retained password
in the browser without recording them. Only these two emails and direct IPv4 loopback are
in this cleanup scope. Mistyped extra identities can create unplanned rate buckets and will
make cleanup refuse. Keep this first test to at most five outstanding synthetic sessions.

The gateway retains the approved **604,800-second fixed lifetime, no renewal**, and existing
account/IP policies. No historical 600-second integration configuration is copied. Follow
the gateway's certificate/trust and same-origin transport checks before browser login.

## Separate cleanup authorization

Close browser tabs, stop the gateway with Ctrl-C, confirm its listener and database pool
closed, and stop other product-test activity. Review `ss -ltnp '( sport = :3443 )'`: no
listener may remain. This is an owner check, not a check inferred from an enable flag.
The helper independently refuses other database connections. It takes short exclusive
locks on the nine product tables during validation/deletion; run only with the test
system quiescent. No historical rows are deletion targets.

In a fresh private terminal, set the same nonsecret `PRODUCT_SINGLE_ORIGIN_RUN_ID`, then:

```bash
cd /home/bmalik/stitchtrack
set +x
umask 077
read -r -s -p 'Private product-test migrator URL: ' PRODUCT_TEST_MIGRATION_DATABASE_URL
printf '\n'
read -r -s -p 'Same private gateway rate key: ' PRODUCT_LOCAL_RATE_IDENTIFIER_KEY
printf '\n'
env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test \
  PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
  PRODUCT_BROWSER_CLEANUP_CONFIRMED=true PRODUCT_BROWSER_GATEWAY_STOPPED=true \
  PRODUCT_BROWSER_CLIENT_CLOSED=true \
  PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
  PRODUCT_LOCAL_RATE_IDENTIFIER_KEY="$PRODUCT_LOCAL_RATE_IDENTIFIER_KEY" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/browser-fixture.mjs \
  --owner-cleanup "$PRODUCT_SINGLE_ORIGIN_RUN_ID"
browser_cleanup_exit=$?
printf 'browser_cleanup_exit=%s\n' "$browser_cleanup_exit"
unset PRODUCT_TEST_MIGRATION_DATABASE_URL PRODUCT_LOCAL_RATE_IDENTIFIER_KEY
```

Cleanup validates the exact user/name/email/verified/unlocked state, unchanged credential,
provider and relationships, timestamps, digest-only sessions with at most seven-day expiry,
and each planned bucket's capacity/refill. It refuses extra accounts, Terms/issuance links,
unexpected rows or changed historical fingerprints. Parameterized deletes target only that
User, exact credential, that user's sessions and the five exact HMAC-derived bucket keys.
Affected row counts must match the inspected rows. The historical baseline is compared
before and after deletion, then the transaction commits. No broad DELETE, reset or migration
is used. Confirmed-setup cleanup requires a matching private `setup-complete.json` receipt
and exactly one persisted User/Account pair. Normal cleanup removes that pair; session/bucket
counts depend on actual browser activity. Ten historical users must remain unchanged.
A missing pair after recorded successful setup is an inconsistency and stops cleanup.

## Partial runs and private recovery information

Before any possible fixture write, the helper exclusively creates
`~/.stitchtrack-browser-fixtures/<UUID>/manifest.json` (directories 0700, file 0600,
fsynced). **Manifest format 2** versions the fixed identity, rate-key, timestamp and baseline
contract. It contains run/key fingerprints, credential-hash fingerprint, timestamps
and historical row fingerprints/counts. It stores **no password, raw hash, token, HMAC key
or URL**. Cleanup requires this unchanged manifest and the original rate key. It no longer
hashes source files: comments, formatting and compatible code fixes do not invalidate cleanup.
Incompatible contract changes require a reviewed format version; unknown versions are refused.
The earlier unexecuted format 1 is not silently upgraded.

Only after Prisma acknowledges the setup transaction commit does the helper exclusively write
and fsync `setup-complete.json`, bound to the run and manifest digest. A private
`cleanup-complete.json` records committed removal counts **and which setup evidence was used**.
No evidence or archive is generated. Never put these private files in Git or publish them.

Any nonzero/uncertain result means stop and preserve the UUID/manifest. Do not automatically
retry setup, cleanup, amend the baseline or delete private files. A lost commit acknowledgement
can leave the pair committed without a setup receipt. Cleanup then requires the independently
visible, exact persisted User/Account pair plus its manifest/credential/timestamp and baseline
checks. It labels this **recovered persisted setup**, without claiming the original command
acknowledged success. No reseeding occurs.

If no setup receipt, User, Account, Session or planned bucket exists, cleanup performs a
read-only recovery inspection and rolls back: **exit 2**, no deletes, no completion receipt
and no successful-cleanup claim. This establishes only current absence, not whether a prior
setup ever committed. A half-pair, orphaned sessions/buckets, or an absent pair with a setup
receipt is inconsistent and refused. A receipt-write/shutdown failure can occur after a
committed operation; inspect before another command. Retain the manifest until the exact
run's cleanup or recovery state has been separately reviewed.

The nine-table fingerprint baseline remains necessary to detect changes to historical users,
credentials, sessions, rate records and untouched verification/Terms/outbox data. Counts alone
would miss replacements or edits. The private manifest preserves that baseline across crashes.
Two setup connections retain least privilege: the migrator reads ownership/history; the
runtime Prisma transaction creates only the fixture pair. A session advisory lock spans both
setup phases; cleanup takes one transaction advisory lock. The redundant setup transaction
advisory lock was removed. Cleanup table locks keep baseline verification and exact deletion
stable until commit; these are short, owner-only operations on a quiescent test database.

Offline tests use synthetic state and connection doubles/static contracts. They do not prove
these changes against PostgreSQL or establish same-origin browser success. Owner setup
has been reported for the pinned run; no recovery inspection, cleanup or subsequent fresh
setup has been performed by the agent.


## Exceptional lost-rate-key recovery: one run only

Applies only to `cb2f5b71-d19e-4427-b2c9-cf839eeae89c`. The original 32-byte rate key is
lost. A newly generated key is **not** the original; neither recovery mode accepts any
`PRODUCT_LOCAL_RATE_IDENTIFIER_KEY`. Do not edit manifest fingerprints, manufacture a
matching key, bypass normal cleanup or attempt browser login with the obsolete fixture.

A read-only file review confirmed format 2, the exact run, ten baseline users, a setup
receipt bound to the unchanged manifest and no cleanup receipt. The manifest records zero
**pre-setup** rate buckets; this is not a claim about the database now. No database was
inspected. Only nonsecret structure/count summaries were displayed; private files remain
unchanged. The manifest stores a key fingerprint, not a recoverable key.

The exceptional plan derives the original fixed User/Account identity from the UUID alone,
checks name/email, credential fingerprint, timestamps, relationships and bounded digest-only
sessions, and preserves all nine historical table fingerprints. No Terms/issuance links
are permitted. It requires the original successful setup receipt and exact persisted pair;
missing/partial or changed state is refused, not called successful cleanup.

**Rate attribution condition:** the complete current AuthRateBucket snapshot must exactly
match the original pre-setup snapshot, excluding no keys. Added, changed or missing opaque
buckets stop recovery. No timestamp guessing, replacement-key calculation, arbitrary key
list or bulk rate deletion is allowed. Unchanged historical buckets may remain; recovery
writes/deletes zero rate rows. If this condition fails, the original key or separate genuine
attribution evidence is required for another reviewed plan. Do not change the baseline.

### 1. Separately authorize read-only inspection

Owner first closes browser tabs, stops Next/the old gateway and all product-test writers,
workers/proofs/GUI connections, and verifies 3443 has no listener. The helper independently
checks connection quiescence, the exact restricted test migrator, product ownership,
all three migration files/history checksums and the same fixture advisory lock.
It uses REPEATABLE READ / READ ONLY and ends with ROLLBACK. No account or database row is
created, updated or deleted, and no new private manifest/inspection file is written.

In a private WSL terminal, after that authorization:

```bash
cd /home/bmalik/stitchtrack
set +x
umask 077
read -r -s -p 'Private product-test migrator URL: ' PRODUCT_TEST_MIGRATION_DATABASE_URL
printf '\n'
env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test \
  PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
  PRODUCT_BROWSER_GATEWAY_STOPPED=true PRODUCT_BROWSER_CLIENT_CLOSED=true \
  PRODUCT_BROWSER_LOST_KEY_INSPECT_CONFIRMED=true \
  PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/browser-fixture.mjs \
  --owner-lost-key-inspect cb2f5b71-d19e-4427-b2c9-cf839eeae89c
recovery_inspect_exit=$?
printf 'recovery_inspect_exit=%s\n' "$recovery_inspect_exit"
unset PRODUCT_TEST_MIGRATION_DATABASE_URL
```

Review exit 0, confirmed connection closure, one matched User, one Account, actual Session
count, unchanged rate-table baseline, zero targeted rate rows and the nonsecret
`recovery_plan_id`. No secret, private address, token, credential fingerprint or bucket
key is printed. Do not start services or proceed automatically. Failure means stop and
preserve everything; neither the replacement key nor a baseline rewrite is a remedy.

### 2. Separate approval for exact cleanup

Only after reviewing the successful inspection, approve this exact run and plan ID. Apply
repeats all guards under exclusive locks on the nine product tables and refuses if any
inspected row or credential/session state changed. It deletes only the exact User, Account
and attributed Sessions, checks affected counts and the historical baseline again, then
commits. It issues **no AuthRateBucket DELETE**. The existing cleanup-complete.json is
created exclusively only after acknowledged COMMIT; existing receipts are never overwritten.

```bash
cd /home/bmalik/stitchtrack
set +x
umask 077
read -r -s -p 'Private product-test migrator URL: ' PRODUCT_TEST_MIGRATION_DATABASE_URL
printf '\n'
read -r -p 'Reviewed recovery_plan_id: ' PRODUCT_BROWSER_RECOVERY_PLAN
env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test \
  PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
  PRODUCT_BROWSER_GATEWAY_STOPPED=true PRODUCT_BROWSER_CLIENT_CLOSED=true \
  PRODUCT_BROWSER_LOST_KEY_CLEANUP_CONFIRMED=true \
  PRODUCT_BROWSER_RECOVERY_PLAN="$PRODUCT_BROWSER_RECOVERY_PLAN" \
  PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/browser-fixture.mjs \
  --owner-lost-key-cleanup cb2f5b71-d19e-4427-b2c9-cf839eeae89c
recovery_cleanup_exit=$?
printf 'recovery_cleanup_exit=%s\n' "$recovery_cleanup_exit"
unset PRODUCT_TEST_MIGRATION_DATABASE_URL PRODUCT_BROWSER_RECOVERY_PLAN
```

Any failure/uncertain COMMIT or receipt/shutdown failure means stop; never automatically
retry, infer rollback or delete the old private directory. Both inspection and cleanup
remain unexecuted by the agent. Once owner-confirmed cleanup commits and ten historical
users remain unchanged, separately authorize the standard fresh setup above. It generates
a fresh UUID, writes a new manifest and receipt, and uses the securely retained new-run key.
Keep the old manifest and recovery receipt as history; no private-file retirement is
included here. No additional grants, migrations or cleanup framework are introduced.
