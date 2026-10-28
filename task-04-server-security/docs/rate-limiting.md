# Task Four Step 8: rate limiting and its limits

## Scope and current status

The owner supplied the assessment requirements; the PDF was unavailable. Preparation is implemented on feat/task-04-server-security after 88f4563. **Evidence 13 and 14 remain pending owner execution. No live HTTP bypass or rate-limit screenshot was produced by this preparation.** A missing genuine successful source-IP bypass remains an automatic-fail risk.

The [PRD](../../docs/PRD.md) requires server-enforced abuse controls. Existing Next /api/auth/signup, /api/auth/login and /api/auth/reset handlers validate input but do not authenticate. They are unchanged and **do not acquire this limiter**. Better Auth/product authentication, shared counters, account-based limits and production deployment remain unfinished. Evidence 01-12 is historical and preserved.

The [isolated Node adapter](../experiments/rate-limiting/server.mjs) exposes the same three operation paths only on 127.0.0.1:3108. It uses the [shared request/schema boundary](../../lib/auth/request.server.ts) and fixed synthetic fixtures already used for validation timings. It never proxies requests to Next. HTTP 200 means only assessment_request_admitted: the limiter and synthetic validation admitted that request. It does not mean registration, login or password reset succeeded. Responses explicitly report no account, session, persistence or email action. Arbitrary credential payloads are rejected; no database, password hashing, external services or cookies are involved.

This satisfies preparation of an IP-limit demonstration on all three operation paths, not completion of rate limiting on functional product authentication. The assessor must accept that narrowed assessment scope, or the product integration must be completed before this step can be claimed complete.

## Policies, ordering and responses

| Operation | Per-source-IP allowance | Window | Reason and legitimate-user cost |
| --- | --- | --- | --- |
| Signup | 5 POST attempts | 10 minutes | Enrollment is infrequent; several corrections remain possible. A shared studio/campus network could exhaust the budget for unrelated users. |
| Login | 10 POST attempts | 60 seconds | Allows typo retries while bounding bursts. Busy shared networks and password-manager mistakes can still cause temporary denial. |
| Reset | 3 POST attempts | 15 minutes | Lower budget reflects future email-abuse cost. Repeated delivery problems or several users behind one router could be blocked. |

These are explicit assessment starting thresholds, **not approved production capacity or security guarantees**. Production needs traffic/cost measurements, account/IP combinations and owner review. The PRD's separate five-minute OTP expiry, three invalid attempts per code and 60-second resend cooldown are unchanged; none is implemented by this experiment.

The [limiter](../../lib/assessment/ip-rate-limit.ts) uses a fixed window anchored to each endpoint/peer's first attempt, with a monotonic clock. The first N attempts consume the budget; N+1 returns 429. Rejected requests do not extend the window. A new window opens at expiry. Boundary bursts can permit approximately two windows' allowance in a short period, so this is not a sustained-rate guarantee. Separate endpoint budgets prevent resetting one operation through another.

Development/flag/local-host/socket-peer, route, method and assessment-marker checks run first. Each admitted POST spends an IP attempt **before bounded JSON decoding and Zod validation**, so malformed input cannot avoid counting. Existing JSON/origin/body-size guards remain. The marker is an experiment gate, not a production secret or authorization mechanism.

429 includes a short wait message, Retry-After, RateLimit-Limit, RateLimit-Remaining=0 and RateLimit-Reset. Retry-After and RateLimit-Reset are integer **delay seconds**, rounded up; these field semantics are explicitly defined for this fixture, not a claim to implement every rate-limit draft/standard. Admitted responses also carry limit/remaining/reset information. Responses are no-store, expose no submitted values/account existence, and set no session cookies. Unexpected adapter failures return 503 rather than silently admitting a request.

## Actual peer identity and isolation

Next's Web Request interface in the existing routes does not provide a reliable socket remoteAddress. A caller-supplied X-Forwarded-For, X-Real-IP or Forwarded value cannot establish the source. Inferring it here would produce a spoofed demonstration.

