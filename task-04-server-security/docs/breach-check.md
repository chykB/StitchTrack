# Task Four Step 9: breached-password detection

## Scope and current status

This implements a reusable server-only signup prerequisite and integrates it into the existing local Signup validation preview. The owner supplied the assessment requirements; no PDF was available. The [PRD](../../docs/PRD.md), 12-Unicode-code-point minimum and exact-password policy remain unchanged. Better Auth, operational registration, account creation, sessions and email delivery are still unavailable. No product or assessment database is accessed.

The checker is [breach-check.server.ts](../../lib/auth/breach-check.server.ts); the integration is [validation-preview.server.ts](../../lib/auth/validation-preview.server.ts). Existing Login and Reset behaviour is unchanged. The Signup UI still performs its honest local unavailable action; it does not start sending credentials as part of this slice. Owner HTTP evidence exercises the backend Signup boundary directly.

**Evidence 01-14 is preserved; owner Evidence 15 is captured** in [the live rejection screenshot](../evidence/15-breach-check-rejection.png): HTTP 422 password_breached, no account/session/persistence/email action, and owner_check_exit_status=0. The agent visually inspected the current screenshot without repeating HIBP or HTTP requests. Historical preparation commands below must not overwrite it. This preparation ran only injected-response tests, typechecking and static/documentation checks. No live HIBP call, HTTP demonstration or screenshot was made. The unfinished product-authentication foundation is preserved.

## Range protocol and password handling

1. The existing request boundary bounds and decodes JSON, then validates the complete Signup shape with shared Zod schemas. Invalid name/email/password input never invokes the breach checker. Only parsed input reaches this prerequisite, before any future account writes.
2. The checker validates the Signup password policy defensively and rejects ill-formed UTF-16 instead of allowing UTF-8 replacement. It hashes the exact accepted password bytes as UTF-8 with SHA-1 **only for the range protocol**. It never trims, lowercases or Unicode-normalizes the password.
3. Only the first **five uppercase hexadecimal characters** are sent in an HTTPS GET to https://api.pwnedpasswords.com/range/{prefix}. There is no password, full digest, suffix, email, name, cookie, API credential or request body in that external request. The endpoint is fixed; callers cannot select an upstream URL. Redirects are disallowed.
4. User-Agent: StitchTrack-BreachCheck/1.0 explicitly identifies the application. Add-Padding: true requests padded ranges; Accept: text/plain requests the protocol format. Returned 35-character uppercase suffixes are compared locally. A matching suffix with a positive occurrence count is breached. Padding entries with count zero do not count as matches. Counts and suffixes are never returned to the caller.
5. The checker returns only breached, not_found or unavailable. A valid no-match range means **not found in that returned dataset**, not proof that the password is safe or has never been compromised.

The binary digest necessarily exists transiently in server memory for the comparison. No full hexadecimal digest is constructed by the checker; the binary buffer is cleared after deriving the prefix/suffix. Passwords and fragments are not logged, written to disk/database, cached by application code or exposed in responses. JavaScript strings/garbage collection prevent a secure-memory-erasure guarantee. A fixed public synthetic password in tests/the owner driver is test data, never a stored user credential.

