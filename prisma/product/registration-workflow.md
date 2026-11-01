# Registration transaction and verification lifecycle

## Scope, authority and decisions

The [PRD](../../docs/PRD.md) remains read-only. Better Auth Email OTP still generates and validates tailor verification codes. Product-owned lifecycle state supplements the plugin rather than replacing it with an unrelated authentication system. The plugin's replaceable/deletable Verification row cannot alone provide a stable delivery identity, so the product schema includes EmailVerificationIssuance. The owner confirms the initial migration was applied to the intended isolated product development/test databases and the product authentication integration harness completed successfully. These are owner-executed results, not agent-run operations.

The current service is an internal factory with an explicitly supplied Prisma client/configuration. It opens no connection on import and exports no Next route or Better Auth handler. It allows only the guarded product development/test targets; public onboarding remains disabled. The explicit local Next.js composition is implemented and owner-tested: registration -> SMTP delivery -> OTP verification -> login -> authenticated session recognition against product-test. Development-only consent deferral records no Terms acceptance; public legal candidates remain unapproved. Shared validation retains the owner's approved ASCII email restriction across Signup/Login/Reset. Unicode display names remain valid; internationalized email users are now excluded, an explicit V1 compatibility trade-off. Historical Task Three evidence records its earlier policy and is preserved.

## Initial eight-model reference and relationships

[schema.prisma](schema.prisma) is the complete column/type/nullability reference. All models live in product, with TEXT IDs and TIMESTAMPTZ(3) times. User.email is the Prisma field mapped to the uniquely indexed emailCanonical column. Do not set Better Auth's field mapping to the physical SQL name. The later ninth model, AuthRateBucket, is documented in the [shared limiter record](auth-rate-limiting.md).

| Model | Purpose, relationships and index rationale |
| --- | --- |
| User | Global identity with Unicode name/canonical ASCII email and emailVerified=false. 1:N Account, Session, TermsAcceptance and EmailVerificationIssuance. PK/unique email support identity/duplicate enforcement; inserts maintain both. |
| Account | Credential row written by Better Auth. userId FK, unique(providerId,accountId), userId index. Nullable password stores only encoded Argon2id. Three indexes maintained on insertion. No OAuth flow is enabled. |
| Session | Better Auth session storage; unique token, userId/expiry indexes plus PK. Four maintained indexes; registration/verification must create none. |
| Verification | Plugin-owned opaque identifier/value/expiry, PK and identifier/expiry indexes. It has 0..1 linked issuance while present. Nonunique identifier matches installed latest-row/consume-all behavior. Three maintained indexes per insert; delete/recreate is plugin behavior, not durable issuance history. |
| TermsVersion | Immutable document reference/digest/version and synthetic/approval metadata. 1:N acceptances; PK and unique version maintained. No candidate policy is approved by creating this model. |
| TermsAcceptance | Required explicit user/version association with server timestamp/context. PK, unique(userId,termsVersionId), version index; both FKs Restrict deletion. Three maintained indexes. |
| EmailVerificationIssuance | Stable UUID, userId/email snapshot, optional unique Verification FK, 32-byte keyed verifier/key ID, failedAttempts, expiry, createdAt and nullable consumedAt/supersededAt. User 1:N issuances. Verification deletion sets only its pointer NULL; the issuance survives. PK, unique verificationId, userId/createdAt, expiry and partial one-open indexes add five maintained indexes. Terminal updates maintain the partial index. |
| EmailOutbox | Required unique issuanceId FK with Restrict, derived User ownership, versioned template and authenticated encrypted payload/nonce/tag/key ID, delivery state/count/times. Issuance 1:0..1 job; service requires exactly one per committed registration issuance. PK/unique issuanceId/status-availability indexes add three maintained indexes; cancellation/rescheduling changes the queue index. |

Core User/Account/Session relations restrict destructive changes, intentionally differing from library cascade defaults. Controlled closure/history rules must be designed before enabling deletion APIs.

Intentional duplication: User email and issuance/email payload snapshots serve current identity versus issue-time destination. The keyed product verifier and plugin's protected verification value represent the same code but have separate roles: a stable serialized attempt/lifecycle gate versus actual Better Auth validation. Their key/context must match. Outbox ownership is derived solely through issuance; no duplicated userId/composite FK is needed. Terms digest/reference duplicates artifact integrity metadata, not policy text. Status/counters are processing summaries, never proof of external email delivery.

