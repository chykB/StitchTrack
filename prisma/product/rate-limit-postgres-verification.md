# Owner-only AuthRateBucket PostgreSQL verification

The owner completed the isolated product-test proof and exact-key cleanup, as recorded
below. These are owner-reported results, not an agent rerun or independently inspected
database state. Public authentication stays disabled; the later owner-confirmed local
Next.js registration/SMTP/OTP/login/session journey is separate. The commands below are
historical, not instructions to rerun completed deployment/proof/cleanup. Use WSL Node 24, the installed packages and only
`stitchtrack_product_test`; pause other product-test writers. No SMTP, worker, accounts,
Terms fixtures or sessions are created. Development grants are a separate authorization.

## Reviewed files and history

At this original rate-limit checkpoint, the [file manifest](migration-files.ts) pinned
these two directories, each containing only `migration.sql`, plus `.gitkeep` and the
PostgreSQL lock file. The current manifest also includes the later User-lock migration;
all three are owner-applied in product-test. This historical one-then-two-row preflight/grant
sequence will reject the later history. Do not rerun it, weaken guards or modify applied SQL:

| Migration | SHA-256 |
| --- | --- |
| `20261029_product_auth_initial` | `7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff` |
| `20261030_auth_rate_bucket` | `282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c` |

Only exact confirmed product `migrate deploy/status --config prisma/product/prisma.config.ts`
commands are admitted. Reset, push, resolve, dev/diff, alternate config paths, extra files,
modified SQL and symlinks fail closed. Offline validate/generate remain unchanged and
never read a URL. The applied initial SQL is unchanged. Do not directly execute migration SQL.

The [read-only preflight](setup/rate-limit-test-preflight.sql) requires exactly the one
successful initial history row **before** deployment. Prisma itself inserts the current
migration's unfinished tracking row before executing SQL. The new SQL therefore requires
exactly two rows: that exact completed initial row and its own clean in-flight row (zero
steps, no logs, no rollback/finish). No other completed/failed/unfinished/rolled-back record
is accepted. Its own checksum cannot be embedded in its SQL without self-reference; the
file manifest pins it, and Prisma records it. After deployment, preflight requires exactly
the two matching completed rows. History must remain in `product`, with none in `public`.
The reported successful harness and cleanup exercise this test target; no separate
deployment transcript or development-database result is added by this update.

## Owner-executed checkpoint

Run ID: `491953db-dd72-419b-a0ef-103facd8f41d`. Provenance: the owner's report of the
real PostgreSQL harness execution, with **proof_exit=0 and capture_exit=0**. The agent
did not execute the harness, inspect private state or reconstruct terminal output.

| Check | Actual owner-reported result |
| --- | --- |
| Account bucket | 20 concurrent attempts; exactly 3 admitted; database elapsed time **113 ms**. |
| Shared-IP bucket | 20 concurrent attempts; exactly 3 admitted; database elapsed time **71 ms**. |
| Canonical email and policy | Equivalent inputs shared the same unknown-account budget; policy mismatch rejected. |
| Timing | Retry-After and genuine elapsed-time refill passed. |
| PostgreSQL enforcement | Expected errors **42501, 23514, 23502 and 23505** observed for the prepared permission/constraint probes. |
| Store failure | Read-only storage failure denied access by failing closed. |
| Resource cleanup | All database connections and loopback sockets closed. |
| Separate exact-key cleanup | Committed successfully; **removed_rows=10**, **rate_cleanup_exit=0**; cleanup connection closed. |

Ten removed rows are consistent with the bounded 28-key cleanup plan: not every planned
key becomes a committed bucket, and constraint probes roll back. The owner separately
removed `/tmp/stitchtrack-rate-proof.GYu74c`. No retained transcript, screenshot, token or
additional measurement is supplied here; this record preserves the owner's summary.
These results demonstrate the scoped shared-counter behavior, not production load,
public HTTP integration, approved numerical policies or general maintenance scheduling.
No development-database migration or grant application is asserted.

## Preserved owner procedure (completed run; do not repeat)


