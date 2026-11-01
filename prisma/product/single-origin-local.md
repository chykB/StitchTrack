# Local single-origin HTTPS gateway

Status: **historical gateway preparation, superseded for routine local development** on
`feat/auth-session-integration`. This does not replace the completed
[curl companion proof](https-transport-verification.md), repeat PostgreSQL proofs or
establish browser integration. Its original implementation-only/not-run status is
retained; no new gateway execution is claimed. Current local authentication uses normal
Next.js loopback HTTP and the owner completed registration/SMTP/OTP/login/session recognition.
Do not follow the retained certificate/gateway/fixture commands as routine prerequisites.
Production activation and Task Five browser/logout captures remain incomplete. The [PRD](../../docs/PRD.md) and policies are unchanged.

## Decision: authentication at ingress (A)

| Approach | Fit with the current code | Trade-off |
| --- | --- | --- |
| A: handlers at the TLS ingress | Reuses the actual client socket, opaque metadata, existing HTTP/Better Auth services and PostgreSQL limiter in one process. No original-client metadata crosses a hop. Selected for this local slice. | The gateway owns TLS and auth secrets/DB access, plus a narrowly constrained application proxy. It must remain a trusted process. |
| B: separate auth backend | Requires an authenticated private connection, verified peer identity, authenticated original-client metadata and direct-bypass controls. | More keys, configuration and failure modes; not necessary for this topology. Retained only as a possible future deployment choice. |

[The gateway](../../lib/product-auth/single-origin.server.ts) terminates direct browser
TLS and runs authentication **there**, without a network hop to another auth backend. Other supported requests go to an existing **normal Next.js server**.
It neither imports `next()` nor changes Next's application server, middleware or config.
No mTLS or signed client-IP attestation is needed between auth components: there is no
separate auth hop. TLS handshake completion is not client-certificate authorization.

## Explicit configuration; no activation

The existing product-test, local HTTPS, session-secret, independent rate-key and policy
guards all apply. In addition require `PRODUCT_SINGLE_ORIGIN_CONFIRMED=true` and an
explicit `PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN`, such as `http://127.0.0.1:3000` after owner
review. Only literal IPv4 loopback HTTP with an explicit nonprivileged port, no credentials,
path/query/fragment and a port different from the HTTPS origin is accepted. No upstream
fallback, environment-file read, certificate generation or automatic listener exists. The
[owner launcher](../../scripts/local-auth-gateway.mjs) starts it only with the exact
`--owner-start-single-origin` argument and the explicit configuration below.

`createSingleOriginServer` reuses the existing TLS listener lifecycle and only exposes
its fixed `127.0.0.1` bind. Production mode refuses in the gateway process. The frontend default remains disabled;
its separate local opt-in checks the server-side flags/Host and the actual browser origin
`https://127.0.0.1:3443` before every authentication request. Normal Next private auth
routes remain unconfigured. The launcher explicitly selects the previously owner-approved
**test-only** budgets: login account 3/60s, login IP 10/15s, lookup IP 60/1s and logout IP
30/2s (capacity/refill-one interval). Production policies remain unapproved.

The source alone cannot prove the normal Next process binds privately, that a port belongs
to this repository, or that no OS tunnel/forwarder exists. Owner inspection of process,
bind address and networking is mandatory. Never expose or tunnel the local gateway.

## Request and response contract

- Exact auth paths are POST login, GET session and POST logout under
  `/api/internal/tailor-session/`. They call the existing direct HTTPS handler with the
  incoming request's actual socket, preserving Origin, bounded JSON parsing, generic
  errors, shared rate limits, account locks, seven-day expiry and revocation semantics.
- With the separate development signup opt-in below, POST `/api/product-auth/signup`,
  `/api/product-auth/verify-email` and `/api/product-auth/resend-verification` invoke the
  shared registration HTTP boundary in process, using existing socket metadata and shared
  PostgreSQL budgets. They do not forward identity/IP headers to Next. Default is 404.
- Unknown/encoded API variants, trailing-slash variants, wrong methods, ambiguous paths
  and normalized dot-segment paths never fall through to Next. Queries on exact auth
  paths are rejected by the existing HTTP boundary. No generic Better Auth API is exposed.