## Registration transaction

1. In normal registration, parse unknown input with the shared strict Signup schema plus termsAccepted=true and an explicit termsVersionId. The separately approved local development deferral uses Signup fields only and writes no Terms records. Canonical email is trimmed/ASCII-validated/lowercased. The accepted password is unchanged, well-formed Unicode with at least 12 code points; no compulsory character mix or provisional 128-unit maximum is introduced.
2. Outside the approved development deferral, require the configured Terms version ID. Perform the injected fail-closed breached-password prerequisite **before** opening a transaction. The current local HTTP caller uses the real fail-closed checker outside the transaction. The product-test harness uses only a synthetic no-network result.
3. Open a Serializable Prisma interactive transaction (initial timeout 10 seconds, maxWait 5 seconds). Check actual database, current role and product namespace against the literal proposed target. These initial budgets require real hardware/concurrency calibration; they are not performance evidence.
4. In normal registration, read the required TermsVersion; the development deferral skips this read and all acceptance writes. Synthetic versions require mode=test, explicit allowSyntheticTerms and null approval/effective dates. Development cannot accept synthetic policies. Nonfixture versions require actual approval/effective timestamps not later than the transaction's time. No such public version has been approved here.
5. Bind a fresh Better Auth instance to the supplied tx using transaction:false. Configure custom Argon2id callbacks, autoSignIn:false, requireEmailVerification:true, sendOnSignUp:false, sendOnSignIn:false and autoSignInAfterVerification:false. Disable automatic Signup OTP hooks; do not enable background callbacks.
6. Call signUpEmail through the real library. Observe actual User/Account delegate insert receipts. A generic duplicate response is not proof of creation; require exactly one new User and credential with matching user/accountId and no session.
7. Write TermsAcceptance explicitly in normal registration; skip it only under the approved development-only deferral. Call server-only createVerificationOTP; the installed plugin uses secure random digit generation. Capture the actual Verification insert receipt rather than guessing an opaque identifier. Then write the stable issuance and the encrypted pending outbox explicitly through the same tx.
8. Await every required write, verify no session exists, then allow the outer callback to return. Any required write/callback/API failure aborts the operation. There is no root-client fallback, SMTP, HIBP or detached work inside the transaction.

Failure injection exists after User, Account, TermsAcceptance, Verification, EmailVerificationIssuance and EmailOutbox inserts. It is admitted only in test mode. Verification also has failure seams after the plugin consumes/verifies the user, after the stable consumption marker, and after outbox cancellation. The owner harness separately records that the selected stage was genuinely reached; merely rejecting before that stage cannot count as a rollback proof. All exceptions leave the service as fixed ProductAuthError classifications without input, native errors or causes.

Argon2id runs inside the library signup call and therefore occupies the outer transaction/connection. Offline tests do not establish pool capacity or lock/timeout behavior. No automatic transaction retry is included: unique/serialization conflicts fail safely; the current HTTP layer provides generic, nonenumerating responses without automatic registration-write retries. Production retry/load policy still needs review.

## Verification, expiry and reissue

Each verification/reissue transaction checks its product target and locks the same User row using a parameterized, product-qualified SELECT FOR UPDATE before reading issuance state. Serializable isolation provides an additional conflict boundary. The owner executed the PostgreSQL integration cases, including concurrent registration/verification. Their scoped results are distinct from offline assertions and do not certify all deployment concurrency behavior.

The internal issuance-specific verification API requires canonical email, stable issuance UUID and exactly six ASCII digits as a string. The browser API takes email/code and resolves the latest open issuance under the same User lock. Unknown, verified, superseded, consumed, exhausted or expired issuances cannot authorize verification. Wrong well-formed codes increment the product failedAttempts count and return invalid **without throwing**, so the attempt is committed. The third incorrect attempt cancels pending mail and prevents a later correct code. Malformed input is rejected before storage; transport/account/IP limits remain separate requirements.

