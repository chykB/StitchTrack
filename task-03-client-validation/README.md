# StitchTrack — Task Three: The Form, Attacked From Both Sides

I used Task Three to build and test StitchTrack's tailor authentication interface before adding a real authentication backend. The product needs tailor email/password access and separate invitation-based, passwordless client access. The [PRD](../docs/PRD.md) remains authoritative.

This overview reflects local HEAD `c1e6180` on `feat/task-03-auth-foundation`, plus the reviewed documentation work. The assessment PDF is not in the repository; the owner's supplied requirements and 14 interview questions define this submission. Older handoff statements describe their stages, not necessarily today's status.

## What is implemented

The Task Two scaffold contained **zero authentication pages**. Task Three created three real routes at `cb31dc9`, then consolidated them at `84dc8f1`: **three auth pages became one**, and total application pages went from five to three. The later verification preview adds a query state, not another page. The three current page routes are home, auth and the separately guarded Task Two enquiry page.

| URL / interface | Current behaviour |
| --- | --- |
| `/auth` or `/auth?login` | Tailor email/password Login UI. |
| `/auth?signup` | Tailor email/password Signup UI. |
| `/auth?reset` | Email-only password-reset request UI. |
| `/auth?verify` | Six-digit string code-entry preview; explicit development flag and approved loopback Host required. Production returns 404. |
| Conditional Terms/Privacy views inside Signup | Development-only, opt-in preview of unchanged unapproved v0.2 drafts; no new route or URL change. |
| `POST /api/assessment/form-bypass` | Separate default-off, local-development synthetic fixture; not registration, and never called by the forms. |

Unknown, conflicting, duplicated or valued public auth query keys return genuine HTTP 404. Direct loads, refresh and history follow the URL. Owner navigation evidence records same-document switching and Back/Forward; that particular manual run did not check authentication cookies.

I reused Task One's Tailored Wine semantic tokens, DM Sans and existing responsive components. Signup email checks begin while typing; Login/Reset format feedback waits for submission. Empty blur feedback, associated text/icon errors, visible focus and password Show/Hide controls remain. Signup uses a 12-Unicode-code-point minimum, allows meaningful spaces, rejects whitespace-only/control-character values and has no current arbitrary maximum. Backend processing bounds and policy review remain future work.

Controls remain disabled before hydration and without JavaScript. After hydration, Create account stays visible and focusable with guarded aria-disabled behaviour. Valid submissions display only the relevant unavailable-action message. Draft acknowledgement is not approved Terms acceptance or a saved legal record.

## Experiments and actual results

- **Numeric-looking text:** the owner observed native number stepping change `004281` to `4280`, losing zeros. The final text input preserves the string with inputMode=numeric; Arrow Up/Down did not alter it in the owner's corrected test. All six genuine PNGs exist as the permitted alternatives to Evidence 09/10 videos. The retired `/assessment/code-input` page is removed.
- **Disclosure and enumeration:** unnecessary upfront digit-count wording was removed, while actionable correction feedback remains. Format obscurity is not OTP security. Login/Reset do not perform account lookup or reveal account membership.
- **Form attacks:** Evidence 15 records 70 actual function cases and 26 Chrome cases, distinguishing blocked input from format-valid but unavailable actions and browser input transformations.
- **Direct HTTP:** agent-executed WSL curl sent `a@b` and a one-space synthetic password to the fixed-payload fixture. HTTP 200 acknowledged only that synthetic pair, explicitly reporting no account, session, persistence or email. This is not evidence of insecure real registration.
- **Rollback completed:** checkpoint `bcd1b37` was preserved; temporary note commit `3009fe1` was reversed by `c019741` using git revert. `c1e6180` records the exercise. This was a controlled note rollback, not recovery from a production incident.

Existing reports record passing database-free unit/rendering tests, development/production HTTP/RSC checks, Chrome regressions, typecheck and build. Step 8 specifically records 70 attack tests, eight fixture tests, 79 existing auth tests, 21 mocked assessment regressions, and 62 HTTP/RSC tests in each enabled-development/production context. These are prior results, not tests rerun during this documentation revision.

## Documentation index

| Record | Purpose |
| --- | --- |
| [Authentication foundation](docs/auth-foundation.md) | Genuine zero-to-three baseline; historical source paths and screenshots. |
| [SPA rationale](docs/spa-rationale.md) | Consolidation, strict URL policy, route counts and trade-offs. |
| [Field justification](docs/field-justification.md) | Why each current/planned control exists; minimal tailor registration. |
| [Validation rules](docs/validation-rules.md) | Rules, timing, legitimate-user costs and password policy. |
| [Terms note](docs/terms-note.md) | Draft sources, hidden/visible-button history and legal/publication boundaries. |
| [Numeric input](docs/numeric-input.md) | Completed before/after experiment, six PNGs and cleanup. |
| [Enumeration](docs/enumeration.md) | Format-disclosure trade-offs and future server protections. |
| [Accessibility audit](docs/accessibility-audit.md) | Owner Narrator observations, source corrections and explicit assessment shortfall. |
| [Client-side is not security](docs/client-side-is-not-security.md) | Actual fixture request, response, limitations and reproduction. |
| [Rollback](docs/rollback.md) | Completed exact-commit revert exercise. |
| [Defects](docs/defects.md) | Observed defects, corrections, controlled experiments and unresolved risks. |
| [Interview answers](docs/interview-answers.md) | All 14 questions, including the owner's honest lack of direct customer-disagreement experience. |

The [company-based Terms candidate](docs/platform-terms-v1.0-candidate.md) and [Privacy candidate](docs/privacy-policy-v1.0-candidate.md) are **NOT APPROVED / NOT PUBLIC**. The local historical preview does not approve or publish them. Platform policies are distinct from tailor-client garment agreements.

