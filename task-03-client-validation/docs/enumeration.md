# Task Three, Step 5: disclosure and account enumeration

Status: focused copy refinement implemented. Authentication remains UI-only. I investigated visible format disclosure and reviewed Login/Reset responses; I did not perform a real account-enumeration attack or prove that an operational backend resists one.

## Field selected and what changed

I selected the Email verification code field on `/auth?verify`. It is justified by the authoritative [PRD, section 2](../../docs/PRD.md): tailors will verify email after registration, while clients keep a separate passwordless invitation flow.

| Element | Before Step 5 | Current behaviour |
| --- | --- | --- |
| Visible label | Email verification code | Unchanged; it still clearly identifies the field. |
| Initial helper | Enter the six-digit code for your email. | **Enter the code for your email.** |
| Empty-field error after blur/attempt | Enter a six-digit code. | **Enter your email verification code.** |
| Malformed nonempty input error | Use exactly six digits from 0 to 9. | Unchanged; shown only when an interaction produces a format error. |
| Valid-format local submission | Email verification is not available yet. | Unchanged; it never claims a code was emailed, accepted or verified. |

Only two application strings changed: the [field helper](../../app/%28auth%29/_components/EmailCodeField.tsx) and empty-input message in the [string checker](../../lib/auth/email-code.ts). The exact six-ASCII-digit rule and error timing are unchanged. There is no new field, endpoint or account lookup.

The [Step 4 record](numeric-input.md) and all six original PNGs remain unchanged. Their earlier helper/error wording is genuine historical evidence, not a claim about the current Step 5 copy.

## Information exposed and possible attacker gain

The original helper advertised the exact length before any interaction. Along with the numeric keyboard hint and correction message, that tells a casual observer which candidate formats to try. Six ASCII digit positions allow one million possible strings when leading zeros are included. Knowing that format can avoid wasting guesses on letters or other lengths.

That does not reveal a current code, prove that an email account exists, or authorize a client/business relationship. There is no issued challenge or functioning verifier in today's UI.

I removed unnecessary upfront detail, not the underlying discoverable format. The DOM still contains `pattern="[0-9]{6}"`, inputMode remains numeric, the client validator is inspectable, and malformed input still produces actionable correction guidance. The PRD also states the requirement. Hiding one sentence therefore provides no meaningful OTP security and does not enlarge the code space. An attacker can bypass the UI and address a future endpoint directly; server controls must be independently effective.

## Concrete inconvenience and accessibility trade-off

A legitimate user no longer learns the exact length from the initial instruction. Someone with an incomplete copy, a formatted paste or localized digit glyphs may need to interact, encounter an error and correct the value. That extra attempt can be frustrating, particularly with a screen reader, on a small screen or on a slow future network connection. No delay or network check was introduced here.

I retained the precise format error after malformed nonempty input instead of replacing all feedback with an unhelpful "Invalid code." This openly reveals the format at that point, but allows the user to recover. The limited information benefit does not justify sacrificing accessible instructions. If real testing shows the initial wording causes avoidable mistakes, I would reconsider restoring useful guidance rather than claim secrecy is a defence.

The meaningful label, required state, hint ID, caution icon, aria-invalid and aria-describedby associations remain. Invalid submission still focuses the field after its error renders; correction clears stale errors/descriptions. Keyboard focus styles, string preservation, native paste/editing, one-time-code autocomplete and polite unavailable feedback are unchanged. Controls remain inert before hydration/with JavaScript disabled.

No genuine accessibility failure prevented this narrowly scoped change. Automated focus/description checks passed, but the owner has not supplied new Narrator speech for these revised words; I do not label that manual test complete.

## Login and Reset review

I reviewed [AuthScreen](../../app/%28auth%29/auth/AuthScreen.tsx), [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) and the [credential rules](../../lib/auth/validation.ts).

- Login checks required fields and email syntax locally, then says **"Login is not available yet."**
- Reset checks required input and submit-time email syntax locally, then says **"Password reset is not available yet."**
- Neither checks whether an account exists, distinguishes registered/unregistered addresses, identifies a wrong password for a known account, or claims an email was sent.

These messages required no application changes. Syntax errors describe the submitted input, not database membership, so I preserved them and the approved validation timing. Tests use two different synthetic, format-valid addresses; neither is represented as an existing or nonexistent account. They produce identical unavailable outcomes and browser messages without lookups or transmissions.

This is a review of a nonfunctional backend boundary, not evidence that future authentication has enumeration protection. Once real APIs exist, anonymous failure responses must avoid distinguishing unknown accounts from wrong credentials or account states through copy, HTTP status, redirects or observable processing-time differences. Recovery replies must not reveal account membership; a generic recovery acknowledgement is appropriate only after a real request is handled, not as a fake success in today's UI.

