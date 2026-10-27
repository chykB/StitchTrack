# Task Three, Step 3: client-side validation and password experience

## Scope and genuine baseline

The starting revision for Step Three was `003d8a1` on `feat/task-03-auth-foundation`. I reviewed the authoritative, read-only [PRD](../../docs/PRD.md), [field justification](field-justification.md), [routing record](spa-rationale.md) and existing components before implementation. The original submit handler only prevented submission and displayed the truthful unavailable message; it had no field validators or error associations. Useful labels, focus CSS, the hidden signup legend and hydration guard were already present. These were source observations, not a screen-reader or browser test.

The current policy below supersedes earlier password-policy iterations. Original screenshots and evidence remain unchanged. These forms are still UI-only: no account creation, login session, authentication request, email delivery or persistent credential storage is implemented. Clients retain the PRD's separate passwordless invitation flow.

## Fields and final rules

Signup has Email and Password; Login has Email and Password; Reset has Email only. The eye buttons are controls, not new collected fields. No identity/profile fields or public legal pages were added. A later, opt-in local assessment preview adds one Signup-only draft-acknowledgement checkbox, as described below; it is not approved legal acceptance.

| Exact rule | Why / what goes wrong without it | Legitimate users affected and trade-off |
| --- | --- | --- |
| Email is required in Signup, Login and Reset; blank or whitespace-only input is invalid. | Future account/recovery requests need an identifier. | Phone-only tailor access is not supported by the PRD; no new registration channel is introduced. |
| Email uses a basic public-address shape check on a surrounding-whitespace-trimmed copy, without rewriting the entered value. | Catch ordinary missing-address/domain mistakes. | Local-domain addresses and some quoted local parts can be rejected; some unusable addresses can pass. Plus addressing, subdomains, apostrophes and Unicode are supported by this coarse check. No DNS, ownership or account-existence check occurs. Provider/internationalized-address compatibility needs later verification. |
| Signup and Login passwords must be nonempty. Signup also rejects all-whitespace values using Unicode White_Space plus ECMAScript whitespace. | A blank or entirely whitespace signup credential is not meaningful under the owner-approved policy. | Someone deliberately choosing only whitespace cannot register that credential. Login keeps presence-only checking and does not retroactively enforce new signup rules. |
| Signup minimum is 12 Unicode code points, including ordinary spaces in that count. | Avoid very short new credentials while supporting memorable passphrases. | Shorter choices are rejected. Combining characters and multi-code-point emoji can count as several code points rather than one visible character. The milestone does not claim a complete password-security standard. |
| Ordinary spaces are allowed anywhere, including leading, trailing and internal spaces. Uppercase, lowercase, numbers, symbols and printable Unicode are permitted without a mandatory combination. | Support passphrases and password-manager choices without arbitrary complexity rules. | Accidental edge spaces can cause later login mistakes. An otherwise valid signup password with an ASCII edge space gets a subtle note; it remains valid and unchanged. |
| Signup rejects Unicode control characters (Cc) and line/paragraph separators (Zl/Zp) if encountered, including tabs and newlines. | Do not mistake pasted control characters for ordinary spaces. | Credentials intentionally containing those characters are rejected. Printable Unicode is not rejected merely for being non-ASCII. Native browser paste/sanitization behaviour still needs actual browser testing; the app does not block paste wholesale. |
| No signup maximum is imposed in current client validation. | Do not truncate or arbitrarily reject long credentials. | Very large inputs and backend encoding/hash/request bounds need a separate design review before authentication. No server resource protection is claimed here. |
| Never silently trim, strip, truncate, normalize or case-change a password. | The future verifier must agree on the exact credential. | No user is rejected by preservation itself; the explicit empty/control/minimum rules still apply. Future server Unicode handling must be compatible and explicitly reviewed. |

The [pure rules and event state](../../lib/auth/validation.ts) are shared by the form. Client validation is feedback, not a security boundary. The future server must enforce an approved, compatible policy and safe processing bounds independently.

## NIST reference and the retained milestone minimum