- Application forwarding permits **GET/HEAD only**. Other API paths, image optimization,
  internal development endpoints and application writes are unsupported. Nonzero request
  bodies, transfer framing on application requests, trailers, Expect and upgrades fail
  closed. The shared listener explicitly rejects CONNECT, upgrades and expectations.
- Raw duplicate request headers and wrong Host are refused. Caller Forwarded, X-Real-IP
  and X-Forwarded-* assertions are rejected everywhere. A request-header allowlist forwards
  navigation/RSC/cache/range hints; internal middleware hints and Authorization are not
  forwarded. No arbitrary target host, DNS destination or request body reaches Next.
- The gateway creates only application URL hints (canonical Host and HTTPS/port) from
  its verified local configuration/TLS. They are **not** authentication inputs or client-IP
  attestation. No original-client IP is sent to Next. Origin is never rewritten into an
  allowed value. The existing `/auth` query bytes and RSC hints are preserved.
- Better Auth cookies are removed from application requests to Next. Its public UI
  rendering does not need them; authenticated client lookup goes straight to the ingress.
  Other app cookies may pass. This is not an implementation of authenticated SSR/business
  routes. Next cannot acquire business authority from an identity hint or a shared origin.
- Auth Set-Cookie headers remain separate through the existing handler. Application
  Set-Cookie entries also stay separate, but Next cannot overwrite Better Auth cookies.
  Duplicate critical response headers are refused; known list-valued preload/cache/Vary
  headers can combine. Hop-by-hop framing is removed and regenerated by Node.
- Relative/same-HTTPS-origin redirects remain; an absolute URL to the fixed Next upstream
  is rewritten to the HTTPS origin. External, protocol-relative, credential-bearing and
  downgrade redirects, Refresh, CORS opt-ins, trailers and upgrades are unsupported and
  return 502. Redirects are not followed by the gateway.
- Application responses stream with backpressure, without decompression or whole-body
  buffering. Client disconnect closes the upstream. Header/body-idle timeouts are bounded;
  upstream failure before headers returns sanitized 502 with stale response headers removed.
  Failure after streaming starts destroys the response; no replacement JSON or success is
  invented. Authentication/storage failures retain their existing fail-closed behavior.

The supported application surface deliberately excludes HMR WebSockets, Server Actions,
other APIs and image optimization. Use normal Next **production-serving mode** for the
first controlled test; development HMR is not claimed to work. Response streaming,
compression, redirects, preload headers and RSC/navigation still require actual Next
verification. The local proxy does not imply production ingress readiness.

## First owner-controlled verification and remaining blockers

The launcher is implemented but **has not been run**. It creates no fixtures or evidence,
reads no environment file and does not start Next. It validates the exact product-test
runtime URL, independent signing/session/rate keys, migration-file checksums, private
certificate/key files (absolute real paths outside Git, owned regular single-link files,
mode 0600), key match, certificate lifetime and IP SAN `127.0.0.1`. No ports are selected
automatically. Occupied 3443 means stop; do not change a trust boundary to get it running.
SIGINT/SIGTERM closes the listener, then disconnects Prisma; failure is sanitized with no
automatic retry. Shutdown may interrupt an in-flight response: logout/commit uncertainty
still requires a fresh authoritative check, not an assumed success.

**Next owner action:** review this configuration, verify ports 3000/3443 and authorize fresh
private certificate/trust setup plus a fresh synthetic account and exact-key cleanup plan.
The earlier proof's fixtures and certificates are retired. Do not use historical accounts.
The [owner-only browser fixture procedure](browser-fixture.md) now prepares a fresh verified
synthetic credential and separately authorized exact cleanup; it has not been executed.
Use its generated UUID as `PRODUCT_SINGLE_ORIGIN_RUN_ID`. Keep that UUID, rate HMAC key and
allowed synthetic identities privately available for exact bucket cleanup before any login
or lookup request; the launcher does not delete persisted sessions/counters on shutdown.

After an existing build and separate owner authorization, use two terminals. Next receives
**no gateway secrets or database URL**. Its normal production-serving mode avoids unsupported
HMR; this does not enable the gateway in production. Next may load its normal environment
files, so the explicit false HTTP flag below must remain set.

```bash
env -i PATH="$PATH" NODE_ENV=production ENABLE_PRODUCT_SESSION_HTTP=false \
  ENABLE_LOCAL_AUTH_FRONTEND=true PRODUCT_SINGLE_ORIGIN_CONFIRMED=true \
  PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
  PRODUCT_SESSION_HTTP_ORIGIN=https://127.0.0.1:3443 \
  ./node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
```

