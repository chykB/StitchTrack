# Initial product migration review

**Draft, unexecuted, not authorization to connect or deploy.** The single [initial migration](../migrations/20261029_product_auth_initial/migration.sql) replaces the unexecuted constraints.proposal.sql supplement. It was authored offline from [schema.prisma](../schema.prisma); no Prisma command guard was bypassed. PostgreSQL syntax and behavior still need owner-controlled testing.

## Database and service responsibilities

| PostgreSQL enforces | Transactional service enforces |
| --- | --- |
| Eight PKs, seven FKs, seven ordinary unique indexes; nine lookup indexes. All objects target product. | Real User/Account insert receipts, explicit current Terms acceptance, Verification, stable issuance and encrypted job must all succeed in one outer Serializable transaction. No post-commit hooks provide required writes. |
| Canonical printable ASCII/lowercase email storage and unique email; nonblank Unicode name. | Full shared Zod email syntax, trim/lowercase canonicalization, exact accepted passwords and 12-code-point minimum. SQL validates storage without rewriting it. |
| Credential-only provider/accountId ownership; Argon2id v19 PHC shape with positive parameters, minimum 16-byte salt/32-byte output encoding lengths. | Actual Argon2id hashing/verification with reviewed parameters. SQL cannot certify hash correctness or work-factor strength; its shape check deliberately permits parameter upgrades. OAuth is not enabled. |
| One open issuance per User, including expired/exhausted rows; required issuance FK gives each job exactly one owner path. | Same User row lock for verify/reissue; terminal-first replacement, 60-second cooldown, current-time expiry and code matching. No automatic retry of serialization conflicts. |
| Issuance HMAC=32 bytes, attempts 0..3, finite positive lifetime <=5 minutes, exclusive terminal markers and valid consumption state/time. | Commit wrong attempts, refuse fourth/replay/expired/superseded requests, preserve stable issuance when Better Auth deletes Verification, and cancel obsolete jobs. |
| AES-GCM nonce=12/tag=16 bytes, ciphertext 1..4096 bytes; allowed outbox states/counts and coherent delivery timestamps. | Separate keys, authenticated metadata/payload, fresh ownership/email/eligibility checks. No SMTP or HIBP inside a database transaction. |
| Terms artifact/digest and fixture/approval metadata shape, acceptance context/uniqueness/FKs; Session/Verification expiry ordering. | Approved/effective configured Terms version, fixtures only in isolated test mode, append-only acceptance writers, no session before verification and no session during registration/verification. |

The partial index adds uniqueness work on insert/terminal updates. Expired rows retain the slot until superseded; inserting a replacement first is invalid. EmailOutbox.userId, its index and the proposed composite FK/extra target unique key are removed. Ownership is derived through issuance; AEAD AAD binds job ID, issuance ID, template and key version. No existing product ciphertext needs conversion because no product migration/data exists yet.

## Deferred protections and limits

The former nine triggers/ten functions duplicated private transactional writers and added commit-time complexity. Required-child checks, session gating, monotonic counters and append-only history remain service guarantees, **not database-enforced claims**. Current APIs cannot update/delete Terms history or expose generic OTP sign-in/reset. No public handler exists. The runtime role must not own tables or have DDL privileges; before public access, approve grants restricting TermsVersion/TermsAcceptance updates/deletes and review every new writer against these invariants. Privileged SQL can bypass application rules; no tamper-proof claim is made.

Worker claiming/retries, ciphertext rotation, retention and maintenance paths are deferred because no worker/closure feature is active. Before enabling dispatch, test fresh eligibility, cancellation races and SMTP handoff; sent will mean recorded SMTP acceptance, not guaranteed delivery. Cross-table immutable email snapshots and current Terms selection remain writer checks. Full password policy and HMAC/AEAD authenticity cannot be established by SQL.

## Owner review and remaining PostgreSQL proof

1. Review the [owner-only setup](../setup/README.md) and run its read-only preflight first. Provisioning/grants use the named product dev/test migrators and runtimes; no role is claimed to exist. The unchanged migration preflight requires its nonprivileged product namespace owner and excludes both runtimes. Provisioning is separate administrative work.
2. The isolated config now admits exact migrate deploy/status only with separate confirmation, exact named migrator URL/schema=product and the reviewed SQL checksum. Offline validate/generate remain credential-free; reset/push/resolve/generation stay blocked. No root/assessment fallback or shadow target is configured.
3. Owner applies to the reserved product-test target first and verifies product._prisma_migrations, all eight tables/70 columns, 25 indexes including PKs/partial index, seven FKs and 15 CHECKs. Confirm unrelated namespaces unchanged. Preserve output/failure; no automatic reset/retry/history edits.
4. Authorize the [integration harness](../../../tests/product-auth/registration.integration.mjs) only on empty isolated product-test tables. It tests six write rollback points, three verification rollback points, duplicate registration, unverified sign-in refusal, exact passwords, OTP race/replay/attempts, logical-clock expiry/cooldown and concurrent reissue. No PostgreSQL result has yet been observed.
5. Complete direct negative/catalog checks for each SQL constraint (including second-open insertion while an expired row still occupies the slot, invalid FK owners, crypto lengths, terminal states and credential/Terms metadata). Assert the intended constraint/SQLSTATE using synthetic data and sanitize diagnostics: failing rows can contain sensitive fields. These are acceptance checks, not passing offline results.

The [static tests](../../../tests/product-auth/sql-review.test.mjs) compare every scalar column/type/nullability/default, declared index/FK, crypto shape and guard contract. They do not parse/execute SQL or prove transactions. See [workflow](../registration-workflow.md) for the conditional owner integration command.

Assumptions: none.
