# Shared authentication rate-limit foundation

Status: the owner reports successful product-test PostgreSQL verification and exact-key
cleanup. The existing [session HTTP boundary](../../lib/product-auth/session-http.server.ts)
and Signup/OTP routes use shared counters under explicit local Next.js HTTP opt-in.
The owner completed the local registration/SMTP/OTP/login/session journey; public
authentication remains disabled.
The approved seven-day fixed session policy and historical session proof are unchanged.

## Store and consumption

[Implementation](../../lib/product-auth/rate-limit.server.ts) uses the existing product
PostgreSQL infrastructure, without Redis or another service. An injected product runtime
client must come from the existing [exact target guards](targets.ts). Each call also
checks the actual database, restricted runtime role and product namespace. There is no
connection, environment-file read, scheduler or query at module import/factory creation.

`createAuthRateLimiter(client, {mode, identifierKey, policies})` requires explicit
`login`, `signup` and/or `reset` policies. Each operation has a version and separate
account/IP `{capacity, refillIntervalMs}` budgets. One whole token refills per interval;
initially a bucket has its full burst capacity. No numerical product defaults exist.
The capacity-times-interval limit of 2,147,483,647 milliseconds is an arithmetic safety
bound, not a retention policy. Use a new version for changed settings. A reused version
with different stored settings fails closed instead of resetting the bucket.

Call `consume(operation, verifiedTransport, email)` before credential verification on
every parsed login attempt, including successful attempts. Canonicalization reuses the
ASCII email schema: trim/lowercase, with no provider-specific changes. No user lookup
occurs, so nonexistent accounts consume identical budgets. Passwords are never inputs.
Invalid email/transport/configuration returns unavailable. The current local Node adapter
spends the IP budget before body parsing, then the canonical account budget after validation.

The IP bucket is spent first, then the account bucket. Both must allow. No account
operation follows an IP denial. Account denial or storage failure retains any IP token
already spent; there are no refunds or compensating writes. This conservative partial
consumption prevents a storage error from granting access. These are separate atomic
statements, not an all-or-nothing pair transaction. Do not put them inside a registration
transaction that might roll back abuse counters. A lost response may still have spent a
token; never automatically retry the database operation.