The dedicated Node HTTP adapter takes only incoming.socket.remoteAddress as peer identity. It binds to IPv4 127.0.0.1, accepts only actual peers 127.0.0.1/127.0.0.2, normalizes IPv4-mapped addresses and ignores forwarded-IP headers. It requires NODE_ENV=development, ENABLE_AUTH_IP_RATE_LIMIT_EXPERIMENT=true and the exact --owner-serve CLI. Production, flag-off, other peers/hosts and unrelated paths are denied. It has bounded parsing, connection/body deadlines, no persistent request data, and metadata-only logging (peer/status/instance, never headers or bodies).

The owner driver uses Node http.request localAddress to ask the OS to bind a **real source address**. The server response reports its actual observed peer. A random per-process instance ID detects restarts. There is no proxy, header substitution, fake successful branch or automatic retry. The .2 request must be admitted while .1 remains blocked in the same process. These are different loopback source addresses on one machine, not two independently located internet users; they honestly demonstrate the limitation of a per-IP key.

WSL/Linux usually routes 127/8 locally. This preparation has not tested .2 binding on the owner's machine. If binding fails, the peer differs, the server restarts, or the window expires, **stop and preserve the result**. No successful bypass has then been demonstrated; do not replace it with a forged header or invented output. Review the local network arrangement before a separately recorded attempt.

## Owner procedure: genuine Evidence 13 and 14

No secrets, database configuration, Next server or package installation is needed. Use existing WSL Node 24. Do not stop/reconfigure an existing application server. Review the code first. Reserve port 3108; if occupied, stop and investigate rather than changing the target silently.

Terminal A, from WSL:

```bash
cd /home/bmalik/stitchtrack
NODE_ENV=development ENABLE_AUTH_IP_RATE_LIMIT_EXPERIMENT=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/rate-limiting/server.mjs --owner-serve
```

Wait for its local-listener message. Starting this separate process creates fresh in-memory counters. **Do not restart it between trigger and bypass.**

Terminal B:

```bash
cd /home/bmalik/stitchtrack
TASK04_RATE_LIMIT_OWNER_CONFIRMED=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/rate-limiting/owner.mjs --trigger
printf 'trigger_exit_status=%s\n' "$?"
```

The command makes five synthetic Signup requests followed by the sixth. It requires genuine HTTP 200 admission for the first five and HTTP 429 for the sixth, and prints actual headers/body/peer/instance. This is the expected sequence, **not a recorded result**. On success, personally capture the terminal's command, 429 status, response message and retry information as task-04-server-security/evidence/13-rate-limit-triggered.png. Do not capture real credentials. Do not overwrite any existing evidence. A screenshot of a unit-test assertion is not this evidence.

Immediately, before the 10-minute Signup window expires, use this capture block in Terminal B. It refuses an existing log and preserves complete stdout/stderr plus statuses. Do not clear the counters or change the server. It checks .1 is blocked, .2 is admitted, then .1 is still blocked, all with matching client/server socket observations and one instance ID.

```bash
bash <<'TASK04_OWNER_RATE_BYPASS'
set +e
set +x
set -u
set -o pipefail
umask 077
cd /home/bmalik/stitchtrack || exit 1
task04_log='task-04-server-security/evidence/14-rate-limit-defeated.txt'
if [[ -e "$task04_log" || -L "$task04_log" ]]; then
  printf 'STOP: Evidence 14 already exists; preserve it.\n' >&2
  exit 1
fi
(set -o noclobber; : > "$task04_log") || exit 1
(
  printf 'EVIDENCE 14 - actual loopback source-IP change; assessment admission only, not authentication\n'
  date -u '+Started: %Y-%m-%dT%H:%M:%SZ'
  printf 'Source HEAD: '; git rev-parse --short HEAD
  printf 'Node: '; node --version
  printf 'Platform: '; uname -srm
  printf 'Server: 127.0.0.1:3108, development-only experiment; same process as Evidence 13\n'
  printf 'Command: TASK04_RATE_LIMIT_OWNER_CONFIRMED=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/rate-limiting/owner.mjs --bypass\n'
  TASK04_RATE_LIMIT_OWNER_CONFIRMED=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/rate-limiting/owner.mjs --bypass
  task04_run_status=$?
  printf 'bypass_exit_status=%s\n' "$task04_run_status"
  exit "$task04_run_status"
) 2>&1 | tee -a "$task04_log"
task04_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' "${task04_status[0]}" "${task04_status[1]}" >> "$task04_log"
task04_append_status=$?
printf 'run=%s capture=%s status_append=%s evidence=%s\n' \
  "${task04_status[0]}" "${task04_status[1]}" "$task04_append_status" "$task04_log"
if (( task04_status[0] != 0 || task04_status[1] != 0 || task04_append_status != 0 )); then
  printf 'STOP: preserve partial evidence; do not overwrite, retry automatically or claim a bypass.\n' >&2
  exit 1
fi
TASK04_OWNER_RATE_BYPASS
```