I consulted the primary [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages) for generic authentication failures and response discrepancies, and the [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) for consistent recovery responses/timing, rate limits and safe one-time recovery mechanisms. These sources inform the later review; they do not certify StitchTrack.

## Server protections reserved for Task Four

Before real verification or account recovery, Task Four must implement and test:

1. Authoritative server-side input validation, including compatible six-digit string handling and leading-zero preservation. Client format checks are not access controls.
2. Secure unpredictable code generation and safe challenge storage/validation through the approved Better Auth Email OTP integration. Code handling must not expose secrets through logs or URLs.
3. The PRD's tailor-verification limits: five-minute expiry, three invalid attempts per code, a 60-second resend cooldown, and account/IP rate limits. Enforce these on the server and review resend/concurrency paths for bypasses. No such counters or timers are implemented here.
4. Bind verification to the intended account, email and purpose in a trustworthy server context; reject expired, consumed or inappropriate challenges and prevent replay. Do not trust a route parameter or arbitrary email match as authorization.
5. Prevent unverified tailor sign-in/business access. Email ownership alone must not grant access to another business; clients additionally require their verified invitation relationship.
6. Consistent account-related failure/recovery responses and safe error handling, including status, redirect and timing review. Test real registered/unregistered cases only after explicit authorization in the correct test environment.
7. Controlled SMTP delivery and recovery/session behaviour, with the required Task Three direct-request security evidence completed before integration.

These are future requirements/review work, not features added by Step 5. Client security-default details and operational recovery design must be confirmed against the PRD during implementation; I did not invent a new policy or change its six-digit requirement.

## Actual verification and limits

| Check | Actual result |
| --- | --- |
| Remaining auth, verification, availability, component and query-policy tests | 79 passed, including two new Login/Reset synthetic-address invariance tests. |
| Existing mocked assessment regressions | 21 passed; no database access. |
| Enabled-development HTTP/RSC tests | 58 passed, including neutral initial verification copy, existing auth states, strict-query 404s and the retired comparison route. |
| Production HTTP/RSC tests | 58 passed with the preview flag enabled; unfinished verification remained 404. |
| Real Chrome automation | 15 Node tests passed: seven verification/enumeration cases, six existing auth/document cases and two parents. |
| Typecheck and production build | Passed; existing lifecycle Prisma generation was offline. |
| Documentation links, protected files and whitespace | Seven local links resolved; all eight new/edited files passed whitespace checks. Hashes confirmed 114 protected files unchanged, including Step 4 documentation/evidence. Full git diff --check still flags only the pre-existing read-only PRD whitespace at lines 39-50; the check excluding that file passed. |

Browser automation checked the absence of initial visible digit-count wording, general required feedback, retained actionable format errors, correction/clearing, accessible descriptions, keyboard focus, Arrow-key/string behaviour, refresh/history, three viewport widths and JavaScript-disabled safety. It also checked identical unavailable messages for two synthetic addresses on both Login and Reset, without application writes, address-bearing request URLs or tested cookie/storage changes.

These checks used an isolated headless Chrome profile against a temporary source copy without environment files or assessment evidence. The owner's existing dev server was not restarted or reconfigured. Scoped network checks are not an all-network audit, and browser accessibility-tree checks are not actual Narrator speech. No screenshots, audio, transcripts or terminal evidence files were created. No real account existence, backend timing or direct-request bypass resistance was tested.

Reproducible database-free checks:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/email-verification/availability.test.mjs tests/email-verification/validation.test.mjs tests/email-verification/components.test.mjs tests/auth-validation/*.test.mjs tests/auth-foundation/state.test.mjs
npm run test:assessment
npm run typecheck
npm run build
git diff --check
```

The existing local preview activation remains `ENABLE_CODE_INPUT_EXPERIMENT=true npm run dev -- --hostname 127.0.0.1`. Its guard is unchanged: development plus explicit opt-in plus an approved loopback Host; production stays unavailable. The retired `/assessment/code-input` page was not restored.

Owner follow-up is to check the revised initial/empty wording and correction experience with keyboard/Narrator. Preserve Step 4 evidence rather than recapturing or relabelling it as Step 5. Actual backend security experiments remain pending their own authorization.

The PRD, legal policies and Step 4 documentation/evidence were preserved. No credentials or database records were created or changed; no database operations, dependency changes, Git staging, commits or pushes were performed.

Assumptions: none.