## Evidence index

Paths below preserve the originals. Still images establish visible states; interaction sequences rely on the accompanying owner reports or automated logs.

| Evidence | Files and provenance |
| --- | --- |
| Foundation and page counts | [Foundation count](evidence/00-foundation-route-count.txt), [01 before](evidence/01-page-count-before.txt), [02 after](evidence/02-page-count-after.txt); historical inventories. |
| Consolidated URLs | [03 combined](evidence/03-url-states.png), original [Signup](evidence/03-auth-signup.png), [Login](evidence/03-auth-login.png), [Reset](evidence/03-auth-reset.png); real browser address bars. |
| Switching | [04 HTTP/RSC probes](evidence/04-form-switch-logs.txt), [owner browser record](evidence/05-browser-navigation-verification.txt), [navigation capture](evidence/05-browser-navigation.png). HTTP probes are not browser clicks. |
| Validation 05–08 | [Empty fields](evidence/05-empty-field-error.png), [minimum length](evidence/06-length-rule-blocking.png), [Signup email](evidence/07-email-realtime-signup.png), [Login submit](evidence/08-email-on-submit-login.png). Some captures predate later copy/eye refinements. |
| 09 native number, three-PNG alternative | [01 empty](evidence/09-number-input-annoying-01.png), [02 zeros/spinners](evidence/09-number-input-annoying-02.png), [03 changed value/error](evidence/09-number-input-annoying-03.png). |
| 10 corrected text, three-PNG alternative | [01 required error](evidence/10-text-input-working-01.png), [02 leading zeros](evidence/10-text-input-working-02.png), [03 after Arrow keys](evidence/10-text-input-working-03.png). |
| Button comparison | [13 hidden](evidence/13-button-hidden-version.png), [14 visible-disabled](evidence/14-button-disabled-version.png); earlier genuine stages, not current legal-view screenshots. |
| Attacks and bypass | [15 observed results](evidence/15-form-attack-results.txt), [16 actual command/response](evidence/16-direct-request-command-and-response.txt); agent-run synthetic evidence. |
| Rollback | [17 commit list and revert](evidence/17-commit-list-and-rollback.txt); actual terminal/history evidence. |

## Local review and verification

Use Node.js 24.x and npm 11.x from the repository root; see the [root setup instructions](../README.md) for fresh installation. The homepage/auth UI needs neither PostgreSQL nor database credentials.

Normal UI: run `ENABLE_PERSISTENCE_EXPERIMENT=false npm run dev -- --hostname 127.0.0.1` in WSL, then open `http://127.0.0.1:3000/auth?signup`.

For optional local draft/code previews and the isolated fixture, restart your own server with:

~~~bash
ENABLE_PERSISTENCE_EXPERIMENT=false \
ENABLE_AUTH_TERMS_PREVIEW=true \
ENABLE_CODE_INPUT_EXPERIMENT=true \
ENABLE_FORM_BYPASS_EXPERIMENT=true \
npm run dev -- --hostname 127.0.0.1
~~~

Use synthetic values only. Restart without those opt-in flags afterward. The fixture and unfinished verification preview remain unavailable in production even with flags enabled.

Database-free tests and build commands:

~~~bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \
  tests/auth-validation/*.test.mjs tests/auth-foundation/state.test.mjs \
  tests/email-verification/availability.test.mjs \
  tests/email-verification/validation.test.mjs tests/email-verification/components.test.mjs \
  tests/form-attack/inputs.test.mjs tests/form-attack/fixture.test.mjs
npm run test:assessment
npm run typecheck
npm run build
git diff --check
~~~

Typecheck/build generate Prisma Client offline through the existing lifecycle scripts. They do not require a database connection. After deleting route files, refresh generated Next.js declarations with `node node_modules/next/dist/bin/next typegen` if stale imports remain.

Against the **already-running opt-in development server above**, run the HTTP/RSC suite in another WSL terminal:

~~~bash
AUTH_TEST_BASE_URL=http://127.0.0.1:3000 \
AUTH_TEST_DRAFT_PREVIEW=true AUTH_TEST_VERIFICATION_PREVIEW=true \
FORM_BYPASS_TEST_BASE_URL=http://127.0.0.1:3000 FORM_BYPASS_EXPECT_ENABLED=true \
node --test tests/auth-foundation/routes.test.mjs \
  tests/email-verification/routes.test.mjs tests/form-attack/routes.test.mjs
~~~

For a production or default-off server, use false expectation flags matching that server. Browser test files require a separately configured local Chrome debugger; they are not included in the database-free unit command. Exact curl reproduction is in the security investigation.

## What remains incomplete

- No real registration, account/password persistence, SMTP delivery, email verification, recovery or authentication sessions. Task Two's isolated enquiry persistence is separate; it is not an authentication backend.
- Actual approved/versioned Terms acceptance and its server recording are unimplemented. Draft review is not a substitute.
- Step 6 lacks exact comparative Narrator transcripts and four independently confirmed-and-fixed accessibility issues. The audit preserves successful observations without inventing defects. Optional 11/12 MP3s and the optional 18 walkthrough are not present or required to replace those missing mandatory observations.
- Real-device numeric keyboard, OTP autofill, comprehensive contrast/zoom testing and full backend security are not established by the scoped existing checks.

The isolated bypass fixture remains temporary and needs separately approved cleanup after its evidence purpose. The numeric comparison is already cleaned up, and the Git rollback is complete. Older “pending” statements in earlier records must be read in that chronology.

Assumptions: none.