In the separate gateway terminal, privately supply the existing dedicated test runtime URL,
a signing secret (at least 32 characters), distinct canonical base64 32-byte session/rate
keys, fresh UUID and approved certificate/key paths. Never put values in shell history,
argv, Git or Next's environment; use silent `read -r -s` or the owner's private secret
mechanism with tracing disabled. No `.env.local` read is needed by the launcher. The
following command passes those private shell variables through the environment only:

```bash
env -i PATH="$PATH" NODE_ENV=development \
  ENABLE_PRODUCT_SESSION_HTTP=true PRODUCT_SINGLE_ORIGIN_CONFIRMED=true \
  PRODUCT_LOCAL_HTTPS_CONFIRMED=true PRODUCT_LOCAL_RATE_POLICY_CONFIRMED=true \
  PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
  PRODUCT_SESSION_HTTP_ORIGIN=https://127.0.0.1:3443 \
  PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN=http://127.0.0.1:3000 \
  PRODUCT_SINGLE_ORIGIN_RUN_ID="$PRODUCT_SINGLE_ORIGIN_RUN_ID" \
  PRODUCT_TEST_DATABASE_URL="$PRODUCT_TEST_DATABASE_URL" \
  PRODUCT_SESSION_HTTP_AUTH_SECRET="$PRODUCT_SESSION_HTTP_AUTH_SECRET" \
  PRODUCT_SESSION_TOKEN_KEY="$PRODUCT_SESSION_TOKEN_KEY" \
  PRODUCT_LOCAL_RATE_IDENTIFIER_KEY="$PRODUCT_LOCAL_RATE_IDENTIFIER_KEY" \
  PRODUCT_HTTPS_CERT_FILE="$PRODUCT_HTTPS_CERT_FILE" PRODUCT_HTTPS_KEY_FILE="$PRODUCT_HTTPS_KEY_FILE" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/local-auth-gateway.mjs --owner-start-single-origin
```

Missing configuration fails before listening. The launcher uses no migrator credentials,
SMTP or worker. Registration remains off unless separately configured below. In a third terminal, first check transport only:

```bash
ss -ltnp '( sport = :3000 or sport = :3443 )'
curl --noproxy '*' --cacert "$PRODUCT_HTTPS_CERT_FILE" --connect-timeout 5 --max-time 15 \
  -o /dev/null -w 'https_application_status=%{http_code} tls_verify=%{ssl_verify_result}\n' \
  'https://127.0.0.1:3443/auth?login'
curl --noproxy '*' --connect-timeout 5 --max-time 10 \
  -H 'Origin: http://127.0.0.1:3000' -H 'Content-Type: application/json' \
  --data '{}' 'http://127.0.0.1:3000/api/internal/tailor-session/login'
```

Expected outcomes to verify: loopback-only listeners, HTTPS page response with certificate
verification result 0, and direct Next auth returning 404 without session creation. These
commands have not been executed. Do not treat HTML 200 alone as proof that JS/CSS, RSC,
redirects or authentication work. No auth login attempt is authorized before the fresh
synthetic-account/rate-bucket cleanup plan is approved. Do not use historical users.

The frontend opt-in is now implemented but defaults off. Only after single-origin transport
passes should the owner open the opted-in login page in a browser. Browser testing needs authorized certificate trust,
fresh synthetic identities, actual Login/session/logout, Secure cookies, account isolation,
expiry/locking, rate messages and logout network failure. Keep public activation off. Client
state remains presentation-only; each business operation still needs server authorization.

## Offline checks

[Gateway tests](../../tests/product-auth/single-origin.test.mjs) use Node stream/socket/TLS
and upstream request doubles plus real installed Better Auth against a database double.
They check routing, reserved-path bypass refusal, metadata/header/body rules, streaming,
cookies/redirects, backend errors, logout uncertainty, configuration and default-inactive
Next/frontend boundaries. [Launcher tests](../../tests/product-auth/local-gateway.test.mjs)
cover authorization and shutdown using doubles; [frontend tests](../../tests/auth-validation/local-session.test.mjs)
cover explicit opt-in, actual-origin refusal and relative same-origin requests. Existing HTTPS/HTTP and frontend accessibility-markup tests remain
separate. No live network connection, browser, certificate, upstream service or database is exercised.


