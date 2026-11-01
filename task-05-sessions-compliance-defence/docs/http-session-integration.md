# Guarded local HTTP session boundary

## Current local Next.js integration; public authentication inactive

Tailor sessions use the owner-approved **604,800-second absolute lifetime**, no renewal,
separate inactivity timeout or remember-me choice. The existing 600-second PostgreSQL
proof configuration is unchanged. The [PRD](../../docs/PRD.md) remains read-only.

The [HTTP boundary](../../lib/product-auth/session-http.server.ts) reuses the existing
Better Auth 1.7.7 [session service](../../lib/product-auth/session.server.ts), Argon2id
and digest-only adapter. The three session routes below are distinct from the specialized
local Signup/OTP handlers; no generic Better Auth handler or operational reset endpoint
is exposed. Existing frontend forms use the real local services. The assessment-only
`/api/auth/login` preview remains separate and unchanged.

The owner completed registration -> SMTP email delivery -> OTP verification -> login ->
authenticated session recognition on normal Next.js loopback HTTP against
`stitchtrack_product_test`. This is an owner-reported browser milestone, not public launch
approval or completion of the remaining Task Five browser captures.

| Private route | Handler behavior; owner curl checkpoint below |
| --- | --- |
| POST `/api/internal/tailor-session/login` | JSON Email/Password; shared validation, canonical email and exact passwords; IP/account budgets before credential verification; safe user JSON and signed cookies, or generic 401 for unknown/wrong/unverified/locked credentials. |
| GET `/api/internal/tailor-session/session` | Fresh database-backed expiry, revocation, verification and lock checks; safe identity/expiry or 401. No business permission is inferred. |
| POST `/api/internal/tailor-session/logout` | JSON `{}` and current session; revoke only that session, then clear cookies. No success if revocation cannot be confirmed. |

**Next.js Node API routes are now mounted** at the same three URLs, with
`bodyParser:false`. They replace only the superseded App Router wrappers. The existing
shared [Node adapter](../../lib/product-auth/registration-next.server.ts) validates the
actual socket, loopback peer/interface/port and raw wire headers, then invokes the same
service/limiter composition used by the historical HTTPS proof. The explicit development
HTTP path does not require TLS; a configured HTTPS origin still requires a completed
handshake. Neither production nor an unapproved public/LAN origin can use the exception. It never
trusts Next's modified headers or caller forwarding metadata. No new server or gateway
is required. Default-off/production returns 404; bad configuration/storage fails closed.
The earlier disabled-login 404 remains a valid historical result, not the current
opted-in route's only possible response. The current owner-run Next/browser journey is established in the scope stated above.

## Trusted transport boundary

`sessionConnectionFromSocket` accepts an actual Node Socket and reuses the shared
limiter's socket-derived IP normalization. It produces a frozen, opaque value checked
by identity at runtime; caller-shaped objects and copies are rejected. TLS sockets must
provide protocol and peer-Finished metadata. A protocol getter alone does not establish
that a handshake completed. Plain HTTP metadata cannot satisfy an HTTPS origin.

Only a reviewed **direct** server adapter may bind this value to the same incoming
request's actual socket. App Router Request objects do not expose trustworthy remote-peer/TLS information.
The supported Node API request retains the original socket and rawHeaders; the shared
adapter uses those instead. Duplicate wire headers and forwarding assertions are refused,
while Next-internal header additions are never treated as network identity.
X-Forwarded-For, X-Real-IP, Forwarded and forwarded-protocol headers never establish
identity or TLS state. Missing metadata fails closed; no shared constant substitutes
for an unknown client. Socket/TLS doubles in offline tests prove contracts, not ingress.

Reverse-proxy trust has **no implementation or enable flag** and remains disabled.
A loopback proxy's socket is the proxy, not its clients. Do not use this direct adapter
behind a proxy or tunnel. A future proxy design needs an explicitly approved trust boundary,
restricted peer identities, ingress header stripping/overwriting and spoofing tests;
no provider, trusted address range or header policy is assumed here.

## HTTP, cookies and authorization