Wrong codes do not enter the plugin's delete/recreate path. A matching keyed verifier is passed to Better Auth verifyEmailOTP, which validates/consumes the protected plugin record and updates emailVerified. The same outer transaction marks the product issuance consumed and cancels pending outbox work. Its stable ID/history survives the Verification FK becoming NULL. The private library instance cannot create sessions through this service; generic OTP registration/reset/sign-in APIs are never exposed.

The product expiry is no later than either issuance time + five minutes or the actual plugin expiry. Expired requests cancel pending work and return invalid. Reissue requires an existing unverified credential identity, enforces 60 seconds since latest issuance, marks older active issuances superseded, cancels their pending jobs, deletes their transient plugin rows and creates one new issuance/job in the same locked transaction. It never creates a new user or replaces a credential. Product business membership/client invitation authorization is not implied by email verification.

## Key handling and delivery eligibility

HMAC-SHA-256 uses a 32-byte server key and a versioned context containing issuance ID, canonical email and code. The plugin stores its HMAC string with its own attempt suffix; the product row retains the keyed verifier and key ID. Guessing one million possible codes from a stolen database alone is insufficient without the separate verifier key. Online rate limits remain essential.

AES-256-GCM uses a separate 32-byte key, a random 12-byte nonce and a 16-byte tag. AAD authenticates format version, job ID, issuance ID, template version and key ID. Only email/code enter the encrypted body; passwords never do. Encryption and decryption both enforce a 4-KiB email-payload processing bound, not a password limit. Tampering or unknown keys fail closed. The utilities reject overlapping verifier/outbox keys. Provision keys and the independent Better Auth secret privately; retain needed old key IDs during rotation. No production key store or secret is invented/read by this slice.

The exported deliveryEligible predicate requires pending/available work, matching user/issuance identity and current email, an unverified user, a linked plugin record, unexpired issuance, fewer than three failures and no consumed/superseded marker. Registration, verification and reissue never send SMTP. Tests reject stale/expired/consumed/removed-record cases; ciphertext remains durable history subject to future retention policy.

**Worker boundary:** the existing worker loads fresh state and applies this gate with atomic job claiming, then rechecks immediately before SMTP using bounded dispatch time and reviewed cancellation/fencing. A stale snapshot or decrypted payload is not permission to send. The [minimal worker](email-worker.md) is implemented and offline-tested. Owner PostgreSQL lock/permission/reservation-mechanics checks passed, and the additive worker-permissions SQL was applied only to product_test. The later owner-run development journey established email delivery through the existing outbox/SMTP path. Approved-Terms operational dispatch, crash/retry behavior and production delivery are not established by that result. A database transaction cannot atomically commit SMTP delivery; once a message is handed to SMTP it cannot be recalled. A consume/supersede/expiry race after the final check can still make an in-flight email obsolete, though its code cannot verify. Do not claim impossible exactly-once delivery or absolute recall. Further worker runs and crash/retry/watchdog experiments still require explicit owner authorization; development/production worker privileges are not inferred from the test-only grant; do not hide that race or hold an SMTP call inside a database transaction.

## Applied initial product migration

The single [eight-table initial migration](migrations/20261029_product_auth_initial/migration.sql) contains the original eight-table baseline columns/indexes/FKs, essential row checks and the partial one-open index. The two later migrations add rate buckets and User lock fields; all three are owner-applied in product-test. The [short review](review/README.md) states PostgreSQL/service responsibilities, removed redundant triggers, permission requirements and remaining negative/integration tests. The owner confirms application to the intended product databases. The config admits offline validate/generate plus exact owner-confirmed migrate deploy/status; [staged setup](setup/README.md) remains a historical procedure, not authority to repeat deployment. No root/assessment fallback or shadow target is allowed.

## Owner-executed PostgreSQL proof and retained prerequisites