The parameterized, schema-qualified `INSERT ... ON CONFLICT DO UPDATE` locks/updates one
bucket atomically. PostgreSQL `clock_timestamp()` supplies time, including a fresh sample
in the conflict update after waiting for a row. Whole intervals preserve partial refill
credit; full buckets discard surplus credit. Backward clock movement cannot refill.
`lastAllowed` disambiguates a last-token success from an empty-bucket denial in RETURNING.
The owner-executed [PostgreSQL checkpoint](rate-limit-postgres-verification.md#owner-executed-checkpoint)
now verifies the scoped concurrency, permissions, constraints and refill behavior.
Serialized test doubles remain distinct from that real database result.

A denied budget returns ceiling seconds until its next token, minimum one. Account denial
also includes the just-spent IP bucket's next-token delay. This is an earliest retry hint,
not reserved future admission: other requests or the other budget can still deny later.
The current HTTP boundary maps denial to generic **429 + Retry-After**, and storage or
configuration failure to generic **503**, without hashing/checking credentials on either.
The limiter module remains reusable and opens no connection on import.

## Identity, transport and operations

A dedicated independent 32-byte HMAC-SHA-256 key scopes identifiers by domain, operation,
policy version, account/IP kind and normalized identity. Only `rl:v1:` plus the hex digest
reaches PostgreSQL. Keep this key out of logs and separate from session, OTP and encryption
keys. The caller privately manages it; no new environment fallback or secret is provided.
Key rotation resets budgets and requires coordinated deployment, just like a policy change.
Digests remain pseudonymous security data; runtime/database query logging must be reviewed.

`rateTransportFromSocket(actualSocket)` accepts Node socket metadata only, produces a
frozen opaque value, and accepts no headers. IPv4-mapped IPv6 becomes IPv4; equivalent IPv6
spellings canonicalize; whitespace, zone identifiers and invalid addresses are rejected.
IPv6 currently uses the full address, not an invented subnet policy. A proxy socket is
only the proxy's address. Current Next.js Node API handlers reuse the original socket and
raw wire headers; arbitrary forwarded headers are rejected. Explicit development loopback
HTTP and account-lock checks are implemented. Production HTTPS/proxy trust and business
authorization remain separate requirements.

## Additive schema and least privilege

The ninth product-authentication model in [schema.prisma](schema.prisma) has seven required columns:
`keyDigest TEXT` PK; `capacity`, `refillIntervalMs`, `tokens INTEGER`; `refilledAt`,
`expiresAt TIMESTAMPTZ(3)`; `lastAllowed BOOLEAN`. No defaults or user FKs are needed.
[Additive migration](migrations/20261030_auth_rate_bucket/migration.sql) checks digest
format, bounded positive policy values, token range, finite timestamps and the exact
full-refill expiry equation. PK uniqueness serializes competing updates; the
`(expiresAt,keyDigest)` index supports deterministic bounded cleanup. Both indexes cost
writes/WAL; the latter is updated as expiry changes. Stored policy values detect mixed
configuration; expiry and last outcome intentionally duplicate derived state for safe
cleanup and atomic result reporting. They do not encode successful authentication.

Separate [test grants](setup/rate-limit-test-permissions.sql) and
[development grants](setup/rate-limit-dev-permissions.sql) admit only their exact existing
database/migrator/runtime combinations. SELECT and seven-column INSERT are needed;
UPDATE is limited to tokens, refill time, expiry and last result. No runtime DELETE,
identity/session/Terms/history/ownership permission is added. Each script pins both SQL
checksums and rejects unexpected privilege/ownership conditions. These grants belonged
to the original two-migration stage; do not blindly rerun them after the third migration. Effective test access was
exercised by the successful owner run; no development grant application is claimed.

`cleanupExpiredAuthRateBuckets(client, mode, batchSize)` is separately callable only with
the exact product migrator identity, batch 1..1000; it uses `FOR UPDATE SKIP LOCKED`.
Only fully refilled/expired rows are removed, so deletion cannot restore tokens early.
No cleanup job runs. Before operational activation, approve a maintenance identity/schedule, pool
connection/statement/lock timeouts, cardinality monitoring and the HMAC key lifecycle.
An attacker rotating identities can still grow the table; IP/account controls complement
rather than eliminate abuse and can penalize legitimate shared networks.

## Owner-executed PostgreSQL verification

The [checkpoint and preserved runbook](rate-limit-postgres-verification.md) record run
`491953db-dd72-419b-a0ef-103facd8f41d`, owner-executed with **proof_exit=0,
capture_exit=0**. Both 20-attempt races admitted exactly three: account **113 ms**, shared
IP **71 ms**, measured using database time. Canonical unknown-account equivalence, policy
mismatch refusal, Retry-After and actual refill passed. Expected PostgreSQL errors were
**42501, 23514, 23502 and 23505**; read-only storage failure failed closed. All proof
connections and loopback sockets closed.

Separate exact-key cleanup committed **10** matching rows, **rate_cleanup_exit=0**, and
closed its connection. This is the created subset of the maximum 28 planned keys, not a
requirement to delete 28 rows. The owner removed the temporary proof log separately.
These are owner-reported result summaries; no screenshots, retained transcript, raw
identities or new measurements are invented, and the agent performed no database action.
The runbook documents retirement of only this run's private manifest directory.

Both grant scripts and the read-only test preflight pin additive SHA-256
`282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c`.
The current Prisma manifest admits three reviewed migrations; the original two-stage
grant/preflight requirements remain intentionally unchanged in SQL. No production or later
development grants are established by the product-test result. Local policies, direct
socket transport and account locking are implemented; production numerical policies,
HTTPS/proxy trust and operational key/maintenance arrangements remain unapproved.
The counter proof alone does not establish a browser journey; the later owner-confirmed
local flow is recorded separately in [Task Five](../../task-05-sessions-compliance-defence/docs/sessions.md).