- Require nonproduction execution, NODE_ENV=development, ENABLE_PRODUCT_SESSION_HTTP=true,
  PRODUCT_DATABASE_MODE=test and PRODUCT_DATABASE_CONFIRMED=true. Exact product-test URL,
  database/role/host/schema guards remain; no assessment or development fallback.
- Require exact loopback PRODUCT_SESSION_HTTP_ORIGIN, PRODUCT_SESSION_HTTP_AUTH_SECRET
  (at least 32 characters), a separate canonical-base64 32-byte PRODUCT_SESSION_TOKEN_KEY
  and the private PRODUCT_TEST_DATABASE_URL. No secret file is read or logged here.
- Match URL/Host/origin/path and real loopback metadata, with completed TLS for HTTPS. Mutations require exact Origin,
  compatible Fetch Metadata and application/json. Query parameters, unexpected fields,
  unsupported methods and cross-origin requests are rejected. No CORS opt-in exists;
  SameSite alone is not CSRF protection. Parsing retains the existing 16-KiB transport bound.
- Better Auth signs the random bearer cookie; PostgreSQL stores only its dedicated HMAC
  digest. Cookies remain HttpOnly, host-only, Path=/ and SameSite=Lax, with seven-day Max-Age
  and no renewal. HTTPS uses Secure; plain loopback HTTP does not prove Secure-cookie
  browser behavior. Multiple Set-Cookie entries remain separate, never application JSON.
- Both IP and canonical-account decisions must permit login before expensive verification.
  Unknown accounts use the same path. Denials return 429/Retry-After; storage errors or
  malformed decisions return 503 without authenticating. Already-consumed budgets are not
  refunded. The injected `storage: "shared"` label alone is not evidence of shared storage.
- Login cookies leave the service only after a successful transaction. Failed or uncertain
  commit yields 503 without cookies. Logout verifies revocation after Better Auth's sign-out;
  a lost delete acknowledgement can be resolved by a successful confirming read. If that
  read is unavailable, return 503 without claiming logout success or clearing the cookie.
  Revocation may nevertheless have committed; the browser must not invent success.
- `requireBusinessSession` obtains identity from authoritative lookup, then requires the
  server-owned business authorization callback: 401 for no session, 403 for denied access.
  This is not a dashboard or business-action transaction wrapper. Strict protected writes
  must coordinate with the User-lock protocol; see [account lifecycle](account-lifecycle.md).

## Verified foundation and remaining activation dependencies

The owner completed PostgreSQL [session persistence/revocation](sessions.md),
[shared limiter concurrency](../../prisma/product/rate-limit-postgres-verification.md)
and [account locking](../../prisma/product/account-access-postgres-verification.md),
including separate cleanup. These checkpoints are preserved; do not repeat them.

The historical curl-based HTTPS checkpoint below verified the direct IPv4 companion
with PostgreSQL counters; its original results remain unchanged. Current same-origin
frontend/backend wiring now runs through the normal Next.js Node API routes on explicitly
approved loopback HTTP, and the owner completed the real browser journey above.