No block below has been executed by the agent. Never enable shell tracing. Retain each
full stdout/stderr stream and both pipeline exit statuses outside Git; no private manifest
or URL belongs in a capture. A convenient pattern for **each individual command** is:

```bash
set +x
set -o pipefail
umask 077
rate_log=$(mktemp /tmp/stitchtrack-rate-review.XXXXXX)
# Run ONE reviewed command below, replacing this placeholder:
# COMMAND 2>&1 | tee "$rate_log"
# rate_status=("${PIPESTATUS[@]}")
# printf 'command_exit=%s capture_exit=%s\n' "${rate_status[0]}" "${rate_status[1]}" | tee -a "$rate_log"
```

Require both statuses zero and preserve the file on every failure. Do not automate later
stages or retries. Deployment may have committed even if output capture failed. Never
reset, resolve, edit applied SQL/history or rerun to manufacture a successful capture.

1. **First database action: read-only before preflight**, as the test migrator. This
   prompts privately and ignores ambient PostgreSQL connection configuration:

   ```bash
   env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
     /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
     --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
     --set=ON_ERROR_STOP=on --set=phase=before --file=prisma/product/setup/rate-limit-test-preflight.sql
   ```

   Stop for review on any mismatch. Expected: only the reviewed initial migration, owned
   product history, and no rate table. This command changes no database data or schema.
2. **After reviewing that output**, privately supply the existing dedicated migration URL.
   Never echo it, put it in shell history or save credentials in this repository:

   ```bash
   read -rsp 'Private product-test migrator URL: ' PRODUCT_TEST_MIGRATION_DATABASE_URL; printf '\n'
   export PRODUCT_TEST_MIGRATION_DATABASE_URL
   env -i PATH="$PATH" CHECKPOINT_DISABLE=1 NODE_ENV=test PRODUCT_DATABASE_MODE=test \
     PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
     PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
     ./node_modules/.bin/prisma migrate deploy --config prisma/product/prisma.config.ts
   ```

   Capture as above. Require a genuine successful result; stop on failure. Repeat step 1
   with `--set=phase=after`, verify the two checksums/completed rows and product table owner.
3. Review/apply only [test grants](setup/rate-limit-test-permissions.sql), using the same
   clean-environment psql command with its `--file` changed and no `--set=phase` argument.
   Inspect its transaction result. It adds only new-table SELECT/INSERT and four-column
   UPDATE, never runtime DELETE or identity/session/history privileges. Run guarded
   `prisma migrate status --config prisma/product/prisma.config.ts` as test migrator,
   using the same clean environment as deploy (change only `deploy` to `status`).
4. **After migration and grants pass**, privately supply the existing test runtime URL.
   Run the harness once, with only the exact environment below passed through:

   ```bash
   read -rsp 'Private product-test runtime URL: ' PRODUCT_TEST_DATABASE_URL; printf '\n'
   export PRODUCT_TEST_DATABASE_URL
   env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
     PRODUCT_TEST_DATABASE_URL="$PRODUCT_TEST_DATABASE_URL" PRODUCT_RATE_LIMIT_INTEGRATION_CONFIRMED=true \
     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/rate-limit.integration.mjs --owner-integration
   ```

   Use the capture pattern. Record the nonsecret `run_id` and actual exit statuses, not
   tokens, keys, identities or fabricated success text. No sample PASS output is evidence.

## What the prepared harness checks

[Harness](../../tests/product-auth/rate-limit.integration.mjs) imports inertly, requires
exact CLI/confirmation/test targets and rejects production, development, assessment,
workers, HTTP activation, debug/preload variables and PostgreSQL overrides. It pins the
migration files before connecting. Runtime connection targets and five distinct backend
PIDs are checked: four independently constructed Prisma pools (`max:1`) and a probe
connection. A real loopback TCP socket supplies transport metadata; no forwarded headers
or remoteAddress test double participates. All queries run the real existing limiter SQL.
A pass-through validates planned key parameters before forwarding each real INSERT.

