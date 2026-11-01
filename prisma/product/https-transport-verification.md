# First controlled HTTPS transport proof

Status: **owner-executed curl HTTPS proof and separate cleanup completed** on
`feat/auth-session-integration`, run `70bde756-4193-4dba-bc45-cb8ba55e34fd`.
The results are owner-reported, not an agent rerun or a newly supplied log/screenshot.
This is a historical companion/curl proof, not the active local transport. The owner later
completed registration/SMTP/OTP/login/session recognition through normal Next.js loopback
HTTP. Logout/network-failure, two-session comparison and HTTPS browser cookie captures
remain incomplete. Public authentication remains disabled;
the [PRD](../../docs/PRD.md) and legal-policy candidates remain unchanged.

## Completed owner checkpoint

| Check | Owner-reported result |
| --- | --- |
| HTTPS transport | Real connection with certificate/IP verification passed. |
| Credential errors | Wrong and unknown credentials returned the same generic response. |
| Session lifecycle | Secure signed-cookie issuance, authenticated lookup, logout and revocation passed. |
| Shared rate limiting | PostgreSQL account/IP limits returned 429 as expected. |
| Forwarding metadata | Spoofed forwarding headers rejected. |
| Storage failure | PostgreSQL write failure caused authentication to fail closed. |
| Isolation and shutdown | All ten historical users and historical authentication/rate records unchanged; listener and database connections closed. |
| Proof status | `https_transport_exit=0`. |
| Separate database cleanup | One User, one Account, zero remaining Sessions and five rate buckets removed; ten original users retained; `https_cleanup_exit=0`. |
| Separate private-file cleanup | Manifest, receipt, certificate, key and their two temporary directories removed successfully. |

No screenshots, retained terminal transcripts, certificate fingerprints or additional
measurements are invented. The procedures below are retained as the reviewed preparation;
**do not rerun the completed proof, database cleanup or private-file cleanup**. Removed
recovery files were not inspected or recreated by the agent.

## Selected isolated configuration

| Setting | Test value |
| --- | --- |
| Direct API origin / bind | `https://127.0.0.1:3443` / `127.0.0.1` only |
| Login account | Capacity 3; one token every 60 seconds |
| Login IP | Capacity 10; one token every 15 seconds |
| Lookup IP | Capacity 60; one token every second |
| Logout IP | Capacity 30; one token every two seconds |
| Session lifetime | Fixed seven days; no renewal |
| Proxy trust / production | Unsupported / disabled |

The [runner](../../tests/product-auth/https-transport.integration.mjs) supplies these
values explicitly with fresh `local-<run>-<operation>` policy versions and a dedicated
random HMAC key. Account/IP operations use the existing PostgreSQL upsert and database
clock; there is no memory-counter fallback. These are selected test values, not production
approval. Lookup/logout budgets are separate from login so exhausting login does not
itself prevent logout.

The [companion](../../lib/product-auth/session-https.server.ts) receives each Node
IncomingMessage's own socket, requires a completed TLS connection, and passes its opaque
metadata only to that same converted Request. Forwarding headers are rejected. Completed
TLS does **not** authorize a client certificate; mutual TLS is not configured. The factory
can only listen on IPv4 loopback. The runner neither imports a Next route nor modifies a
Next process: activation flags and ephemeral signing/session keys exist only in its child
process. The normal Next handlers still lack runtime dependencies and cannot be enabled
by the test. No generic Better Auth endpoint, registration or SMTP is exposed.

## Retained certificate preparation (completed run; do not regenerate)

Use a certificate with the exact **IP SAN `IP:127.0.0.1`**, serverAuth usage, a current
validity period and its matching private key. A CN or DNS SAN alone is insufficient.
For this first curl check, use `--cacert` scoped to this certificate; do not use `-k`,
change a system/browser trust store or install a production CA. The runner invokes
`/usr/bin/curl` with explicit certificate verification, HTTPS-only protocol and no proxy.
Curl's normal certificate/IP checks must succeed or the run stops.

The following is the retained preparation recipe, not a claim about the exact command
the owner used. The owner confirmed successful certificate/IP verification and later
certificate/key removal; the agent did not generate or inspect them. A future certificate
requires separate approval. `mkdir` refuses an existing folder; never overwrite certificates. Keep both files outside the repository,
owned by the current WSL user, mode 600, with canonical absolute paths and no symlinks.
The key is unencrypted solely for this short local test and protected by directory/file
permissions; it is not a production key-management recommendation.