Remaining work includes genuine two-session comparison, logout browser/network-failure
captures, same-browser user switching and HTTPS browser cookie evidence. The original
Prisma snapshot failed; the subsequent read-only PostgreSQL diagnostic confirmed one
session record, one distinct digest and valid digest format. See the
[session checkpoint](sessions.md#latest-owner-run-browser-and-read-only-diagnostic-checkpoint).
Neither that single-session result nor curl/offline tests establish these remaining captures.
No fresh certificate, separate gateway or synthetic fixture is required for routine local
HTTP testing. A browser Secure-cookie capture needs a separately approved HTTPS environment.

Public authentication remains disabled. Public onboarding/legal approval, business-scoped
permissions, reset/deletion endpoints and operational administration remain separate work.
No production policy or legal acceptance is approved by this local boundary.

## Offline verification scope

[HTTP tests](../../tests/product-auth/session-http.test.mjs) exercise actual installed
Better Auth/Argon2id against a database double, injected limit decisions and socket/TLS
doubles without connections. They cover guards, forged metadata, Origin/CSRF, validation,
canonicalization, exact passwords, generic credential/lock refusal, cookie attributes,
expiry/revocation, fresh lock checks, session identity, business denial and uncertain
login/logout errors. They do not rerun PostgreSQL proofs, establish equal response timings,
prove shared-store wiring or create HTTPS/browser evidence. The separate owner curl result
below establishes historical transport wiring in its stated scope. The later owner-run
browser milestone remains distinct; production activation is not authorized.


## Historical direct-loopback HTTPS companion (owner-tested and shut down)

[session-https.server.ts](../../lib/product-auth/session-https.server.ts) provides an
API-only companion listener factory. It directly invokes the existing HTTP boundary;
it is not a reverse proxy, a custom Next.js server or another authentication mechanism.
At the companion stage, no Next start command, route, form or configuration was changed. The
standard Next Request has no socket, so attaching caller-shaped metadata to it is not a
safe simpler option. A small companion avoids Next lifecycle/build changes. Its trade-off
is a separate local origin: the frontend was not wired to it and cross-origin fetch
was deliberately unsupported. It is no longer the active local browser transport;
the current same-origin Next.js implementation is described above and below.

The server factory opens no listener on import or construction. Only its explicit
`listen()` method can bind, with host hardcoded to **127.0.0.1** and a required caller
port (1024-65535). No server handle accepting a different bind host is exposed. Each
request also checks the actual local address/port and canonical IPv4 loopback peer,
uses the incoming request's own socket and binds opaque metadata to that exact Web Request.
It rejects forwarding headers rather than interpreting them. Absent/incomplete TLS,
wrong interface, wrong Host/Origin/path and fabricated metadata cannot authenticate.

TLS protocol plus peer-Finished state establishes a completed encrypted connection,
**not TLS client-certificate authorization**. The listener does not request client
certificates. Browser trust in the server certificate must be configured and tested by
the owner; the adapter does not disable certificate validation in a client. Certificates
and private keys must be supplied privately in memory by a reviewed bootstrap; the
module reads no credential/certificate file, generates nothing and logs no secrets.
HTTP headers/body/idle timeouts and the existing bounded parser remain in force.

Both the existing HTTP guards and two additional explicit confirmations are required:
`PRODUCT_LOCAL_HTTPS_CONFIRMED=true` and `PRODUCT_LOCAL_RATE_POLICY_CONFIRMED=true`.
The origin must be exactly `https://127.0.0.1:<chosen-port>`, with the restricted product-test
configuration. Caller-supplied policies require `local-` versions and a separate 32-byte
rate-limit HMAC key, checked against reuse of the session key. No numerical defaults or environment example enables the adapter. The explicit owner-only
transport runner below is separate from the normal Next process.

### Selected policies used in the isolated curl test

| Operation / identifier | Capacity | One-token refill | Status |
| --- | --- | --- | --- |
| Login canonical account | 3 | 60 seconds | Historical companion closed; also selected for local Next session testing. |
| Login IP | 10 | 15 seconds | Historical companion closed; also selected for local Next session testing. |
| Lookup IP | 60 | 1 second | Historical companion closed; also selected for local Next session testing. |
| Logout IP | 30 | 2 seconds | Historical companion closed; also selected for local Next session testing. |

The login proposal permits a three-attempt account burst followed by one attempt per
minute, with an independent ten-attempt IP burst followed by four per minute. It is
suitable for deliberately observing exhaustion/refill in a small controlled test,
not a production recommendation. Successful logins consume attempts too. All localhost
browser accounts usually share the IP budget; polling and incorrect input can exhaust it.
Separate lookup/logout buckets prevent login exhaustion alone from blocking logout,
although either operation's own exhausted budget still returns 429. The owner selected lookup 60/1 second and logout 30/2 seconds for that isolated
test; the current local session policy retains these values. The existing bridge doubles retain their separate synthetic numbers. Production
policies remain unapproved.

The shared limiter now exposes split IP/account consumption using its existing atomic
parameterized SQL, database clock and digest-only identifiers. Its original combined
operation is preserved. A login cannot proceed unless both split decisions permit it;
IP spending remains committed if parsing/account checks fail. Database errors fail closed
with 503, not an in-memory fallback. The extra per-stage target checks/round trips remain
bounded and need later measurement; offline doubles do not prove new end-to-end latency.

### Historical post-curl browser preparation (superseded locally)

The completed curl runner supplied the selected port/policies, private bootstrap and
fresh fixture; those are no longer pending for that historical run. Its listener is now
closed and private TLS/recovery files are removed. At that stage browser testing still
needed separate resources and same-origin integration. The later Next.js-only HTTP path
superseded those gateway/certificate prerequisites and has now passed the owner-reported
browser journey. Do not recreate old fixtures or repeat completed proofs as new evidence.

[Adapter tests](../../tests/product-auth/session-https.test.mjs) pass constructed
IncomingMessage/TLS objects through the real bridge, HTTP handler, Better Auth and
limiter code with deterministic database doubles. No sockets are connected/listened,
certificates parsed, SQL executed or real refill waiting performed. They cover disabled
configuration, TLS/peer refusal, forwarded-header rejection, account/IP exhaustion/refill,
storage failure, cookies, fresh lookup, account locking, Origin checks and logout.


## Completed owner curl transport checkpoint

The owner reports run `70bde756-4193-4dba-bc45-cb8ba55e34fd` passed real certificate/IP
verification, generic wrong/unknown credential responses, Secure signed-cookie issuance,
session lookup/logout/revocation, PostgreSQL account/IP 429 responses, forwarding-header
rejection and fail-closed handling of a PostgreSQL write failure. All ten historical
users and historical authentication/rate records remained unchanged. The HTTPS listener
and database connections closed; `https_transport_exit=0`.

Separate cleanup removed one User, one Account, zero remaining Sessions and five rate
buckets, retaining ten original users; `https_cleanup_exit=0`. The owner also removed
the private manifest, receipt, certificate, key and their two temporary directories.
See the [completed transport record and retained procedures](../../prisma/product/https-transport-verification.md).
These are owner-reported curl results, not an agent rerun, screenshot/log artifact or
completed browser/frontend workflow. No certificate, listener or private file was recreated.

The historical companion used a different origin from Next.js. Cookies are not port-scoped;
cross-origin credentials cannot bypass Origin/CSRF or CORS restrictions. The current local
Next.js application now provides one origin without that companion. SameSite and strict
Origin checks remain; reverse-proxy trust and production rate policies remain unapproved.


## Current routine Next.js development

The approved local transport now uses normal Next.js HTTP on **127.0.0.1:3000**.
See the [current executable setup](../../prisma/product/registration-workflow.md#owner-run-next-only-local-browser-test).
`npm run dev` binds only loopback. Existing secrets remain in ignored `.env.local`;
explicit nonsecret development opt-ins and policies use standard ignored
`.env.development.local`. No certificate or separate gateway is required. The original
HTTPS/curl checkpoint above remains historical evidence, not a routine prerequisite.

The same six Node API routes validate actual socket metadata and raw wire headers.
Host/Origin must match the configured HTTP loopback origin; LAN peers, public hosts,
forwarded assertions, duplicate wire headers and ambiguous bodies fail closed. Local
HTTP cookies are HttpOnly/SameSite=Lax/host-only; HTTPS cookies retain Secure. Production
refuses the development exception and still awaits approved HTTPS/proxy deployment.
Shared PostgreSQL limits, seven-day absolute expiry, digest-only storage, account locks,
no verification session and honest logout-failure handling remain in effect.

The old lost-key synthetic fixture remains a separate recovery obligation; no new
fixture is required for ordinary product signup. Do not substitute keys or use its
exact-key cleanup for browser-created accounts. New registrations/rate writes can make
a frozen historical recovery baseline fail; resolve any pending recovery before writes
if that baseline-dependent procedure is still needed. No recovery was executed here.

The owner has now completed the real registration, SMTP email delivery, OTP verification,
login and session-recognition browser journey against product-test. This does not complete
logout/network-failure evidence, two-session comparisons, password reset or HTTPS browser
cookie evidence. Existing PostgreSQL proofs and offline test results remain historical
checkpoints; no database, SMTP, browser or test execution occurred during this update.
