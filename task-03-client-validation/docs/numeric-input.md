# Task Three, Step 4: numeric-looking input represented as text

Status: the owner completed the native-number and corrected-text comparison. All six genuine PNGs are present and inspected. The temporary standalone experiment has been removed; the reusable `/auth?verify` interface remains UI-only and restricted to explicitly enabled local development.

## Why StitchTrack needs this field

The authoritative [PRD, section 2](../../docs/PRD.md) requires six-digit email verification for registering tailors. Clients retain a separate invitation-based passwordless verification flow. I used that genuine product field instead of adding an unnecessary numeric-looking field to tailor Signup.

The [reusable code field](../../app/%28auth%29/_components/EmailCodeField.tsx) belongs to the auth interface. Reusing it later for a client does not grant an invitation, identify an authorized business relationship or merge the two access flows. Better Auth, email delivery and server verification remain later work.

## Genuine before-and-after evidence

The owner captured these originals in `task-03-client-validation/evidence/`. I checked all six files existed before cleanup, inspected their visible states and preserved their hashes. The captures crop the browser chrome, so they do not independently show an address bar, browser version or sequence of keypresses. I distinguish what the still images show from the owner's account of the interactions.

| Official assessment deliverable | Genuine PNG alternative | Visible result and observation |
| --- | --- | --- |
| Evidence 09: `09-number-input-annoying.mp4` | [09-number-input-annoying-01.png](../evidence/09-number-input-annoying-01.png) | Empty native number field. |
| Evidence 09 | [09-number-input-annoying-02.png](../evidence/09-number-input-annoying-02.png) | `004281` is visible with native spinner controls. Initial entry preserved the zeros in the owner's Chrome test. |
| Evidence 09 | [09-number-input-annoying-03.png](../evidence/09-number-input-annoying-03.png) | `4280` is visible with the six-digit format error. The owner reports native numeric adjustment changed `004281` to this value. |
| Evidence 10: `10-text-input-working.mp4` | [10-text-input-working-01.png](../evidence/10-text-input-working-01.png) | Empty text input with the required-field error, "Enter a six-digit code." |
| Evidence 10 | [10-text-input-working-02.png](../evidence/10-text-input-working-02.png) | `004281` is preserved with its leading zeros and no numeric spinner. |
| Evidence 10 | [10-text-input-working-03.png](../evidence/10-text-input-working-03.png) | `004281` remains unchanged; the caret is visible at the beginning. The owner reports Arrow Up/Down moved the caret to the beginning/end respectively without changing the value. |

Each group of three PNGs is the assessment's permitted alternative to its corresponding MP4. No video or additional screenshot was created. The zero-padded `-01/-02/-03` names above are the actual filenames; earlier proposed names were not substituted or used to rename the originals. The unrelated historical `09-signup-errors-cleared.png` is also preserved.

These are genuine owner observations, not simulated failures. The number input did not immediately discard zeros on entry: numerical adjustment caused the demonstrated change. That is ordinary quantity editing applied to the wrong field, rather than a claim that all browsers always strip leading zeros or that Chrome itself is defective.

The owner has confirmed the specific Stage B empty/error, leading-zero and Arrow-key results above. The owner has not supplied a new Narrator transcript, a real-device numeric-keyboard result, OTP-autofill confirmation or a new all-network audit for this step. I do not expand these observations into those claims.

## Why the corrected value stays a string

An email code is an identifier, not a quantity. Every character position matters: `"004281"` is a six-digit string; `"4281"` is not the same code. I deliberately depart from the classroom Number() example because `Number("004281")` would lose the zeros.

The final field uses:

```tsx
type="text"
inputMode="numeric"
pattern="[0-9]{6}"
autoComplete="one-time-code"
```

The [string checker](../../lib/auth/email-code.ts) requires exactly six characters, all ASCII digits `0-9`. It accepts `004281` and `000000` without changing them. It rejects empty, short/long, spaced, signed, decimal/exponent, non-ASCII and line-break input. No Number(), parseInt(), valueAsNumber, trimming, normalization, truncation or arbitrary maxlength is used. Malformed pasted content gets feedback instead of silent repair.