```bash
set +x
umask 077
https_tls_dir="$HOME/.stitchtrack-local-https"
if mkdir -m 700 -- "$https_tls_dir"; then
  openssl req -x509 -newkey rsa:3072 -noenc -sha256 -days 2 \
    -subj '/CN=StitchTrack local transport test' \
    -addext 'subjectAltName=IP:127.0.0.1' \
    -addext 'extendedKeyUsage=serverAuth' \
    -addext 'keyUsage=digitalSignature,keyEncipherment' \
    -addext 'basicConstraints=critical,CA:FALSE' \
    -keyout "$https_tls_dir/key.pem" -out "$https_tls_dir/cert.pem"
  https_certificate_exit=$?
  printf 'https_certificate_exit=%s\n' "$https_certificate_exit"
else
  printf 'STOP: certificate directory already exists or could not be created.\n'
fi
unset https_tls_dir
```

If generation fails, stop and inspect the private directory; do not rerun/overwrite it.
Before proceeding, the owner may inspect the public certificate with
`openssl x509 -in <absolute-cert-path> -noout -dates -ext subjectAltName -fingerprint -sha256`.
The runner also checks the IP SAN, validity, file permissions and key/certificate match.
No certificate or trust-store change was made by the agent.

## Retained owner execution procedure (completed)

Prerequisites: WSL Node 24, `/usr/bin/curl`, the existing ignored generated product client,
the selected port free, certificate approval/preparation complete, and explicit owner
permission for one synthetic identity, its sessions and at most five rate buckets in
**stitchtrack_product_test only**. Pause all other product-test writers through cleanup.
Do not rerun provisioning, migrations, grants or completed proof harnesses.

The runner uses a separate migrator connection only for a read-only preflight. It checks
exact identities, product ownership/history, all three applied checksums and required
runtime grants, then closes that connection before fixture writes. Runtime checks require
ten existing User rows. Missing/wider-than-reviewed privileges stop the proof, rather
than broadening them. Certificate and URL values remain private; no dotenv file is loaded.

```bash
cd /home/bmalik/stitchtrack
set +x
set +e
read -r -s -p 'Private product-test runtime URL: ' PRODUCT_TEST_DATABASE_URL </dev/tty
printf '\n'
read -r -s -p 'Private product-test migrator URL (read-only preflight): ' PRODUCT_TEST_MIGRATION_DATABASE_URL </dev/tty
printf '\n'
read -r -p 'Canonical absolute certificate path: ' PRODUCT_HTTPS_CERT_FILE </dev/tty
read -r -p 'Canonical absolute private-key path: ' PRODUCT_HTTPS_KEY_FILE </dev/tty
env -i PATH="$PATH" NODE_ENV=development PRODUCT_DATABASE_MODE=test \
  PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
  PRODUCT_HTTPS_TRANSPORT_CONFIRMED=true \
  PRODUCT_TEST_DATABASE_URL="$PRODUCT_TEST_DATABASE_URL" \
  PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
  PRODUCT_HTTPS_CERT_FILE="$PRODUCT_HTTPS_CERT_FILE" PRODUCT_HTTPS_KEY_FILE="$PRODUCT_HTTPS_KEY_FILE" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  tests/product-auth/https-transport.integration.mjs --owner-transport
https_transport_exit=$?
printf 'https_transport_exit=%s\n' "$https_transport_exit"
unset PRODUCT_TEST_DATABASE_URL PRODUCT_TEST_MIGRATION_DATABASE_URL PRODUCT_HTTPS_CERT_FILE PRODUCT_HTTPS_KEY_FILE
```

The command starts and closes the test listener only during an authorized run. No manual
curl command containing passwords/cookies is needed: the runner passes its curl request
configuration through stdin and consumes raw responses in memory. Nothing uses verbose
curl output, cookie jars, tee, archives or temporary logs. Only fixed PASS/STOP labels,
the nonsecret run UUID and exit status may be shared. No credentials, tokens, hashes,
private addresses or payloads are printed.

Checks exercised by the reviewed runner; confirmed outcomes are summarized above.
The descriptions below explain mechanisms, not additional measurements or browser evidence:

1. Curl validates the certificate/IP and receives an unauthenticated HTTPS response.
2. Wrong and unknown credentials return the same generic 401. A correct exact password
   authenticates the single fixture and yields an HttpOnly/Secure/SameSite=Lax cookie
   with Max-Age=604800; JSON contains only safe fixture identity.
3. The same cookie resolves through authoritative lookup. Logout revokes its database
   session and clears cookies; replay fails. A second login/logout exercises a fresh session.
4. Account and IP exhaustion return actual 429 responses with Retry-After. Forwarding-header
   spoofing returns 403. This checks HTTP wiring, not another concurrency/refill proof.
5. A proof-only, server-side toggle forwards the unchanged limiter upsert to a real
   read-only PostgreSQL transaction. Its failed write yields HTTP 503 with no fallback;
   it is not an HTTP-accessible toggle, simulated database result or outage of other clients.
6. Ten historical User records and all historical authentication/rate rows match in-memory
   SQL row fingerprints. The listener and every constructed database connection close.

