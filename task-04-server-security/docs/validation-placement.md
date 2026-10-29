# Task Four Step 6: schema validation at the server boundary

**Owner HTTP Evidence 11 is captured** in [the genuine timing log](../evidence/11-validation-timing.txt); its scope is the controlled validation fixture. This document records the original preview slice, not a claim that current internal product authentication is absent. [Current scope](../README.md) separates the later owner-tested foundation from unfinished public integration. The assessment PDF is unavailable. This document follows the owner's supplied Step 6 requirements and preserves [PRD](../../docs/PRD.md), completed evidence and exact-password policy. No database operation, real authentication or timing evidence was performed by the agent.

## Repository findings and current scope

| Area | Historical preview-slice state (current status above) |
| --- | --- |
| Existing authentication UI | Signup, Login, Reset and local verification view; forms remain UI-only and are not wired to the new APIs. |
| Existing server work | Task Two's separately guarded synthetic enquiry persistence endpoint; Task Three's fixed-payload form-bypass fixture; database-free shared Zod schemas and Argon2id utilities. No Better Auth registration/login/reset/session/SMTP integration exists. |
| This slice | Real Next.js request handlers at /api/auth/signup, /api/auth/login and /api/auth/reset validate JSON with the shared schemas. They are default-off, development/loopback-only previews; valid input returns HTTP 503 authentication_unavailable. Invalid schema input returns 422. Production/default-off returns 404 before reading a body. |
| Separate timing fixture | /api/assessment/validation-timing compares the same guarded synthetic HTTP pipeline with/without its shared-schema step. It has its own flag and can receive only the fixed synthetic fixtures. Neither variant calls a business/authentication service. |
| Still missing | Functional registration/login/reset, approved/versioned Terms integration, verification-gated sessions, rate limits, breach checks, SMTP/outbox and real account persistence. No public onboarding is enabled. |

The preview flag is ENABLE_AUTH_VALIDATION_PREVIEW=true; the timing flag is ENABLE_AUTH_VALIDATION_TIMING=true. Both also require NODE_ENV=development and matching HTTP loopback URL/Host. Bind Next to 127.0.0.1 and do not publish it through a proxy/tunnel. Host checks alone do not prove the peer is local. These preview paths are not a final Better Auth API contract.

## Why Zod and which schemas