Text input removes numerical stepping semantics. The browser may move the caret for Arrow Up/Down, as the owner observed, but it does not increment or decrement the code. No custom Arrow-key suppression is needed.

`inputMode="numeric"` requests a suitable mobile keyboard; it does not validate input, constrain paste or enforce security. The pattern describes the expected format, and the local string checker supplies the form's feedback. The eventual backend and code generator must enforce compatible rules independently. See the [HTML standard's input guidance](https://html.spec.whatwg.org/dev/input.html#number-state-(type=number)) and [inputmode reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode).

## When a genuine number input is appropriate

A `type="number"` field is appropriate for mathematical quantities, such as an item count, when incrementing, decrementing and numeric range constraints help the user. It is inappropriate for an identifier whose exact character positions and leading zeros must be preserved.

## Feedback, accessibility and submission safety

[EmailVerificationForm](../../app/%28auth%29/_components/EmailVerificationForm.tsx) keeps the existing auth layout, Tailored Wine semantic tokens, DM Sans, labels, hidden fieldset legend, focus indicators and responsive styling. Errors appear on blur or attempted submission, carry caution icons and text, and use current aria-invalid/aria-describedby associations. Correcting the input clears stale errors; invalid submission focuses the field after error markup commits.

Native submission is canceled before reading the value. Controls stay disabled before hydration and when JavaScript is disabled. The value remains only in transient browser memory/DOM, not URLs, logs, localStorage, sessionStorage or server writes. Changing views or refreshing does not create an account or preserve the code in application storage.

A valid-format attempt displays only **"Email verification is not available yet."** No code has been issued, emailed, accepted or verified by this interface. Signup does not pretend to succeed or automatically enter this view. There are no authentication sessions, database records, resend timers or real verification operations.

## Availability after cleanup

The unchanged availability policy now lives in [lib/auth/verification-preview.ts](../../lib/auth/verification-preview.ts), rather than the retired assessment module. Both the narrowly scoped [auth proxy](../../proxy.ts) and [server page](../../app/%28auth%29/auth/page.tsx) use it. The proxy rejects before streaming, and the page rechecks defensively.

The historical environment flag `ENABLE_CODE_INPUT_EXPERIMENT` is retained to avoid silently changing local setup. It now enables only the unfinished auth verification preview; it cannot restore the deleted comparison page. Availability requires all of:

- `NODE_ENV=development`.
- `ENABLE_CODE_INPUT_EXPERIMENT=true` exactly.
- A canonical approved loopback Host: `localhost`, `127.0.0.1` or `[::1]`, optionally with a port.

Flag-off development, unapproved Hosts and production (even with the flag enabled) return real HTTP 404 for document and RSC requests. `/auth?verify` remains an unauthenticated UI preview, not proof of identity or permission. The strict key-only URL rules and existing Signup, Login, Reset, Terms and Privacy behaviour are unchanged. Bind development to loopback; a Host check is not a substitute for authentication or proof of a remote peer's identity.

To open the retained interface in WSL:

```bash
cd /home/bmalik/stitchtrack
source ~/.nvm/nvm.sh
nvm use 24.22.1
ENABLE_CODE_INPUT_EXPERIMENT=true npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/auth?verify`. Restart an existing process yourself with the flag if necessary; a new shell variable cannot change a running server. No database credentials are needed.

## What I removed and retained

The original isolated comparison was built first. I then introduced the genuine auth view in Stage A, paused for native-number evidence, implemented Stage B after owner approval, and waited for the owner's final text-field testing before cleanup. That sequence is preserved by the six PNGs and this record; it does not imply that the Task Two scaffold contained email verification.

Removed obsolete files:

- `app/assessment/code-input/page.tsx`
- `app/assessment/code-input/CodeInputDemo.tsx`
- `app/assessment/code-input/code-input.module.css`
- `lib/assessment/code-input.ts`
- `tests/code-input/code-input.test.mjs`
- `tests/code-input/routes.test.mjs`
- `tests/code-input/browser.test.mjs`

The empty comparison page/test directories were removed. `/assessment/code-input` is now a standard nonexistent route returning 404, including when the auth preview flag is on.

The actual code field, form and string validator were retained unchanged during cleanup. Guard coverage moved into [availability tests](../../tests/email-verification/availability.test.mjs); format coverage remains in [validation tests](../../tests/email-verification/validation.test.mjs). [Component tests](../../tests/email-verification/components.test.mjs), [HTTP/RSC tests](../../tests/email-verification/routes.test.mjs) and [browser tests](../../tests/email-verification/browser.test.mjs) remain. The HTTP suite now explicitly checks the retired URL.

## Cleanup verification

| Check | Actual result |
| --- | --- |
| Remaining auth/verification/unit/component/query-policy tests | 77 passed. Obsolete comparison tests were deleted; two availability tests now cover the auth-owned guard. |
| Existing mocked assessment regressions | 21 passed; no database operations. |
| Production HTTP/RSC checks, flag enabled | 58 passed: 53 existing auth regressions plus five verification/retirement checks. |
| Enabled-development HTTP/RSC checks | The same 58 checks passed. |
| Flag-off development guard/retirement checks | All five passed in a completed controlled run. |
| Real Chrome browser regressions | 14 Node tests passed, covering six verification cases, six existing auth/document cases and their two parent tests. |
| Route type generation, typecheck and production build | Passed after refreshing generated Next.js route types. |
| Documentation links, evidence hashes and whitespace | 72 local links and nine anchors passed. All 27 Task Three evidence files, including the six required PNGs, remain byte-for-byte unchanged. Editable-file whitespace passed; full git diff --check reports only the pre-existing read-only PRD findings at lines 39-50. |

Browser automation verified string preservation, both Arrow keys, required/malformed/non-ASCII errors, correction, accessible descriptions, keyboard focus, refresh/history, three viewport widths and JavaScript-disabled safety. Existing Signup/document/checkbox/password-toggle/Login/Reset checks passed. Scoped checks saw no application writes, code-bearing request URLs or changes to tested cookies/browser storage. These are automated results, not additional owner tests, Narrator speech, autofill or real mobile-keyboard verification.

Controlled development used a temporary source copy with no environment files or assessment evidence, sharing installed dependencies and using webpack development mode. Production used the normal Turbopack build. The owner's existing server was not restarted or reconfigured. No evidence media or terminal evidence files were generated.

Initial typecheck encountered a generated validator still importing the deleted page. Running the installed Next.js typegen command refreshed those generated types; typecheck and build then passed. An initial flag-off HTTP run was interrupted by a premature test-server restart; it was rerun to completion and passed all five checks. These were verification/setup issues, not changes to authentication behaviour.

Reproducible database-free checks:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/email-verification/availability.test.mjs tests/email-verification/validation.test.mjs tests/email-verification/components.test.mjs tests/auth-validation/*.test.mjs tests/auth-foundation/state.test.mjs
npm run test:assessment
# Refresh generated route declarations after deleting a route:
node node_modules/next/dist/bin/next typegen
npm run typecheck
npm run build
git diff --check
# Against an explicitly enabled, already-running local preview:
AUTH_TEST_BASE_URL=http://127.0.0.1:3000 AUTH_TEST_VERIFICATION_PREVIEW=true node --test tests/email-verification/routes.test.mjs
```

For flag-off development or production, omit `AUTH_TEST_VERIFICATION_PREVIEW` or set it to false. Existing auth route regressions use `AUTH_TEST_BASE_URL` and `AUTH_TEST_DRAFT_PREVIEW` to match the test server's legal-preview configuration. Browser tests require a separately started loopback Chrome debugger; they do not capture assessment media.

The pre-existing owner-controlled PRD addition at lines 39-50 has CRLF/trailing-whitespace findings in full git diff --check. It remains authoritative and byte-for-byte unchanged. New/edited-file whitespace is checked separately so that historical issue is not confused with this cleanup.

Step 4's numeric-versus-text evidence is complete. Actual account creation, approved-Terms recording, Better Auth, SMTP, server verification/expiry/attempt/rate limits, sessions and client invitations remain Task Four work after the required Task Three security evidence. No database operations or Git mutations occurred.

Assumptions: none.