The configuration line describes the required actual owner setup, not independent verification of all environment flags. The driver verifies HTTP outcomes, socket identities, no-action markers and process continuity. The owner must review both evidence files. Stop Terminal A normally with Ctrl+C afterwards. A successful fixture bypass proves only that changing an actual source IP obtains another IP budget; it does not bypass schema validation or establish insecurity of unimplemented product authentication.

## Production requirements and trade-offs

- **Shared, atomic counters:** use a reviewed shared store (for example Redis atomic scripts or PostgreSQL transactional counters) across instances/workers/regions as appropriate. Enforce expiry, bounded key cardinality, atomic increments/decisions and operational monitoring. Network latency, storage, write contention, availability and retention costs need measuring. In-memory counters here disappear on restart and diverge across processes; at most six keys exist because the experiment restricts operations and peers. Do not copy it into public authentication.
- **Multiple budgets:** combine canonical account/email identifiers with IP and broader abuse controls on registration, login, reset, verification and resend. Count unknown as well as known accounts without revealing existence. Do not use permanent account lockout that lets attackers deny access to victims. Review short cooldowns/backoff and recovery. The same-account budget would constrain the demonstrated IP change; distributed attackers, IP rotation and IPv6 address rotation still require layered controls.
- **Device identifiers:** an optional signed, server-issued device cookie can supplement risk signals after privacy review. It is resettable, shared/spoofable in some contexts and never authentication or the sole limit key. Do not introduce invasive fingerprinting or pretend a new cookie defeats abuse.
- **Trusted proxies:** configure the actual ingress/hosting topology first. Only a verified immediate proxy may supply client-IP metadata; strip/replace untrusted forwarding headers at ingress, validate its format/hops, normalize addresses and prevent direct-origin bypass. Do not select an arbitrary first XFF value. The local socket adapter is not a deployment proxy design.
- **Failure policy:** the assessment has no remote counter-store dependency. For production, distinguish exhausted budgets (429) from inability to check counters (usually 503). Recommend fail-closed for registration/reset/verification writes; review login availability versus abuse risk explicitly with the owner. Fail-open keeps availability but removes protection during a store outage. Neither is silently selected by this experiment.
- **Legitimate users:** office, campus, mobile-carrier and household NATs share addresses; strict IP-only limits can block innocent users. Dynamic addresses can also move a blocked address to another user. Layered budgets, short understandable retry feedback, measured tuning and an appropriate recovery/support route reduce costs without trusting IP as identity. Avoid account-existence disclosures in rate-limit responses.

Public onboarding stays disabled pending product database/transaction approval, functional Better Auth integration and legal readiness. Approved password preservation, business-scoped invitations and mandatory verification remain unchanged. The planned product needs limiter enforcement on every authentication entry point, not only a wrapper that a generic endpoint can bypass.

## Verification and completion boundary

Run offline, without listeners, HTTP calls, databases or evidence creation:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test task-04-server-security/tests/rate-limiting.test.mjs task-04-server-security/tests/request-validation.test.mjs
./node_modules/.bin/tsc --noEmit --incremental false
```

Tests cover policy boundaries/expiry, separate keys, mapped addresses, gate rejection, forged headers, 429/no-action responses, counting before parsing, bounded validation and owner-command/response checks. Importing drivers starts no listener. Source checks verify socket.remoteAddress/localAddress wiring; **offline tests do not prove a real source-IP change**. Existing auth route regression tests remain separate from live evidence.

Outstanding: owner Evidence 13 and actual successful Evidence 14; assessor acceptance of this isolated scope; production shared/account-aware enforcement on functional authentication. No previous assessment evidence is replaced or broadened.