SHA-1 here is a lookup identifier, **never credential storage or authentication verification**. Existing Argon2id hashing remains the credential-storage design. The protocol reference is [HIBP Pwned Passwords documentation](https://haveibeenpwned.com/API/v3#PwnedPasswords); it was not fetched during this no-live-request task. Owner network diagnostics are recorded below; the updated preview still needs an end-to-end owner rejection test.

## Failure policy and HTTP behaviour

The general checkPwnedPassword function retains its default and maximum of **three seconds**, covering response headers and body reading. It does not read an environment timeout override. Tests may inject a shorter deadline. Abort plus a deadline race bounds waiting even when an injected transport ignores cancellation; there are no automatic retries.

A separate checkPwnedPasswordForDevelopmentPreview wrapper allows an explicit AUTH_BREACH_CHECK_PREVIEW_TIMEOUT_MS setting from 1 to **20000 milliseconds**, defaulting to 3000 when absent. It requires the actual Node process and supplied preview configuration both to be development, plus ENABLE_AUTH_VALIDATION_PREVIEW=true and ENABLE_AUTH_BREACH_CHECK=true. The Signup boundary also retains its loopback-host restriction. Production/test/unset runtimes cannot activate this wrapper, even if supplied a development-shaped configuration. Invalid, noninteger or over-limit settings fail closed. This allowance is only for the opt-in local preview, not a production timeout-policy change. Login and Reset remain unchanged.

### Owner-reported connection findings

The owner reports direct curl returned HTTP 200 in **6.11 seconds**; default Node fetch failed with ETIMEDOUT/ENETUNREACH; Node fetch with --dns-result-order=ipv4first --no-network-family-autoselection returned HTTP 200 in **4.17 seconds**. The current Signup attempt returned 503 password_check_unavailable. These are owner-verified network observations, not requests independently repeated by the agent or proof of a completed Signup breach rejection. Both successful diagnostic durations exceed three seconds, which motivates an explicit development allowance rather than weakening the normal checker.

The owner startup command below applies those IPv4 flags through NODE_OPTIONS to the local Next process and children only. It keeps the HTTPS hostname, certificate validation and k-anonymity protocol unchanged; no IP pinning, custom TLS agent or TLS-verification bypass is introduced. The flags address this reported connection path, not a universal production networking requirement. The 20-second HIBP deadline and 30-second owner HTTP timeout cover different layers; cold compilation or other overhead can still make the evidence request fail.

The response must be HTTP 200, nonredirected, text/plain, nonempty, valid UTF-8 and within a two-MiB streamed/advertised limit. Parsing accepts LF/CRLF and an optional final newline, caps the range at 20,000 rows, and rejects malformed/duplicate suffix records, invalid counts and an all-padding response. Every row is checked, so a partially malformed range is never interpreted as a clean result. These are defensive bounds, not a claim that a well-formed but incomplete upstream dataset can be detected.

| Result | Current Signup boundary response | Action permitted |
| --- | --- | --- |
| Basic schema invalid | 422 validation_failed with existing field identifiers | No range lookup or account action. |
| Matching positive breach entry | 422 password_breached, fields: [password], and advice to choose another password | No account action. |
| Timeout, DNS/TLS/network error, upstream 429/other status, redirect, malformed/oversized response or unexpected checker error | 503 password_check_unavailable, generic retry message and Retry-After: 30 | Fail closed; no account action and no silent acceptance. |
| Valid range with no positive match | Existing 503 authentication_unavailable | Only the breach prerequisite passed; registration remains unimplemented. |

Retry-After: 30 is local backoff advice, not a promise that HIBP will recover in 30 seconds or a copied upstream header. Responses are no-store/nosniff, set no session cookies and include false accountCreated/sessionCreated/persisted/emailSent indicators for the breach outcomes. Raw provider exceptions, input values, counts and digest fragments are not serialized.

Fail-closed behaviour blocks legitimate enrollment during an outage and adds external latency/availability dependence. The safe response is to retry later, not bypass the check, silently substitute a weak local test or create an account. A genuine new registration service must enforce this prerequisite unconditionally before persistence; no operational registration path exists in which disabling the preview flag accepts a password.

## Activation and future product integration

The existing preview is already development-only, explicitly enabled and loopback-host restricted. ENABLE_AUTH_BREACH_CHECK=true additionally opts **Signup only** into actual external lookup. With the flag absent, the existing preview remains validation-only and returns unavailable; it cannot create accounts. Production and disabled-preview requests remain 404. Login/Reset never query HIBP, even with the flag enabled. There is no lookup on typing/blur, no new public route and no change to the completed rate-limit experiment.

For real authentication, perform coarse rate limiting and bounded parsing first, basic schema validation next, then this breach prerequisite **before a registration transaction/account creation**. Keep external network calls outside database transactions. Ensure every supported registration entry point requires the check; an optional wrapper around an unprotected generic endpoint would be bypassable. Later integration must retain Terms-version requirements, verification gating, Argon2id and approved invitation restrictions. This task does not authorize that database/integration work.

The Step 8 limiter is a separate local assessment adapter, not production protection for the Next Signup preview. Do not expose this opt-in preview publicly or claim that rate/account controls already protect it. Shared counters, trusted ingress metadata, account-aware abuse controls and endpoint-wide enforcement remain future product requirements.

## Owner procedure for genuine Evidence 15

After review, use WSL Node 24 and the existing dependencies. The commands below are **not executed by this preparation**. Do not use real credentials. The owner driver submits a fixed public compromised-password candidate, password1234 (12 characters), with a synthetic name/email; it prints neither the password nor its digest. Its presence in HIBP and rejection must be observed live, not assumed from this document.

Terminal A:

```bash
cd /home/bmalik/stitchtrack
NODE_OPTIONS='--dns-result-order=ipv4first --no-network-family-autoselection' \
  ENABLE_AUTH_VALIDATION_PREVIEW=true ENABLE_AUTH_BREACH_CHECK=true \
  AUTH_BREACH_CHECK_PREVIEW_TIMEOUT_MS=20000 \
  ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3110
```

Next sets NODE_ENV=development. Do not start the Step 8 adapter for this test; that adapter never calls HIBP. If an existing Next development process holds this checkout's lock, arrange an owner-controlled maintenance window and stop it normally before starting this process. Do not remove lock files, kill unrelated services or silently use another server. Keep the listener local and wait for Ready. No database flags, secrets or SMTP setup are required.

Terminal B:

```bash
cd /home/bmalik/stitchtrack
TASK04_BREACH_EVIDENCE_CONFIRMED=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/breach-check/reject.mjs --owner-check
printf 'owner_check_exit_status=%s\n' "$?"
```

The [owner driver](../experiments/breach-check/reject.mjs) has a fixed loopback destination and a 30-second local HTTP timeout, no redirect handling and no automatic retry. It accepts only an actual 422 password_breached response with the expected password field/message, no-store, no cookies and all account-action indicators false. It prints the actual status and safe validated response, never request contents or unexpected raw server output. It starts no service and makes no request on import.

Personally capture that terminal command, HTTP 422, rejection message and exit status as **task-04-server-security/evidence/15-breach-check-rejection.png**. Check that the displayed target is /api/auth/signup. The screenshot must come from this unmocked owner-started Next server, not unit-test output. Do not overwrite any existing screenshot. A 503, timeout or different response is an unsuccessful/pending demonstration; preserve the observation and investigate rather than manufacturing a rejection. Stop the opt-in server normally after capture.

The local request sends only public synthetic form values to the first-party loopback boundary; the subsequent external request sends only the prefix. No account was registered. The owner has supplied that actual run screenshot as Evidence 15; no new request or screenshot was produced during this documentation update.

## Tests and limitations

[Focused offline tests](../tests/breach-check.test.mjs) inject fetch responses for breached/no-match/zero-count-padding, exact password bytes, invalid basic inputs, HTTP/network failures, malformed/oversized/duplicate ranges, UTF-8 errors and stalled fetch/body deadlines. Integration tests verify validation-before-lookup, gate-off/production behaviour, Signup-only invocation, field feedback, safe errors and unchanged unavailable-action semantics. Timeout tests verify the unchanged three-second general checker, explicit 20-second preview maximum, invalid-setting rejection and the independent actual-runtime gate; they use injected responses and do not wait 20 seconds or call HIBP. The owner driver is tested without making HTTP requests. Existing validation and rate-limit regressions also pass; none establishes live provider availability or creates Evidence 15.

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test task-04-server-security/tests/breach-check.test.mjs task-04-server-security/tests/request-validation.test.mjs task-04-server-security/tests/rate-limiting.test.mjs
./node_modules/.bin/tsc --noEmit --incremental false
```

K-anonymity limits disclosure, but HIBP/CDN/network operators can observe request metadata and the prefix, narrowing candidate hashes. Padding reduces response-size information; it does not provide full anonymity. TLS/proxy/observability configuration must not log sensitive application input or response ranges. No raw lookup response or prefix is deliberately logged here. The server's external network path, proxy behaviour and operational monitoring still require deployment review.

The dataset is incomplete and changes over time. A no-match result does not replace strong password choices, secure storage, verified ownership, rate limits or session security. This slice does not check Login or Reset; a future password-setting reset-completion flow requires separate review rather than silently changing the existing email-only Reset request. Genuine owner Evidence 15 is supplied. Wiring the actual checker into the public functional registration caller remains product integration work; the internal service requires its prerequisite before the transaction, while isolated tests deliberately use a labelled stub.