I consulted [NIST SP 800-63B-4, Password Verifiers, section 3.1.1.2](https://pages.nist.gov/800-63-4/sp800-63b.html) on 26 October 2026. It specifies a minimum of **15 characters for single-factor passwords** and supports spaces, Unicode code-point counting, password managers/paste and a display-password option.

The owner explicitly retains **12 code points for this assessment milestone**. This is a documented departure from the single-factor minimum, not a claim of NIST compliance. Raising it requires separate approval. Before real authentication, review the minimum, processing bounds, Unicode/normalization handling and authoritative server validation together; this UI does not normalize passwords.

## Feedback timing and presentation

- No errors, password guidance or edge-space note appear initially.
- Leaving an empty field shows its required error without marking every untouched field.
- Signup email checks begin with input. Login/Reset format checks wait for submission; a displayed error clears on correction, and a fresh format warning waits for another submit.
- Signup password feedback starts after typing. The exact guidance is: **"Use at least 12 characters. Letters, numbers, symbols and spaces are allowed."**
- Guidance is present only while that started password is invalid. For the minimum-length case, it is the single inline error, not a duplicated hint and error.
- Control-character errors say: "Remove tabs, line breaks or other control characters from your password." All-whitespace errors say: "Choose a password that is not only whitespace." Those specific errors can accompany the required full guidance.
- Valid correction immediately removes guidance, invalid state and stale error references. Invalidating the value again restores feedback. Clearing a started field shows "Enter your password." and retains the guidance; an untouched blank field has no premature guidance.
- An otherwise valid signup password beginning/ending with an ordinary space shows: "Your password starts or ends with a space. It will be kept exactly as entered." This is an associated, non-blocking hint, not a validation error, and is not the invalid-password guidance.
- Invalid submission focuses the first invalid input and updates one polite summary. A valid local submission displays only the existing action-specific unavailable message. Editing clears stale unavailable feedback.

Errors keep their caution icon, plain text, semantic error colour and `aria-invalid`/`aria-describedby` association. Identical hint/error text is shown and described once. Field errors have no individual live regions; the form retains one polite, atomic status region. Actual spoken announcements remain untested.

## Show/Hide Password

The [shared field](../../app/%28auth%29/_components/FormField.tsx) renders an eye button inside the right edge of Signup and Login password inputs. [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) holds visibility separately from validation and credential values.

Passwords start masked. The native `type="button"` changes its accessible name between "Show password" and "Hide password", controls the input by ID and changes only its displayed input type. It does not submit, edit the value or trigger input-change handlers. The SVG is hidden from assistive technology. Mode changes remount the form and reset masking.

Existing [styles](../../app/%28auth%29/auth.module.css) provide a 2.75rem target (44px at the default 16px root), pointer/hover feedback and a visible focus outline. Input end padding is 3.75rem to reserve text space. Native buttons provide keyboard activation semantics. The owner-reported Login keyboard and responsive checks are recorded below; no agent browser measurement or unreported Signup keyboard result is claimed.

The existing autocomplete values (`new-password` / `current-password`), labels, input names and error associations remain intact when shown. No paste or password-manager blocking handlers were added. Reset contains only email and has no eye button.

## Why visibility instead of a confirmation field

I chose optional password visibility because StitchTrack's mobile-friendly signup should avoid asking for the same credential twice without a demonstrated product need. A tailor can inspect the exact password, including spaces, while keeping it masked by default. One credential field also avoids a second entry for password-manager users. This is an engineering rationale, not a measured claim that the toggle outperforms confirmation for all users.

The cost is that revealing a password exposes it to someone looking at the screen; revealing is an explicit local choice. The toggle does not prove email ownership, password strength or successful authentication.

Confirmation could be preferable in a justified one-time credential-creation flow where an unnoticed typo has a high recovery cost and user research shows that re-entry helps, particularly when users cannot safely reveal their screen. It would add input and another possible mismatch; pasting the same mistake twice is still possible. I have not implemented or experimentally compared a confirmation field here, and it would require a separate product/accessibility decision. The PRD does not require one.

## Safety and tests

All inputs, submit buttons and eye buttons remain inside the disabled fieldset until hydration. The hidden signup legend contains no controls. With scripts never executing, those controls remain disabled. The submit handler cancels native submission before reading live values and returns early until ready. The eye's local handler also checks readiness.

Values live only in transient form/React memory. Nothing sends them, logs them, stores them persistently, creates sessions or exposes them in URLs. Deliberate local revealing through the eye is the only added display behaviour. Browser password-manager storage is controlled by the user/browser, not application persistence.

Database-free checks use the existing Node.js 24, React and TypeScript packages:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/auth-validation/*.test.mjs tests/auth-foundation/state.test.mjs
npm run test:assessment
npm run typecheck
npm run build
ENABLE_PERSISTENCE_EXPERIMENT=false npm run start -- --hostname 127.0.0.1 --port 3100
# Separate terminal while that server runs:
AUTH_TEST_BASE_URL=http://127.0.0.1:3100 node --test tests/auth-foundation/routes.test.mjs
git diff --check
```

[Rule tests](../../tests/auth-validation/validation.test.mjs) cover boundaries, Unicode, spaces, controls, exact preservation, guidance and the edge notice. [Component tests](../../tests/auth-validation/components.test.mjs) cover error associations, masking/names/input types, nonsubmit click contracts, value preservation and SSR disabled grouping. The [render helper](../../tests/auth-validation/rendering.mjs) uses installed dependencies only. [Route tests](../../tests/auth-foundation/routes.test.mjs) check actual HTTP/SSR output, query rules, masked initial inputs and disabled fieldsets containing both relevant buttons.

The earlier agent tests checked native button semantics, not real-browser keyboard events. The owner-reported Login keyboard result is recorded separately below. The click-contract tests render controlled states and invoke the component's callback, not a browser session. Tests of local submission trap requests/logging at that boundary; they do not replace a real network trace.

## Owner-reported Chrome verification

The following observations were reported by the project owner for the final Step Three UI in this review. I am documenting that report, not claiming I performed the tests. No Chrome version or test date was supplied, and no new screenshot, recording, terminal evidence or screen-reader transcript was created by the agent.

| Owner-reported check | Reported result and exact scope |
| --- | --- |
| Signup password masking and Show/Hide | Passed. |
| Login password masking and Show/Hide | Passed, including the instructed keyboard checks. This does not separately establish Signup keyboard testing. |
| Signup password rules and guidance | The 11/12-code-point boundaries, normal spaces, edge-space feedback, whitespace-only rejection, and guidance clearing/restoring passed. No additional input cases are inferred. |
| Valid Signup submission | Displayed "Account creation is not available yet." This is the truthful UI-only outcome, not account creation. |
| Captured Fetch/XHR panel during that submission | No authentication POST was shown in that filtered panel. This is not proof about every network request, another transport, cookies, session storage or successful server-side security. The final panel capture is not among the files currently in this repository. |
| Responsive layout | Passed at 375px, 768px and 1440px, including mobile validation-error layout. No agent measurements or unreported per-route results are asserted. |
| JavaScript disabled, then reload | Signup fields remained non-interactive. Do not broaden this to an observed check of every control on every route. |

Browser automation was not verified; its earlier sandbox-helper failures remain part of the record. Screen-reader output and password-manager/autofill behaviour remain unverified. Actual pasted control-character behaviour and any other checks not listed above are not inferred from these results. The existing automated tests and source checks have their own, narrower provenance.

## Existing evidence: content versus completion

I inspected all existing Task Three PNGs and text records. The following paths are relative to `task-03-client-validation/`. File presence is not evidence that every interaction or later milestone has passed.

| Existing evidence | Applicability and limits |
| --- | --- |
| `evidence/01-page-count-before.txt`, `evidence/02-page-count-after.txt` | Substantive inventories: total pages 5 to 3, auth pages 3 to 1. Counting rules and the foundation revision are recorded. They are historical inventories, not newly run commands. |
| `evidence/03-url-states.png`, plus the three `03-auth-*.png` originals | Address bars show the same /auth route with signup, login and reset key-only states. They satisfy the URL-state capture purpose despite later styling changes. Preserve them; there is no reason to recreate consolidation history for the password refinement. |
| `evidence/04-form-switch-logs.txt` | Genuine existing Node HTTP/RSC probes, explicitly not a browser switching transcript. It records no Set-Cookie headers for those requests, not a comprehensive browser/session audit. |
| `evidence/05-browser-navigation.png`, `evidence/05-browser-navigation-verification.txt` | Supplemental owner evidence supports same-document switching and Back/Forward. The text explicitly says authentication cookies were not manually checked. Do not relabel these as the final Signup Fetch/XHR submission capture. |
| `evidence/05-empty-field-error.png` | Exact official filename. Shows required Email/Password errors with caution icons. It is a cropped historical error-state capture; it cannot alone prove the blur sequence or final eye control. Its core required-error purpose remains applicable. |
| `evidence/06-length-rule-blocking (2).png` | Shows a genuine historical minimum-length error, but displays the old 12-to-128 guidance and lacks the eye. The required exact `evidence/06-length-rule-blocking.png` is missing. |
| `evidence/07-email-realtime-signup.png` | Exact official filename, showing an invalid focused Signup email and inline error. The email error remains relevant, although the password area shows older guidance. A still image does not independently prove keystroke timing. |
| `evidence/08-email-on-submit-login.png` | Exact official filename, showing Login email error plus submission feedback. Relevant to the unchanged submit-led email behaviour; it predates the eye. It is not a network trace. |
| `evidence/09-signup-errors-cleared.png` | Genuine historical cleared-error state, but older guidance remains visible. It does not prove current guidance removal and is not the required number-input demonstration. |
| `evidence/00-foundation-*` | Historical separate-page routes and inventory. Preserve the zero-to-three-to-one timeline; these are not final consolidated or final-policy screenshots. |

For the official length-rule slot, the owner should supply a genuine current capture as **`evidence/06-length-rule-blocking.png`**, preserving `06-length-rule-blocking (2).png`. This closes the filename gap and shows current minimum guidance/eye rather than presenting an obsolete maximum as current policy. No image was copied, renamed or generated in this audit.

A small optional final-policy supplement, such as `evidence/step-03-final-password-valid.png`, could show a valid synthetic passphrase, the eye control and removed invalid guidance (or the non-blocking edge-space note). This would help a reviewer distinguish the final UI from historical captures. It is not an additional official mandatory filename. The owner-reported checks above already document the observed behaviours; there is no requirement in the supplied list to repeat every test as a new screenshot, or to overwrite 05/07/08.

Actual terms acceptance, owner capture of the implemented Stage Two visible-disabled state and completion of the comparison, real screen-reader before/after observations and transcripts, direct HTTP bypass evidence and rollback remain pending. The owner has supplied the historical hidden-button screenshot as evidence/13-button-hidden-version.png. The disabled pre-hydration fieldset is not the assessment's terms-dependent disabled-button version. The authentication UI and existing GET/RSC logs are not proof of a direct-request attack against a real authentication endpoint. Optional audio files are not substitutes for genuine spoken observations, and no transcripts may be reconstructed from markup or imagined speech.

The number/text-input comparison also remains pending: Signup/Login/Reset currently have no justified numeric identity field. Do not invent a phone/member field merely for screenshots. Its assessment scope needs an explicitly approved, product-compatible approach before that experiment.

The v0.2 legal drafts remain unapproved and unchanged. Their wording about the original handler not reading values predates current local validation; current code does read entered values transiently for validation, without transmitting or persisting them. That protected draft wording needs a separately authorized correction before publication, not an edit in this audit.


## Previous automated verification record

In the earlier implementation session on 26 October 2026 (not rerun in this documentation audit): 38 validation/component/query-policy tests passed, 21 database-free assessment regression tests passed, and 38 HTTP route tests passed against the final production build. Typecheck and production build passed, including the existing offline client-generation hooks. The final toggle-contract tests include preservation of error associations while revealed. A search found no obsolete space-prohibition wording in current auth code, tests or Task Three documentation. git diff --check passed. No packages, database operations, staging, commits or pushes were performed.

Those automated results verify rules, callback contracts, native-button markup and HTTP/SSR behaviour. They do not establish browser keyboard, password-manager/autofill, responsive viewport, paste or spoken screen-reader results. The later owner-reported Chrome observations are recorded separately above, without widening their scope. This audit ran only documentation/link/whitespace and read-only file checks; it did not rerun application tests or create terminal test evidence.

## Later Stage One assessment-only acknowledgement

Historical record: the owner captured evidence 13 before authorising Stage Two. The hidden state and explanatory page copy below describe that earlier version; the final behaviour is recorded in the next section.

The [terms note](terms-note.md#stage-one-local-draft-acknowledgement-and-hidden-button-experiment) and [field audit](field-justification.md) describe the opt-in preview. Existing Email/Password rules above are unchanged. Only enabled local development Signup adds a required, initially unchecked acknowledgement of unapproved draft Terms. It is a transient demonstration, not contractual acceptance or privacy consent. Default-off Signup, Login and Reset retain their existing actions.

In that preview, Create account is hidden until all three conditions hold: valid email, valid signup password and checked acknowledgement. The cost is reduced discoverability and no focusable action while incomplete; this is the temporary assessment state, not the final accessible button design. A hint explains what remains to reveal the action. The local submit guard independently checks current input values and checkbox state; a stale checked state cannot permit an unchecked submission. Acknowledgement errors appear after blur or an attempted submission, have a caution icon and associated description, and clear on correction. The existing single polite summary remains; no additional live regions were added.

The checkbox is inside the disabled-before-hydration fieldset. The exact v0.2 draft source is read only after the development/flag/loopback gate passes, never for production, Login or Reset. A valid demonstration displays only "Account creation is not available yet." No requests, acceptance records, sessions or authentication backend are introduced. Future server-side legal-version enforcement is a separate implementation after review.

Stage One verification actually ran: 50 validation/component/query-policy tests, 21 database-free assessment regression tests, typecheck and production build passed. HTTP/RSC route tests passed 42/42 against production with the flag forced on and 42/42 against enabled local development. They verify default masking/inert server markup, unchanged draft source, production exclusion, strict queries, no new policy routes and unaffected homepage/assessment route boundaries. The initial non-loopback test used Fetch, which replaced the test Host header; it was corrected to explicit Node HTTP transport and then passed without changing the application guard.

These results do not extend the earlier owner-reported browser results to the new checkbox/disclosures. New browser keyboard, mobile layout, native submission behaviour, JavaScript-disabled and assistive-technology checks remain manual. At that handoff, evidence 13 and Stage Two were pending. The owner has since confirmed evidence 13; Stage Two is implemented below. No historical screenshot was generated or overwritten by the agent.

## Stage Two: visible Signup action with accessible guarded submission

Create account is always rendered without hidden or native disabled attributes. While the form is incomplete it uses aria-disabled=true; after hydration it remains in the normal keyboard tab order. The visual disabled state uses existing semantic colours, while the focus outline remains available. All required credentials, plus draft acknowledgement when that local-only control is present, must be valid before aria-disabled becomes false. Without the preview, Signup checks credentials only. Login and Reset retain their previous button behaviour and validation timing.

The native type=submit button uses ordinary mouse and Enter/Space semantics. The single onSubmit handler cancels native submission first and revalidates actual DOM values and checkbox state, independent of the displayed aria-disabled value. It blocks incomplete input, focuses the first invalid field and renders its associated caution/error text. A missing draft acknowledgement says "Review the draft Platform Terms before continuing." It is described by that current error only; the removed page notice has no stale ARIA references. When it is the only error, the existing polite summary gives that contextual feedback. Credential rules, typing/blur timing and password visibility remain unchanged.

The disabled-before-hydration fieldset still makes controls inert before hydration or when JavaScript never executes. A complete local submission only displays "Account creation is not available yet." No authentication endpoint, session, legal acceptance or persistence is implemented. The short label "I have reviewed the draft Platform Terms." is draft acknowledgement only; the unapproved policies and local-only gate are unchanged. Legal and assessment limitations remain in the internal [terms note](terms-note.md#stage-two-visible-focusable-guarded-button), not replacement warning paragraphs on Signup.

Actual checks passed: 58 component/validation/query tests, 21 database-free assessment regressions, typecheck, production build and 42 HTTP/RSC route tests each against production and enabled development. Tests verify the native markup and shared submit contract, first-invalid focus, acknowledgement correction, credential preservation and no fetch/log calls at that boundary. They do not simulate browser mouse, Enter/Space or spoken assistive-technology output. The owner must perform those checks, responsive and JavaScript-disabled checks, and capture evidence/14-button-disabled-version.png. The genuine hidden-button screenshot remains unchanged as evidence 13.

## Conditional draft views - current implementation

The owner approved replacing the disclosures with local conditional views inside /auth?signup. The sentence is now "I have reviewed the draft Terms and Privacy Policy." Terms and Privacy Policy are separate native nonsubmit buttons styled as links, outside the checkbox label. The label preserves the complete accessible name; neither document action changes its checked state.

The form remains mounted under a hidden ancestor while a document is displayed, preserving transient values, acknowledgement and validation state. Opening focuses the document heading; Back to Signup restores the original initiating action after the form is visible. The route and document remain unchanged. This adds no persistence or contractual acceptance.

The semantic renderer reads the unchanged historical v0.2 sources. Their superseded personal-operator premise and stale historical clauses are preserved rather than silently rewritten; the company-based v1.0 candidates are not substituted or approved. Public citation links retain their original destinations and open in a new tab. Relative references to the counterpart draft change the local view; references to unpublished PRD/review notes remain plain labels instead of broken or newly exposed public pages.

Passed: 66 component/validation/query tests, 21 assessment regressions, typecheck, production build, 42 production and 42 local-development route checks, plus six real Chrome cases (seven Node tests including the parent). State/focus restoration, keyboard/mouse independence, semantic structures, no navigation reload, three widths and script-disabled safety were checked. The [accessibility audit](accessibility-audit.md#implemented-conditional-signup-document-views---27-october-2026) distinguishes this automated improvement from still-missing genuine Narrator after observations and the four-defect requirement.

Screenshots 13 and 14 are preserved as historical evidence of the earlier hidden/visible-button stages; they are not screenshots of the new document views. No screenshot or spoken evidence was created. Existing draft-review and actual approved-Terms acceptance remain distinct.

## Step 4 Stage A: email-code validation is separate from credential modes

The owner approved a new `/auth?verify` screen after adding Tailor Email Verification to the PRD. `AuthMode` remains Signup/Login/Reset; `AuthState` additionally includes verify. The existing password and email policies above are unchanged. [The shared code checker](../../lib/auth/email-code.ts) operates on a string and is also re-exported for the retained standalone comparison.

| Exact rule | Why / what goes wrong without it | Legitimate-user cost and trade-off |
| --- | --- | --- |
| Code is required, with an error after blur or attempted submission rather than initial load. | Avoid a meaningless empty verification attempt while preserving a quiet initial form. | A person without an issued code cannot complete a real verification; no code is issued in this UI slice. |
| Exactly six ASCII digits `0-9`; empty, short/long, spaces, signs, decimals, exponent syntax and other alphabets fail format checking. | Match the six-position code representation and avoid treating numeric syntax as a valid identifier. | People pasting separators or localized digit glyphs are rejected instead of silently converted. The eventual code generator, localization and authoritative backend validation must agree; no complete server policy is claimed. |
| Preserve the string exactly, including `004281` and `000000`; no Number(), parseInt(), valueAsNumber, trimming, truncation or normalization. | Coercion would turn a six-digit code into a different value. | A formatted or malformed paste gets explanatory feedback rather than automatic repair. |
| Format is not verification. A valid-format local submission says only "Email verification is not available yet." | Prevent a false claim of email ownership or an account/session transition without a backend. | The feature remains incomplete until the separately approved Task Four integration. |

[The reusable field](../../app/%28auth%29/_components/EmailCodeField.tsx) is an uncontrolled native `type="number"` in Stage A only, behind an explicit development/loopback guard. No browser stepping or spinner behaviour is altered. This temporary input type can itself change the visible identifier during native stepping; it must not be represented as the final implementation. Stage B text input and numeric input mode are not yet implemented on the product view.

Errors have caution icons, words, aria-invalid and current description references. Blur exposes errors; after an interaction, editing updates/clears them. Invalid submission focuses after error markup commits. The hidden fieldset legend, visible focus, polite unavailable feedback and disabled-before-hydration/JavaScript-disabled safeguards remain. No code is transmitted, logged or persisted. No client-code lookup, expiry, resend, attempt limits or account existence is simulated.

Verification: 81 combined unit/component/query-policy checks, 21 mocked assessment regressions, typecheck and build passed. The 60-check HTTP matrix passed in flag-off development, enabled development and flag-enabled production. Fourteen automated Chrome tests (including two parent tests) passed across verification and existing auth/document behaviour. These are automated checks, not owner-captured evidence or Narrator speech. See [numeric-input.md](numeric-input.md#cleanup-verification) for the exact scope and initial issues corrected. Owner evidence 09 is pending; all historical screenshots remain unchanged.