The owner successfully executed the [harness](../../tests/product-auth/registration.integration.mjs) against the isolated product-test target. It covered the reached rollback stages, concurrent duplicate registration, verification lifecycle, exact passwords and zero sessions. Separate [Evidence 19-22](../../task-04-server-security/docs/verification-design.md#owner-executed-otp-results) captures persisted OTP behavior and actual wall-clock expiry; its missing final completion banner remains unconfirmed. The original harness requires empty tables and must not be rerun against the now-populated store. The prerequisites/command below are retained for provenance; any future execution needs separate target review and owner authorization. No automatic cleanup/reset is provided.

It requires the exact proposed stitchtrack_product_test database, stitchtrack_product_test_app role, product namespace and 127.0.0.1:5432 target. It verifies actual database/role/namespace, rejects superuser/create-role/create-database/bypass-RLS roles, and requires all eight product tables empty before inserting one synthetic Terms fixture. Missing/wrong schema or failed assertions stop the run; partial test records remain for private inspection.

Only after those prerequisites and a separate owner authorization, privately supply PRODUCT_TEST_DATABASE_URL (never paste it into Git or a transcript), then review this command:

```bash
cd /home/bmalik/stitchtrack
NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true PRODUCT_AUTH_INTEGRATION_CONFIRMED=true \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/registration.integration.mjs --owner-integration
```

This command **will connect and write synthetic test records** if authorized. It is not run by any offline test command. The CLI requires that exact argument shape and no URL/target override. Keys/secrets are generated in memory for the test only, never printed, and lost on exit; resulting encrypted test rows are deliberately not operational delivery jobs. The HIBP prerequisite is a fixed test stub and fetch is blocked; no SMTP client exists.

The harness checks real registration rollback after each reached write stage and verification rollback after each reached lifecycle stage; concurrent equivalent-email registration yields one complete enrollment; exact password verification; concurrent OTP verification permits at most one success; replay, expiry, three wrong attempts, cooldown and supersession; stable issuance/job linkage after plugin deletion; and zero sessions. Expiry/cooldown cases use the existing injected test clock without mutating stored timestamps, not a claim that real wall time elapsed. Serializable conflicts may reject one concurrent verification attempt; they must never produce a second successful verification.

The owner must capture actual environment/revision/output/exit status and preserve a failed/partial run rather than rerunning/resetting silently. The harness logs only named test outcomes, not rows, emails, passwords, codes, hashes, key material or URLs. Its PASS lines occur only after actual assertions succeed; no database result is hardcoded. The owner-reported executed results above do not imply that unrun deployment or worker cases passed. The reserved test database must be reviewed separately before another run.

## Internal tailor login/session slice

The private [session service](../../lib/product-auth/session.server.ts) uses installed Better Auth 1.7.7 signInEmail/getSession/signOut with the existing Argon2id callbacks and canonical Login schema. Passwords remain exact; Login applies presence validation, not Signup strength rules or the library's 128-unit cap. Unknown identities, wrong passwords and unverified accounts share login_rejected. Server failures are sanitized. Registration's transaction-bound instance and session-creation prohibition are unchanged.

Only login, fresh server-side lookup, individual logout and authenticated user-wide logout escape the factory, never a generic handler/OTP API. Lookup requires a verified credential identity; no business authorization is implied. Tokens are omitted from application data and occur only in library-managed signed HttpOnly cookie headers, which callers must not log. Cookie cache and renewal are disabled; expiry cleanup and logout require DELETE. Because 1.7.7 signOut can swallow deletion errors, the service checks that the original signed cookie no longer resolves before reporting success.

The [public adapter wrapper](../../lib/product-auth/session-adapter.server.ts) stores only a domain-separated HMAC-SHA-256 digest in Session.token. A dedicated 32-byte sessionTokenKey is required; browser cookies retain the original random token/signature. Per-call token-directed outputs preserve library expiry/logout semantics; user-wide revocation deletes by userId without recovering tokens. Token-bearing enumeration, renewal and generic plugin/handler use remain unsupported. No raw fallback or existing-row conversion is performed.

The session adapter transaction callback is explicitly nontransactional (transaction:false); it only preserves the digest wrapper. Login now uses a real outer User-lock transaction with a fresh Better Auth instance bound to its exact tx; lifecycle locking uses that same ordering. Ordinary logout remains unchanged. The earlier session proof predates this change; the later [account-access PostgreSQL proof](account-access-postgres-verification.md) and separate cleanup also completed successfully. Password reset still requires its own reviewed credential/revocation transaction; user-wide logout is not a barrier to concurrent new sign-ins.

The owner approves tailor sessions lasting 604,800 seconds from login, no renewal or separate inactivity timeout, and no remember-me feature. The current local HTTP composition enforces this policy; the completed 600-second PostgreSQL test configuration is unchanged. The explicit tailor decision is independent of the PRD's proposed client duration. Internal test factories still validate durations against the installed serializer's ceiling. The [guarded HTTP boundary](../../task-05-sessions-compliance-defence/docs/http-session-integration.md) enforces Origin/CSRF, socket-derived metadata, PostgreSQL limits and disabled/deletion-lock checks through the mounted Next.js Node API routes. Explicit local HTTP uses signed HttpOnly/SameSite=Lax cookies; HTTPS adds Secure. The owner completed the local browser journey, while logout/network-failure, two-session and HTTPS browser cookie captures remain pending. Production mode is rejected. See the [completed owner PostgreSQL proof and cleanup](session-postgres-verification.md): run efa712f4-94f6-431a-958a-bc2decb8f893 exited 0, covering distinct tokens/digests, committed persistence, independent lookup, refusal, logout, expiry and user-wide revocation; both connections closed. The owner separately reported DO, COMMIT and cleanup exit 0 for the exact synthetic fixtures. These owner-executed results are distinct from offline tests and do not establish the browser journey. The [Task Five session record](../../task-05-sessions-compliance-defence/docs/sessions.md) lists the remaining requirements. Public activation and legal approval remain absent; the local forms use real backend services.

## Offline evidence and limits

[Unit tests](../../tests/product-auth/registration.test.mjs) use real library calls, Argon2id and crypto against a labelled [delegate double](../../tests/product-auth/fake-product.mjs). They prove orchestration/validation/error branches and encryption behavior; snapshot restoration and simulated FK effects do not prove PostgreSQL rollback, locks or constraints. Existing compatibility tests remain version-pinned to 1.7.7. TypeScript and offline Prisma validation establish type/schema consistency only.

The agent regenerated the ignored product client offline and ran database-free checks. Completed assessment Evidence 01-15, legal drafts, PRD, root/assessment configurations and owner dependency changes are preserved. No such operation was performed by the agent in the original offline slice or this documentation correction. Later owner migration/integration and separate SMTP transport results are recorded above and in [verification design](../../task-04-server-security/docs/verification-design.md). Public authentication remains inactive. Prisma displayed an automatic update notice during CLI validation; its notifier may have checked the update service, so the earlier CLI invocation is not certified network-silent. Further CLI checks and documented offline commands disable it with CHECKPOINT_DISABLE=1.

Assumptions: none. Owner PostgreSQL tests establish their named transaction/constraint/permission cases, not general production readiness. Operational key management, production abuse/transport policy, password reset, complete deletion and remaining Task Five browser evidence remain outstanding. Shared counters, local frontend integration and development email delivery are implemented and owner-tested in their reported scopes.

## Shared abuse counters: applied product-test checkpoint

The [PostgreSQL rate-limit foundation](auth-rate-limiting.md) adds the owner-applied ninth
model, with separate account/IP token buckets. Current local HTTP handlers use these
counters with explicit local policies; no numerical production defaults are approved. Both budgets must allow before password
verification; counters must not roll back with registration. The rate-bucket migration/access and [owner PostgreSQL proof](rate-limit-postgres-verification.md#owner-executed-checkpoint)
were exercised successfully in product-test; the separate account-access proof also completed.
The verified session behavior and seven-day no-renewal policy are unchanged.

## Account-access integration update

[Account lifecycle](../../task-05-sessions-compliance-defence/docs/account-lifecycle.md)
provides offline-tested and owner PostgreSQL-verified lock enforcement. The owner reports the third product-test
migration and both locking UPDATE grants applied. At that historical checkpoint there
were 10 baseline users; the [account proof and separate cleanup](account-access-postgres-verification.md)
completed successfully. No current total user count is inferred. Login owns a
real User-lock transaction and constructs Better Auth/the digest adapter with its exact
tx; lookup reads fresh flags. The pass-through adapter callback itself still provides no transaction. Individual
logout remains unchanged.
The registration adapter's no-session guard is unchanged. Administrative authority,
deletion reauthentication/restoration/audit and pending OTP/mail handling remain open;
no complete deletion/reset workflow or public HTTP activation is claimed.

## Signup/OTP frontend composition (local owner-tested)

The shared [registration contract](../../lib/auth/registration-contract.ts) is consumed by
[the existing service](../../lib/product-auth/registration.server.ts),
[the client](../../lib/auth/registration-client.ts) and
[the dependency-injected HTTP boundary](../../lib/product-auth/registration-http.server.ts).
`beginSignup` preserves Better Auth 1.7.7's neutral duplicate response and hashing behavior;
after a concurrent write conflict it performs read-only reconciliation, without retrying
registration writes or replacing credentials. The original internal `register` contract is
preserved. `verifyEmail` resolves the current open issuance under the existing User lock and
runs the same OTP lifecycle; resend uses the existing 60-second cooldown/outbox transaction.
Neither operation creates sessions. Successful browser acknowledgements disclose no identity,
issuance ID, code or session token, and do not promise SMTP/inbox delivery.

The existing Signup and OTP forms now use the same-origin client, accessible feedback,
duplicate-submission protection and resend/backoff states. Passwords are preserved exactly;
verification success directs the tailor to Login and creates no session.

### Explicit local-development consent deferral

The owner authorized local signup before legal publication. With
`PRODUCT_DEVELOPMENT_CONSENT_DEFERRED=true` in a **development process only**, the service
accepts name/email/password and writes **no TermsVersion or TermsAcceptance**. There is no
fictional acceptance, synthetic legal version or retrospective consent. Normal registration
still requires approved/effective Terms; production cannot use this exception. Existing SQL
permits an absent acceptance row, so no schema, migration or permission change is needed.

The three POST handlers under `/api/product-auth/` now use Next.js **Node API routes**
(`pages/api`); the frontend remains App Router. The supported Node request retains its real
socket and raw wire headers. Routine development requires explicit HTTP opt-in,
local/peer IPv4 loopback on port 3000 and exact Host/Origin. The historical HTTPS path
still requires completed TLS; it is not a routine prerequisite. Both paths refuse forwarding assertions,
duplicate headers and ambiguous framing. It constructs the shared Fetch request from
validated `rawHeaders`, never Next's modified `req.headers`. Body parsing is disabled in
Next and the existing bounded decoder runs unchanged. No private-hop protocol or separate
gateway is required. The old App Router wrappers and request-context shim are removed.
Production and flag-off requests return 404; invalid transport/configuration fails closed.
The reusable service/limiter dispatcher still supports the earlier isolated ingress tests.

Activation additionally requires `ENABLE_PRODUCT_REGISTRATION_HTTP=true`, explicit confirmed
shared PostgreSQL account/IP policies for signup, verify-email and resend-verification, and
independent verifier/outbox keys. No numerical production limits are assumed. HIBP remains
outside the transaction, fail-closed, with its ten-second timeout. The UI receives
only nonsecret configuration and never keys or database URLs.

Deferred jobs use the distinct processing marker `tailor-verification-v1-development-deferred`
in their authenticated encrypted context; this is **not** a Terms version. The existing worker
can send these only with its own explicit development consent-deferral flag, and only when
there is no acceptance record for that identity. Its ordinary approved-Terms predicate is
unchanged. Historical synthetic-Terms jobs remain excluded. All eligibility, attempt/expiry,
advisory-lock and uncertainty checks still apply; registration does not send SMTP.

[Boundary tests](../../tests/product-auth/registration-http.test.mjs),
[mounted development-flow tests](../../tests/product-auth/registration-development.test.mjs)
and [frontend tests](../../tests/auth-validation/registration-ui.test.mjs) use real installed
library/crypto code with database, HTTP and transport doubles. They are not new PostgreSQL,
SMTP or browser proof. Legal candidates, historical evidence and prior integration results
remain unchanged. Public registration and production infrastructure are not enabled.


### Owner-run Next-only local browser test

Routine development uses **http://127.0.0.1:3000** on the normal Next.js server.
`npm run dev` binds only IPv4 loopback. No certificate, TLS handshake, gateway or
proxy is required. Startup retains the previously verified Node IPv4 DNS flags;
TLS verification and the fail-closed HIBP timeout are unchanged. `http://localhost:3000` is also supported when it is the exact
configured origin; use one hostname consistently because cookies are host-only.

Reusable private values stay in Git-ignored `.env.local`: the existing restricted
`PRODUCT_TEST_DATABASE_URL`, signing secret, independent canonical-base64 32-byte
session/rate/verifier/outbox keys, verifier/outbox key IDs and SMTP configuration.
Keep their values unchanged. The standard Git-ignored `.env.development.local`
contains **nonsecret settings only**: explicit HTTP/frontend/session/registration
opt-ins, the exact origin, test-database confirmation, development consent deferral,
local policy confirmation, a retained UUID counter namespace and registration-policy
JSON. It does not create a fixture or consent record. Never copy these opt-ins into
production; missing/invalid secrets, target, policies or counters still fail closed.

The development registration budgets are capacity / refill-one interval:
signup account **3/60s**, IP **10/15s**; verify account **6/60s**, IP **30/2s**;
resend account **2/60s**, IP **10/15s**. These are local testing values, not approved
production limits. Resend also retains the service's 60-second cooldown. The existing
session budgets and fixed seven-day, nonrenewable session policy are unchanged.

```bash
cd /home/bmalik/stitchtrack
npm run dev
```

For actual OTP delivery, explicitly start the **existing** durable outbox worker
in a second terminal (this command authorizes real configured SMTP delivery):

```bash
cd /home/bmalik/stitchtrack
PRODUCT_EMAIL_WORKER_ENABLED=true npm run dev:email
```

That command reads the same two ignored environment files using Node's native env-file
support. It requires existing owner-applied worker grants and matching keys/SMTP settings;
it creates no scheduler or alternate delivery mechanism. Worker activation stays explicit,
separate from registration and default-off. It processes all eligible development jobs,
not just one browser's email. Stop each process with Ctrl-C.

Open `/auth?signup`, use an owner-controlled mailbox, verify the delivered code, then
use `/auth?login`. Verification creates no session. The existing controller performs
session lookup after login; logout reports success only after server revocation.
Local cookies are signed, HttpOnly, host-only, Path=/, SameSite=Lax, without Secure
on HTTP. HTTPS retains Secure cookies. This HTTP exception is refused in production;
production transport/proxy trust remains unapproved and fail-closed. Raw socket address,
wire Host/Origin and forwarding-header rejection remain mandatory; LAN/public peers
cannot use these routes even if someone overrides the development bind command.

PostgreSQL, SMTP and browser execution are owner actions. Offline tests do not prove
live delivery or browser acceptance. HIBP remains fail-closed with its ten-second
timeout; email processing must be running and configured for a complete OTP journey.
No historical fixture, evidence, migration, legal approval or private credential is
changed by this local transport policy.

Development-only server diagnostics emit `[StitchTrack registration] failure_stage=...`
with fixed labels and, for target errors, a fixed `reason`. They never print exception
messages, input, keys or URLs; browser errors remain generic. The running Next.js
configuration probe identified `database_target_configuration reason=database_url_missing`:
privately supply the existing restricted runtime URL as `PRODUCT_TEST_DATABASE_URL`
(not `DATABASE_URL` or a migrator URL) and restart Next. No database was contacted.

A safe initialization-only check, before approving a real signup, is:

```bash
curl --silent --show-error --include \
  --header 'Origin: http://127.0.0.1:3000' \
  --header 'Sec-Fetch-Site: cross-site' \
  --header 'Content-Type: application/json' \
  --data '{}' http://127.0.0.1:3000/api/product-auth/signup
```

The expected result after successful runtime initialization is **403 origin_not_allowed**.
This deliberately fails CSRF checks before rate-limit queries, HIBP or registration.
A 503 still requires inspecting the fixed server diagnostic; never bypass the guard or
claim 403 proves a working database connection, account creation or email delivery.
## Product Prisma connection timezone

Every product `PrismaPg` constructor now uses the fixed
`PRODUCT_PRISMA_CONNECTION_OPTIONS` from [targets.ts](targets.ts):
`options: "-c timezone=UTC"`. The installed adapter can bind an offset-free datetime
and discard a returned timestamptz offset; on a non-UTC connection even a Date
round-trip can hide a shifted stored instant ([upstream issue](https://github.com/prisma/orm/issues/28629)).
This pg startup option applies to each new pooled connection without changing server,
database or operating-system settings. Existing URL/role guards and pool ownership remain.
The plain-pg worker retains its offset-aware parser; it does not use this adapter.

OTP issuance/expiry, outbox availability, verification and session expiry all depend on
these instants. Their durations and eligibility rules are unchanged. **Fully stop and
restart Next.js** before retesting: a cached pre-fix pool is rejected rather than reused
or disconnected during in-flight work. Restart any other long-lived product Prisma
consumer too. No stored timestamp is rewritten or cancelled job revived. The correctness
of historical records requires separate owner review; do not bulk-shift timestamps.

### Owner-only read-only epoch verification

This checks one fresh connection with the same guarded product-test runtime target and
startup option. It does not inspect accounts, OTPs or outbox payloads, and does not prove
that an older running Next.js pool has been restarted. Use the existing private URL;
do not paste its value into the command. Run only after reviewing this procedure:

```bash
cd /home/bmalik/stitchtrack
set +x
NODE_ENV=development PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
node --env-file=.env.local --env-file-if-exists=.env.development.local \
  --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module <<'PRODUCT_UTC_CHECK'
import assert from 'node:assert/strict';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma/product/generated/client.ts';
import { productDatabaseConfig, PRODUCT_PRISMA_CONNECTION_OPTIONS } from './prisma/product/targets.ts';
let client;
try {
  if (['NODE_DEBUG','DEBUG','RUST_LOG','PRISMA_LOG_LEVEL'].some(k => process.env[k])) throw new Error();
  const target = productDatabaseConfig();
  assert.equal(target.mode, 'test');
  client = new PrismaClient({ adapter: new PrismaPg({
    connectionString: target.url, options: PRODUCT_PRISMA_CONNECTION_OPTIONS,
    max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000,
  }, { schema: 'product', onConnectionError: () => {}, onPoolError: () => {} }), log: [] });
  const known = new Date('2026-11-01T12:34:54.639Z');
  const expected = BigInt(known.getTime());
  await client.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [settings] = await tx.$queryRaw`
      SELECT current_database() AS database, current_user AS role,
        to_regnamespace('product')::text AS namespace,
        current_setting('TimeZone') AS timezone,
        current_setting('transaction_read_only') AS read_only`;
    assert.equal(settings.database, target.database);
    assert.equal(settings.role, target.user);
    assert.equal(settings.namespace, 'product');
    assert.equal(settings.timezone, 'UTC');
    assert.equal(settings.read_only, 'on');
    const [epochs] = await tx.$queryRaw`
      SELECT (extract(epoch FROM ${known}::timestamptz) * 1000)::bigint AS bound_epoch_ms,
        (extract(epoch FROM TIMESTAMPTZ '2026-11-01 12:34:54.639+00') * 1000)::bigint AS literal_epoch_ms`;
    assert.equal(epochs.bound_epoch_ms, expected);
    assert.equal(epochs.literal_epoch_ms, expected);
    console.log('timezone=UTC transaction_read_only=on');
    console.log('bound_epoch_ms=' + epochs.bound_epoch_ms);
    console.log('postgres_literal_epoch_ms=' + epochs.literal_epoch_ms);
    console.log('PASS: independent PostgreSQL epochs match the known UTC instant.');
  }, { maxWait: 5000, timeout: 10000 });
} catch {
  console.error('FAIL: read-only product UTC verification; no raw error or configuration printed.');
  process.exitCode = 1;
} finally {
  if (client) try { await client.$disconnect(); }
  catch { console.error('FAIL: connection cleanup.'); process.exitCode = 1; }
}
PRODUCT_UTC_CHECK
```

The independent epoch comparison is essential: checking only the returned Prisma Date
would miss the installed adapter's masking behavior. The [offline regression](../../tests/product-auth/timezone.test.mjs)
uses the actual adapter with an entirely replaced driver query and a non-UTC negative
control; it is not live PostgreSQL evidence. No live verification was executed by the agent.