The runner's scoped Prisma facade forwards real transaction/query results but refuses
historical User lock targets, Session mutations outside this run and unplanned bucket
keys. It does not replace the real socket, TLS handshake, curl, hashing, limiter, Better
Auth or PostgreSQL behavior. One verified fixture pair is inserted atomically as explicit
session-test setup, **not proof of registration/OTP or approved Terms acceptance**. No
Terms, Verification, outbox or worker fixture is created.

Require all checks, confirmed shutdown and `https_transport_exit=0`. A terminal banner
alone is insufficient. On failure/interruption, preserve the run UUID, observed stage and
private manifest, stop, and review exact cleanup. Do not retry, reset, alter history or
run automatic cleanup. Fixture setup is atomic: zero or one pair may remain; some buckets
may exist. Do not change thresholds to manufacture a pass.

## Retained separately authorized cleanup procedure (completed)

Before any database work, the runner writes necessary recovery material outside Git at
`~/.stitchtrack-https-proofs/<run>/manifest.json` (directories 700, file 600, owned, no
symlinks). It contains run UUID, the rate-key and source checksum, **not passwords, cookies,
session-signing keys, URLs or TLS private keys**. Do not print/stage it. This is required
cleanup recovery data, not a test transcript/archive. Retain it through failures; do not
inspect another proof's private state.

The separately authorized cleanup loads only that exact manifest and derives the single
User/Account IDs and five bucket digests. It verifies the same restricted test migrator,
three successful migration checksums, schema ownership, exact fixture markers/relationships,
no Terms/issuance links and digest-only sessions. A shared advisory lock plus connection
checks prevent cleanup during a live run. It deletes only those rows in one transaction,
retains ten baseline users and writes a private completion receipt after COMMIT.
No wildcards, arbitrary SQL/key lists, broad purge, grants or automatic retry are accepted.

After reviewing shutdown and proof output, separately authorize:

```bash
cd /home/bmalik/stitchtrack
set +x
set +e
read -r -p 'Reviewed HTTPS proof run UUID: ' HTTPS_PROOF_RUN </dev/tty
read -r -s -p 'Private product-test migrator URL: ' PRODUCT_TEST_MIGRATION_DATABASE_URL </dev/tty
printf '\n'
env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test \
  PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
  PRODUCT_HTTPS_CLEANUP_CONFIRMED=true \
  PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  tests/product-auth/https-transport.integration.mjs --owner-cleanup "$HTTPS_PROOF_RUN"
https_cleanup_exit=$?
printf 'https_cleanup_exit=%s\n' "$https_cleanup_exit"
unset PRODUCT_TEST_MIGRATION_DATABASE_URL HTTPS_PROOF_RUN
```

Review actual numeric removal counts, COMMIT confirmation and exit 0; do not invent expected
Session/bucket counts after a partial run. A fully completed proof should remove one User
and one Account; zero after claimed success is a discrepancy. A receipt-write failure may
follow a committed cleanup, so stop rather than repeat. No private manifest/certificate is
automatically deleted. For this run, the owner separately confirmed removal of the manifest,
receipt, certificate, key and their two temporary directories. Do not repeat cleanup or
recreate those private files. Future retirement requires separate review/authorization.

## Historical browser-origin limitation and later integration

`https://127.0.0.1:3443` and the Next frontend origin differ by scheme and/or port. Browser
fetch defaults to same-origin credentials, and different ports are different origins.
Cookies are **not port-scoped**: a host cookie may reach another HTTPS service on the same
host; Secure prevents ordinary HTTP transmission. HttpOnly prevents JavaScript reads,
not server receipt. Use only isolated test identities; do not run untrusted local services.
SameSite concerns sites (including scheme), not a CORS authorization policy.

Adding `credentials: include` does not solve this boundary: mutations from the Next origin
fail strict Origin validation, and cross-origin JavaScript responses lack CORS permission.
Do not add permissive CORS, weaken SameSite or accept another Origin to make the test work.
Curl supplies an Origin deliberately; it does not demonstrate browser CSRF, cookie storage,
Secure behavior, frontend UX or logout network-failure handling.

The smallest later production-compatible direction is **one canonical HTTPS origin** for
the frontend and authentication paths. Prefer deployment routing at a reviewed ingress
while preserving Next's normal server, but first approve how its peer/client/TLS metadata
is authenticated, how forwarding headers are stripped/replaced and how direct bypass is
prevented. Current direct-only proxy trust cannot simply be enabled. A same-process direct
Next server is an alternative with deployment/lifecycle costs requiring separate approval.
No hosting provider, proxy CIDR or certificate authority is assumed or implemented here.
The later local solution uses one normal Next.js loopback HTTP origin with socket-aware
Node API routes; it needs no companion/gateway or certificate. That development exception
does not approve production proxy trust or prove HTTPS browser cookie behavior.