It attempts 20 simultaneous calls against a three-token **account** bucket, then a
three-token **shared-IP** bucket, expecting exactly three admissions each. The other
budget is deliberately larger. PostgreSQL clock measurements must show the race finishes
before the 120-second proof-only refill interval; otherwise the proof fails. It checks
actual remaining tokens and conservative IP consumption, canonical email equivalence,
unknown synthetic accounts, policy mismatch refusal, ceiling Retry-After and a real
2.5-second refill. Numbers are isolated proof fixtures, not approved product thresholds.

Runtime operations beyond grants must fail with `42501`; invalid bucket values must fail
with `23514`; missing required data and duplicate keys must return `23502` and `23505`.
Permission/constraint probes always roll back, even on an unexpected success.
A real read-only PostgreSQL transaction forces limiter storage failure and must return
unavailable, never permission to proceed. Digest format is checked without printing rows.
No hashing, authentication, SMTP or external fetch is performed. All constructed clients
and loopback sockets are closed on normal and failure paths; a disconnect failure fails
the run. The owner reports this run passed and closed its resources; broader deployment
and HTTP/browser behavior remain outside its scope.

## Separate exact-key cleanup and interrupted runs

Before connecting, the harness creates `~/.stitchtrack-rate-proofs/<run_id>/manifest.json`
under the OS account home (ignoring caller HOME overrides), with directory mode 0700 and file mode 0600, fsynced, refusing overwrite. It contains only
format/run ID, the **synthetic private test HMAC key** and harness checksum. Do not print,
copy into evidence or commit it. Preserve it and this exact harness version until cleanup.
No production authentication keys are read. Cleanup recomputes the fixed 28-key superset
from this manifest; it accepts no arbitrary key list, SQL, identity or wildcard.

After reviewing results, close all proof processes/connections before separately running:

```bash
read -rp 'Reviewed synthetic run UUID: ' PRODUCT_RATE_PROOF_RUN
export PRODUCT_MIGRATION_CONFIRMED=true
# PRODUCT_TEST_MIGRATION_DATABASE_URL is still supplied privately, never printed.
env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
  PRODUCT_MIGRATION_CONFIRMED=true PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
  PRODUCT_RATE_LIMIT_CLEANUP_CONFIRMED=true \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/rate-limit.integration.mjs --owner-cleanup "$PRODUCT_RATE_PROOF_RUN"
```

Cleanup requires the exact test migrator, owned product objects and two reviewed successful
history records. It rejects symlinks, wrong file ownership/modes, changed harness bytes,
invalid UUIDs/manifests and previously recorded cleanup. A matching advisory lock plus
`pg_stat_activity` checks reject a live proof; clients carry the exact run application name.
It deletes only the recomputed exact keys, in one transaction, checks zero matches remain,
and reports only removed-row count. It never touches User, Account, Session or historical
fixtures. Committed proof rows are not automatically deleted on proof success or failure.

For interruption, retain the manifest and partial capture, independently confirm all
run connections have closed, then review the same cleanup command. Partial runs may have
any subset of the 28 keys, including zero. Missing/corrupt manifests, live sessions or
changed source require investigation, not broad deletion or a new key. If cleanup/capture
fails after COMMIT, removal may already have occurred; preserve output/receipt and inspect
before any next action. The private cleanup receipt is never evidence of the proof itself.

## Private manifest retirement for the completed run

The [cleanup implementation](../../tests/product-auth/rate-limit.integration.mjs) checks
zero matching keys remain before COMMIT, writes a separate cleanup receipt and closes its
connection. Based on the owner's successful cleanup and closure report, the owner may
now retire only `~/.stitchtrack-rate-proofs/491953db-dd72-419b-a0ef-103facd8f41d/`,
including its synthetic-key `manifest.json` and `cleanup-complete.json`. Check the exact
resolved path belongs to this run and contains no unrelated files; do not remove the
parent directory or other runs. Do not print, archive as evidence or commit the key.
The agent has not opened the private directory, read its secret contents or deleted it.
No rerun or new database cleanup is needed to retire these local files. The completed
owner result above remains the checkpoint after private working material is removed.