## Owner-authorized local Signup ? OTP integration

For the current Next-only signup procedure, use the [registration workflow](registration-workflow.md#owner-run-next-only-local-browser-test).
The ingress instructions below remain an optional historical transport path; no new server or public activation is required.
The [registration workflow](registration-workflow.md) documents the development-only consent
exception. No Terms records are inserted, no draft acknowledgement is collected, and
verification never signs the user in. The existing browser-fixture cleanup authorizes only
its exact fixture: **do not use it to delete newly registered accounts**, and do not remove
historical records. A separate exact cleanup review is needed for any new signup test data.

Before restarting the existing processes, privately provide the test runtime URL and existing
independent signing/session/rate/verifier/outbox keys. Keep tracing off; do not put passwords,
keys or URLs in commands/history/Git. Both processes need the following nonsecret UI flags:

```bash
ENABLE_PRODUCT_REGISTRATION_HTTP=true
PRODUCT_DEVELOPMENT_CONSENT_DEFERRED=true
PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED=true
```

Pass these explicitly in the existing `env -i` Next and gateway commands above (ordinary
shell assignments are not exported automatically). Keep Next's `ENABLE_PRODUCT_SESSION_HTTP=false`;
the gateway retains its existing true flag and **NODE_ENV=development**. Next may serve its
normal production build for the UI; actual development registration executes only in the
ingress process. Rebuild outdated frontend assets before restarting Next. No production
Next handler gains authentication access through these UI flags.

Additionally pass into the gateway environment:

```bash
PRODUCT_REGISTRATION_RATE_POLICIES="$PRODUCT_REGISTRATION_RATE_POLICIES" \
PRODUCT_EMAIL_VERIFIER_KEY_ID="$PRODUCT_EMAIL_VERIFIER_KEY_ID" \
PRODUCT_EMAIL_VERIFIER_KEY="$PRODUCT_EMAIL_VERIFIER_KEY" \
PRODUCT_EMAIL_OUTBOX_KEY_ID="$PRODUCT_EMAIL_OUTBOX_KEY_ID" \
PRODUCT_EMAIL_OUTBOX_KEY="$PRODUCT_EMAIL_OUTBOX_KEY"
```

`PRODUCT_REGISTRATION_RATE_POLICIES` is explicit JSON with **exactly** `signup`,
`verify-email`, `resend-verification`. Each value is
`{"version":"local-<distinct-policy-version>","account":{"capacity":<integer>,"refillIntervalMs":<integer>},"ip":{"capacity":<integer>,"refillIntervalMs":<integer>}}`.
The owner must choose/confirm these local budgets; there are no silent numerical defaults
or approved production thresholds. Verifier and outbox keys are canonical base64 32-byte
keys with their IDs, independently managed and distinct from rate/session/signing keys.
Use the same rings in registration and the worker. Never rotate away a key needed by an
unexpired challenge/job. Missing or inconsistent configuration prevents startup.

The owner must separately authorize and run the **existing** email-worker CLI with its normal
private SMTP configuration, `NODE_ENV=development`, the same product-test target/key rings,
`PRODUCT_EMAIL_WORKER_ENABLED=true`, and `PRODUCT_DEVELOPMENT_CONSENT_DEFERRED=true`:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/email-outbox-worker.mjs --owner-run
```

The owner-run CLI polls every two seconds and must be stopped with Ctrl-C; it is not
started by the gateway or frontend. No SMTP action is authorized by loading the frontend.
A queued acknowledgement does not promise delivery. Historical synthetic-Terms fixtures cannot
qualify for deferred dispatch, even with the flag. Resend remains subject to 60-second cooldown,
rate limits and a fresh five-minute/three-attempt challenge.

Open `https://127.0.0.1:3443/auth?signup` only after owner authorization of database writes and
SMTP dispatch. Use an owner-controlled deliverable test email, enter the received code, then
log in separately. Do not log/screenshot codes, passwords, private addresses or keys. A new
end-to-end browser/SMTP test remains unrun. HIBP networking must work; the existing timeout
is ten seconds and failure refuses signup. Previously owner-verified Node IPv4 flags
(`--dns-result-order=ipv4first --no-network-family-autoselection`) may be used explicitly in
the existing gateway Node command where needed; TLS validation is never disabled.