Zod is already installed and required by the locked stack. [Shared schemas](../../lib/auth/schemas.ts) define strict object shapes, error rules, inferred input/output types and canonicalized parsed data once. [safeParse](https://zod.dev/basics) exposes explicit success/failure and parsed output. Reusing it reduces drift between browser feedback and backend rules; TypeScript types alone cannot validate incoming JSON.

| Operation | Accepted shape and existing rules |
| --- | --- |
| Signup | name, email, password only. Name required/nonblank, Unicode allowed. Email trimmed/lowercased with current format rule. Password minimum 12 Unicode code points, no required character mixture or arbitrary per-password maximum, whitespace-only/control/separator rejection; accepted characters preserved exactly. |
| Login | email, password only. Same email parsing; password required/presence-only and unchanged. New enrollment restrictions are not retroactively applied at sign-in. |
| Reset | email only, using the same email parser. No account lookup or existence result. |

Unknown keys, wrong types, missing fields and wrong root shapes are rejected. No password trimming, lowercasing or normalization is introduced. The local draft-review checkbox is not approved Terms acceptance and is not part of these credential-only schemas. Verification codes/invitations and the complete future registration contract remain separate work.

Manual route checks are still appropriate for method, content type and resource bounds. They should not duplicate field validation across three handlers. Shared schemas make the contract testable and provide safe parsed output, while domain rules still need transactional checks and authorization. A valid schema is not proof of ownership, uniqueness, permission or credential authenticity.

## Position in the request lifecycle

1. Transport/framework work occurs first: connection/TLS in deployment, route dispatch and safe request metadata. The local preview gate runs before body access. Method, query, origin, content type/encoding and content-length guards can reject early. Future coarse rate limits and authentication of already-protected operations may also precede body parsing.
2. Bound actual streamed input, then decode UTF-8 and parse JSON into **unknown**. Parsing JSON establishes syntax, not trust. The current transport cap is 16 KiB, including JSON overhead, enforced with or without Content-Length; malformed JSON/UTF-8 returns 400, media/encoding failures 415, oversized input 413. Server/gateway body deadlines and connection abuse controls remain necessary beyond this bounded reader.
3. [parseAuthInput](../../lib/auth/request.server.ts) selects the operation's shared strict schema and calls safeParse. Invalid input stops with 422. Responses include only predefined field identifiers and a form-error flag; raw Zod issues, unknown keys, values and stacks are never echoed.
4. Only a successful discriminated ValidatedAuth object reaches the callback. It contains result.data: canonical email and unchanged accepted name/password. Raw request data must not be forwarded alongside it. Focused tests verify callback nonexecution on envelope/JSON/schema failure.
5. Account lookup, password hashing/verification, breach queries, DB writes, sessions, invitation changes, acceptance recording, email/outbox jobs and business actions must **not** run on these unvalidated credential values. None is connected here. The current callback returns only 503 with false account/session/persistence/email indicators.

The 16 KiB cap is a transport safeguard, not a new Signup password character limit. It can reject extremely long otherwise schema-valid names/passwords; future backend processing bounds and UI alignment need explicit review. Input is never truncated. In production, also configure trusted proxies, HTTPS, safe logging, CSRF/session handling and error containment appropriate to the eventual authentication flow. Validation does not replace those controls, SQL parameterization or output encoding.

The base validation modules log no request bodies, credentials or account-existence information, set no cookies and make no outbound calls. The later explicitly enabled [Signup breach preview](breach-check.md) can perform an external prefix-only range lookup; it does not activate registration. Responses are no-store. Framework/infrastructure logging remains a separate configuration responsibility; never put credentials in URLs. Existing enquiry/fixture routes and application forms are unchanged.

## Credible timing scope and explicit blocker

There was no functioning registration/login/reset endpoint before this slice, so there is **no genuine historical before-validation registration baseline** to replay. Do not label Task Three's HTTP 200 fixture response or a page-route 405 as real registration timing. Functional authentication and end-to-end before/after registration performance remain blocked on the later approved backend integration.

The prepared comparison is narrower: genuine HTTP POSTs to one fixed-synthetic, no-op endpoint. Both baseline and validated variants run the same local access, request-envelope, bounded JSON and exact synthetic-payload guards. Baseline omits only the shared Zod schema step; it is not an entirely unvalidated endpoint. Validated adds the same parseAuthInput used by the new boundaries. The response body is identical. This is an explicit controlled counterfactual, not evidence that a real authentication service previously accepted unvalidated credentials. Assessor acceptance of this scope remains required.

| Metric | What the owner driver actually measures |
| --- | --- |
| clientMs | Monotonic elapsed time from fetch initiation through complete response-body receipt: loopback HTTP, connection reuse/queueing, Next routing and response work included. |
| Server-Timing handler | Handler-entry work after the local access gate through guards, body parsing, fixture check and optional schema parsing; excludes response serialization, framework work outside the handler and network transfer. |
| Server-Timing schema | Time around shared schema parsing in the validated variant. Baseline reports 0 because this step does not execute, not because a measured Zod call took no time. |

Hashing, database/network-to-DB, breach-service calls and SMTP are absent from both variants. Only loopback HTTP is involved. The [driver](../experiments/validation-timing/measure.mjs) excludes five warm-up requests per variant/operation, then runs 30 sequential pairs per operation with alternating order. It prints each actual sample, HTTP status, mean/median/nearest-rank p95 and mean deltas (validated minus baseline). No results or expected overhead are hardcoded. Connection reuse, JIT, GC, Next development tooling and OS scheduling still contribute noise.

If the delta is substantial, first compare handler/schema metrics with client latency. A client increase much larger than schema time points to other included work/noise; it does not prove Zod alone caused it. Preserve negative/noisy differences, report absolute milliseconds as well as relative changes and avoid production-capacity claims. If investigation requires a second run, keep it as separately named supplemental evidence rather than overwriting the first. Actual overhead is unknown until owner execution.

## Owner execution and Evidence 11 capture after review

Use existing WSL Node 24. No credentials or database variables are required. Do not run Prisma, migrations, hashing benchmarks or normalization experiments. In Terminal A, after reviewing the code, start a local server:

```bash
cd /home/bmalik/stitchtrack
ENABLE_AUTH_VALIDATION_PREVIEW=true ENABLE_AUTH_VALIDATION_TIMING=true ENABLE_PERSISTENCE_EXPERIMENT=false ENABLE_FORM_BYPASS_EXPERIMENT=false ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3106
```

Do not stop an existing server or remove Next lock files blindly. If another Next development process owns this checkout's lock, the owner must arrange a maintenance window and stop their own process normally before starting this one. Do not expose port 3106 externally. Wait for Ready; save relevant startup/version context separately if needed. No timing baseline is claimed if the server cannot start.

In Terminal B, optional direct checks of the three boundaries can be performed without real credentials:

```bash
cd /home/bmalik/stitchtrack
for operation in signup login reset; do
  curl --silent --show-error --include --request POST "http://127.0.0.1:3106/api/auth/$operation" --header 'Content-Type: application/json' --data '{}' --write-out '\nHTTP_STATUS=%{http_code}\n'
done
```

All three empty shapes should return actual 422 responses; preserve any different result and investigate. This is an expected outcome, not fabricated output. Valid shapes yield only 503; Node Request tests cover that path, while real HTTP observations remain owner work. The unchanged Task Three payload file can later be sent to /api/auth/signup for Step 7, but this slice does not capture Evidence 12 or claim that comparison is complete.

Run the following **once after review** to collect real HTTP timings. It refuses existing/symlinked evidence and preserves full output and exit statuses. The driver uses only fixed synthetic data, rejects redirects/unexpected responses/cookies and stops if the target fixture is unavailable. It never calls the auth preview endpoints or accepts arbitrary target URLs.

```bash
bash <<'TASK04_OWNER_VALIDATION_TIMING'
set +e
set +x
set -u
set -o pipefail
umask 077
cd /home/bmalik/stitchtrack || exit 1
task04_log='task-04-server-security/evidence/11-validation-timing.txt'
if [[ -e "$task04_log" || -L "$task04_log" ]]; then
  printf 'STOP: Evidence 11 already exists; preserve it.\n' >&2
  exit 1
fi
(set -o noclobber; : > "$task04_log") || exit 1
(
  printf 'EVIDENCE 11 - owner HTTP comparison, fixed synthetic fixture; not real registration\n'
  date -u '+Started: %Y-%m-%dT%H:%M:%SZ'
  printf 'Source HEAD: '; git rev-parse --short HEAD
  printf 'Uncommitted source paths, if any:\n'; git diff --name-only
  printf 'Server configuration: next dev on 127.0.0.1:3106; ENABLE_AUTH_VALIDATION_TIMING=true; no auth/DB/email work\n'
  printf 'Command: TASK04_VALIDATION_TIMING_CONFIRMED=true NODE_USE_ENV_PROXY=0 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/validation-timing/measure.mjs --owner-measure\n'
  TASK04_VALIDATION_TIMING_CONFIRMED=true NODE_USE_ENV_PROXY=0 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/validation-timing/measure.mjs --owner-measure
  task04_measure_status=$?
  printf 'measurement_exit_status=%s\n' "$task04_measure_status"
  exit "$task04_measure_status"
) 2>&1 | tee -a "$task04_log"
task04_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' "${task04_status[0]}" "${task04_status[1]}" >> "$task04_log"
task04_append_status=$?
printf 'run=%s capture=%s status_append=%s evidence=%s\n' \
  "${task04_status[0]}" "${task04_status[1]}" "$task04_append_status" "$task04_log"
if (( task04_status[0] != 0 || task04_status[1] != 0 || task04_append_status != 0 )); then
  printf 'STOP: preserve partial evidence and investigate; do not overwrite or invent a successful run.\n' >&2
  exit 1
fi
TASK04_OWNER_VALIDATION_TIMING
```

The server-configuration line records the required run setup; the owner must actually start it that way. The driver's successful fixed-target responses/markers verify availability but do not certify every server flag. Compilation delays or request timeouts are genuine failures, not a reason to substitute invented samples. No Evidence 11 file was created by this preparation.

## Step 7 provenance and remaining compliance gaps

[Task Three Evidence 16](../../task-03-client-validation/evidence/16-direct-request-command-and-response.txt) records an agent-executed HTTP 200 from /api/assessment/form-bypass using the preserved [synthetic payload](../../task-03-client-validation/fixtures/form-bypass-payload.json). It was not registration. The new Signup boundary rejects that body (including the now-required missing name) with 422 in offline Request tests. Step 7 must still capture the actual new HTTP response, both endpoint names, the unchanged request body and a side-by-side comparison in 12-direct-request-before-and-after.txt. Do not retrofit old evidence or pretend both endpoints are the same service. OTP/invitation checks and complete Terms acceptance are not covered by these three credential schemas.

Evidence 09/10 exists at 552b607 but demonstrates isolated normalization/trimming; it does not establish functional registration/login processing. Product passwords remain exact, and the assessment's actual-auth password-trimming expectation still needs an explicit accepted exception or separately approved policy decision. Legal candidates remain unapproved; real registration cannot bypass approved Terms/version requirements.

This slice establishes reusable backend validation and guarded request handlers. Functional authentication integration, owner HTTP/timing evidence, interpretation of measured overhead and assessor acceptance of the controlled baseline remain **incomplete**. The focused tests/typecheck provide no real HTTP performance result. Existing frontend behaviour, Task Two operations and all historical evidence remain preserved.

References: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) use Web Request/Response APIs; [Zod basic usage](https://zod.dev/basics) documents safe parsing and inferred output. These support the implementation approach, not measured performance claims.
