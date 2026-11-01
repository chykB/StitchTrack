# Frontend authentication integration

Status: **owner-run local browser milestone completed** on `feat/auth-session-integration`:
registration -> SMTP email delivery -> OTP verification -> login -> authenticated session
recognition against `stitchtrack_product_test`. This uses the normal Next.js loopback HTTP
application. Public/production authentication remains disabled. The earlier PostgreSQL/curl
checkpoints remain in the [HTTP record](http-session-integration.md); those historical tests
are separate from this later owner-reported browser journey. The [PRD](../../docs/PRD.md) is unchanged.

## Reused UI and explicit local composition

The existing [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) remains the Login,
Signup and Reset form, with the same fields, validation/focus behavior, Show/Hide control
and one polite atomic status region. The existing Signup and OTP UI now use the real
registration/verification services under explicit development opt-in; verification creates
no session. The `/auth` query-state contract is preserved. Reset remains unavailable.
Local consent deferral records no fictitious Terms acceptance; legal candidates remain
unapproved and unpublished. Historical draft-preview behavior is not approved acceptance.

[session-client.ts](../../lib/auth/session-client.ts) supplies a same-origin client for
only the three existing private paths. The application's `FRONTEND_AUTH_ENABLED=false`
remains the default. A server-side **local-only** opt-in now passes the nonsecret exact
HTTP loopback origin to the existing Login form. It requires the reviewed development
flags and exact Next.js Host; the client independently checks its browser origin before
every request. The separate Signup/OTP composition uses the same origin and existing
services. Production, unapproved origins and absent opt-in remain refused. This presentation
configuration grants no server authority. Reset has no operational client. No gateway or
local certificate is needed; HTTPS still requires Secure cookies.

The [controller](../../lib/auth/session-controller.ts) owns presentation state only:

- Login uses the shared Login schema, canonical email and exact password. It does not
  apply Signup strength rules. Pending operations block duplicates before awaiting fetch.
- A successful login response is followed by authoritative cookie/session lookup before
  the UI claims login. Only safe user metadata and server expiry enter session state;
  no token/digest is accepted from JSON, read from cookies or put in persistent storage.
- Browser fetch uses fixed relative paths, same-origin credentials, no-store and no
  redirects. It does not supply Origin, identity, proxy metadata or Authorization headers.
  Abort after 15 seconds is uncertainty, not proof that a mutation did not commit.
- Generic credential errors ignore backend wording. A 429 uses valid Retry-After seconds
  or HTTP dates, prevents immediate retry and releases backoff at the deadline. Missing
  or malformed headers produce generic wait feedback without an invented duration.
- Initial enabled mount and window focus recheck the session. There is no periodic
  network polling or automatic session renewal. Server expiry clears stale display state;
  fresh 401 lookup handles revocation. Client clocks/state never authorize protected work.
- Logout clears identity only after a validated success response or separately confirmed
  absent session. Network/server failure keeps last-known metadata as **uncertain**, offers
  session-check/logout retry and never announces successful logout. No automatic mutation
  retry occurs. Another tab/account is reflected by fresh authoritative lookup.

The existing fieldset is disabled while loading; rate backoff disables submission. Busy
state belongs to that fieldset so the separate live status region can announce progress.
Successful login clears the password and reveal state. Recoverable errors preserve typed
values. Session controls reuse existing button styles, stay inert before hydration and
never redirect to a guessed business/dashboard. Authentication grants no business access.
Subscriptions release expiry/backoff timers when unused. The session controller contains
no credentials; the form retains its existing transient credential memory while editing.

## Historical single-origin gateway preparation (superseded locally)

The earlier [local gateway proposal](../../prisma/product/single-origin-local.md) selected
approach A: authentication at the direct TLS ingress, with application GET/HEAD requests
forwarded to normal Next.js. It avoided a private-hop attestation protocol. That preparation
is retained as history; it is not the current local startup architecture. The separate
completed curl HTTPS companion proof also remains valid within its original scope.

In that historical design, the ingress owns its TLS/auth keys and the product-test auth client. Exact private
auth routes never proxy to Next. Application forwarding strips authentication cookies and
internal/caller forwarding hints; only application URL hints are generated from verified
TLS/configuration. Origin is preserved, auth cookies keep their existing flags and no CORS
exception is added. At that stage normal Next auth routes stayed unconfigured; current Node API routes are now mounted. Business authorization is
not inferred or forwarded as an identity header; authenticated SSR is not implemented.

The gateway preparation originally had offline implementation only; no new gateway run
is claimed here. Its separate opt-ins, loopback forwarding, TLS requirements and safety
tests remain historical work. The current application instead uses Next.js Node API
handlers and original socket/raw-header metadata directly. Public deployment/proxy trust
and production rate values remain unapproved; no new proxy trust is implied.

## Current verification boundary and remaining captures

The [normal Next.js local procedure](../../prisma/product/registration-workflow.md#owner-run-next-only-local-browser-test)
uses `npm run dev` on explicitly permitted loopback HTTP. Retained private configuration
supplies the existing PostgreSQL counters, digest/signing keys and application services.
No certificate, gateway or synthetic session fixture is a routine prerequisite. The owner
completed the real registration/email/OTP/login/session journey stated above.

The original Prisma session snapshot failed. A subsequent read-only PostgreSQL diagnostic
confirmed **one session record, one distinct digest and valid digest format**. It does not
establish a two-login comparison, expiry/renewal measurements or logout revocation.
See [the session result boundary](sessions.md#latest-owner-run-browser-and-read-only-diagnostic-checkpoint).

Logout browser evidence (including network failure), two-session comparison, same-browser
two-user captures, HTTPS browser cookie evidence and password reset remain incomplete.
The historical request for fresh gateway certificates/fixtures is superseded; do not repeat
old PostgreSQL/curl tests or manufacture evidence. Production activation and legal approval
remain separate decisions. No application or database operation ran during this update.

[Client/controller tests](../../tests/auth-validation/session-client.test.mjs) use injected
fetch responses and a deterministic clock; [UI tests](../../tests/auth-validation/session-ui.test.mjs)
inspect server markup and submit actions. Existing validation/accessibility-markup and
query-state checks are preserved. These do not mount a browser, run Narrator, measure
credential-response timing, prove cookie transport or demonstrate business authorization.
