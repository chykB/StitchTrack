# Task Three, Step 2: field justification

Status: original field audit with the later draft acknowledgement and completed Stage Two visible-button implementation. No legal acceptance or authentication backend is implemented.
Starting revision: 2cf53c61e640986d102a22910817078dfc1d1ab2 on feat/task-03-auth-foundation.

## What the current forms actually do

I audited [AuthScreen](../../app/%28auth%29/auth/AuthScreen.tsx), [FormField](../../app/%28auth%29/_components/FormField.tsx) and [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) against the authoritative [PRD](../../docs/PRD.md), particularly section 2.

The default forms have five credential input instances across three states of one page. The opt-in local Signup assessment preview adds one draft-acknowledgement checkbox; Login and Reset are unchanged. The forms remain UI-only: submission is prevented locally and displays an unavailable-action message. They do not create accounts, send email, start sessions, save acceptance or transmit credentials. The field purposes below describe future approved authentication work, not completed functionality.

## Every field and its justification

| Form and field | Why StitchTrack needs it | What the business will do with the value | Consequence if incorrect |
| --- | --- | --- | --- |
| Signup: email address | Identify the tailor's account using the PRD's email/password model. | Use it as an account identifier and recovery contact when authentication is implemented. It must not automatically link client records or confer business access. | A typo may make recovery messages unreachable or direct them to the wrong mailbox. No recovery email is sent by today's UI. |
| Signup: password | Establish the tailor's credential. | Let the future authentication system verify a protected credential representation, without saving or logging plaintext. The business does not need to read the password. | An unintended password can prevent later login; an insecure password can increase compromise risk. Current client rules are documented in the [validation inventory](validation-rules.md); they do not establish server authentication. |
| Login: email address | Identify the existing account the tailor intends to access. | Supply the identifier to the future authentication service before server-side access checks. | The intended account may not match. Future error handling must avoid disclosing another person's account details. |
| Login: password | Demonstrate control of that account. | Verify the credential through the approved authentication system, rather than use it as business-profile information. | Login should fail. The current UI only explains that login is unavailable. |
| Password-reset request: email address | Identify the account for a recovery request. | Initiate the future account-recovery process. This screen does not need a new password or an email verification code yet. | Recovery will not reach the intended account holder. Future responses must avoid account enumeration; today's UI never claims an email was sent. |
| Assessment preview Signup: draft acknowledgement | Demonstrate the assessment control with readable unapproved text, without misrepresenting legal acceptance. | Check a transient local boolean as one condition for the visible Signup action's aria-disabled state. No business record, consent, legal agreement or account is created. | Unchecked acknowledgement leaves the action visible and focusable with aria-disabled=true; a local submission attempt is blocked with an associated error. Checking it does not make the drafts binding. |
| Planned signup: platform-terms acceptance | Meet the assessment's registration acceptance requirement after actual legal content is reviewed. | Eventually gate registration on affirmative acceptance of a specific approved terms version, with acceptance recording designed in the later authentication/persistence milestone. | Unchecked or ambiguous acceptance must not be treated as agreement. Actual approved-terms acceptance and server enforcement remain unimplemented; the preview checkbox is a separate assessment demonstration. |

All five credential inputs are justified, so I removed no fields. Default counts remain Signup 2, Login 2 and Reset 1. The opt-in local preview has 3/2/1 inputs, including its initially unchecked native acknowledgement after Password. Approved legal acceptance remains future work after review; it is not fulfilled by renaming the demonstration.

## Why I did not collect more

Full name, business name, phone number, member number and password confirmation are absent and remain absent. The PRD's future customer-record fields are not requirements for tailor registration. Business-profile setup belongs to a separately justified workflow. Password confirmation would duplicate input at this stage; password behaviour and validation have separate assessment milestones.

Clients keep invitation-based, passwordless email verification. These tailor forms do not introduce client password registration. Platform acceptance must not be confused with a client's approval of an individual clothes-item agreement.

## Original information-design cleanup (historical record)

I removed the signup subtitle, "A clearer place for your tailoring business." It supplied neither an instruction nor a requirement beyond "Create your tailor account." Its paragraph was removed. Login's audience hint was retained in that original cleanup and removed in a later focused refinement; Reset's email instruction remains.

I preserved a 24px title-to-form gap using the existing spacing convention when no subtitle is present. Labels, fieldset legend, focus indicators, unavailable feedback, working links and ST branding remain.

The actual cosmetic decoration removed was the submit button's Soft box shadow in [auth.module.css](../../app/%28auth%29/auth.module.css), selector .submit. Its semantic fill, border, pointer, hover feedback and focus outline already identify the action. The panel's Soft shadow remains part of the existing visual grouping. This was removal of a decorative CSS effect, not a claim that I found a useless DOM element. I did not remove the useful brand badge or fabricate decoration merely to remove it.

## Terms and next boundary

The [terms note](terms-note.md) records sources and unresolved decisions for the [platform terms draft](platform-terms-draft.md) and [privacy draft](privacy-policy-draft.md). They are review artifacts, not public policies. There is no /terms or /privacy route. The opt-in local preview presents the exact unapproved v0.2 source in native disclosures; its checkbox acknowledges draft review, not contractual acceptance. Its current label is "I have reviewed the draft Platform Terms."; the assessment limitations are documented internally rather than shown as a page notice. The [terms note](terms-note.md#stage-one-local-draft-acknowledgement-and-hidden-button-experiment) records activation, limitations and pending owner evidence.

The historical hidden action required valid Email, valid Password and the checked acknowledgement together. The owner captured evidence 13 before Stage Two. The current action stays visible; invalid credentials or unchecked acknowledgement set aria-disabled=true. Native submit handling guards activation, displays associated errors and focuses the first invalid control. It becomes aria-disabled=false when complete, while valid submission still reports that account creation is unavailable. Login/Reset rules and the native hydration safeguard are unchanged.

After owner/legal review, a separately authorized change can present approved text and a signup-only, initially unchecked native checkbox. Contract acceptance must be distinguished from a privacy notice and any purpose-specific consent. Actual enforcement and durable acceptance records still require the relevant validation/authentication approvals.

## Original verification and evidence scope (historical record)

The strict /auth?signup, /auth?login and /auth?reset policy, default /auth login, hydration guard and local-only unavailable response are unchanged. Verification on 26 October 2026 passed: 2 query-policy tests, 38 [HTTP route tests](../../tests/auth-foundation/routes.test.mjs), 21 database-free assessment regression tests, TypeScript checking and the production build. The route tests used a local production server with the assessment experiment disabled. Prisma Client generation ran without connecting to a database.

Additional rendered-HTML checks confirmed 2/2/1 inputs, disabled server-rendered fieldsets, polite status regions, no Set-Cookie response, no terms checkbox, the removed signup phrase, and retained Login/Reset hints. /terms and /privacy returned HTTP 404. CSS source checks confirmed the retained panel shadow and signup spacing. These HTTP/source checks are not a fresh browser visual, keyboard or screen-reader test; those remain a manual follow-up for this cleanup. All 20 local links in the four new documents resolved.

Existing Step One evidence is preserved. The owner's [navigation record](../evidence/05-browser-navigation-verification.txt) reports same-document switching and Back/Forward for Step One; it explicitly does not claim a cookie check. It is not a fresh Step Two visual test. Any later before/after capture must show the actual running cleanup, and must not pretend that terms acceptance or account creation already works.

## Stage One verification and remaining checks

The added preview passed 50 validation/component/query-policy tests, 21 database-free assessment regressions, 42 production HTTP/RSC checks and 42 enabled-development HTTP/RSC checks. Typecheck and production build passed. Tests cover the unchecked default, all-three completion requirement, stale acknowledgement prevention, associated error clearing, default-off/production isolation and unchanged Login/Reset rendering. No database was contacted.

These checks do not establish new browser keyboard, responsive or screen-reader results. At that Stage One handoff, the owner still needed to verify the running preview and capture evidence/13-button-hidden-version.png; the owner has now supplied that capture. No evidence was created, overwritten or relabelled in this implementation.

## Stage Two verification and remaining evidence

Create account remains visible and keyboard-focusable after hydration. It uses the existing Label Large typography and semantic disabled colours, with preserved focus indicators. Field and acknowledgement errors appear through the shared submission guard, not through another permanent warning. Native checkbox/disclosure labels are minimal; no development or assessment explanation replaces the removed paragraphs. The hidden-versus-visible comparison and legal limitations are recorded in the [terms note](terms-note.md#stage-two-visible-focusable-guarded-button).

Passed: 58 component/validation/query tests, 21 assessment regression tests, TypeScript checking, production build and 42 HTTP/RSC route tests each in production and enabled local development. These do not establish new browser keyboard, viewport or screen-reader results. The owner must verify the final state and capture evidence/14-button-disabled-version.png. Evidence 13 and all other historical screenshots are preserved.

## Conditional draft views - current implementation

The owner approved replacing the disclosures with local conditional views inside /auth?signup. The sentence is now "I have reviewed the draft Terms and Privacy Policy." Terms and Privacy Policy are separate native nonsubmit buttons styled as links, outside the checkbox label. The label preserves the complete accessible name; neither document action changes its checked state.

The form remains mounted under a hidden ancestor while a document is displayed, preserving transient values, acknowledgement and validation state. Opening focuses the document heading; Back to Signup restores the original initiating action after the form is visible. The route and document remain unchanged. This adds no persistence or contractual acceptance.

The semantic renderer reads the unchanged historical v0.2 sources. Their superseded personal-operator premise and stale historical clauses are preserved rather than silently rewritten; the company-based v1.0 candidates are not substituted or approved. Public citation links retain their original destinations and open in a new tab. Relative references to the counterpart draft change the local view; references to unpublished PRD/review notes remain plain labels instead of broken or newly exposed public pages.

Passed: 66 component/validation/query tests, 21 assessment regressions, typecheck, production build, 42 production and 42 local-development route checks, plus six real Chrome cases (seven Node tests including the parent). State/focus restoration, keyboard/mouse independence, semantic structures, no navigation reload, three widths and script-disabled safety were checked. The [accessibility audit](accessibility-audit.md#implemented-conditional-signup-document-views---27-october-2026) distinguishes this automated improvement from still-missing genuine Narrator after observations and the four-defect requirement.

Screenshots 13 and 14 are preserved as historical evidence of the earlier hidden/visible-button stages; they are not screenshots of the new document views. No screenshot or spoken evidence was created. Existing draft-review and actual approved-Terms acceptance remain distinct.

## Stage A: separate tailor email-verification field

The owner-added Tailor Email Verification requirement in [PRD section 2](../../docs/PRD.md) now justifies one additional field on `/auth?verify`, not an extra Signup field. The three credential forms keep their existing five input instances; this fourth screen adds one guarded code input. The optional Signup draft acknowledgement remains separate.

| Field | Why it is needed | What the business will do with its value | Consequence if incorrect |
| --- | --- | --- | --- |
| Tailor email-verification code | Eventually prove control of the registering tailor's email through the PRD's six-digit verification process. | The future server must check the exact code string against an issued, unexpired challenge with attempt/rate limits before allowing sign-in. Today's UI only checks format locally. | Missing/malformed input gets an associated required/format error. A correctly shaped but incorrect code must later fail server verification; today's UI cannot determine correctness and reports only that email verification is unavailable. |

[EmailCodeField](../../app/%28auth%29/_components/EmailCodeField.tsx) is reusable for a future authorized code-entry screen. Reusing a field does not merge the client invitation flow with tailor registration or grant access to a business. No new email, password, identity or business-profile input is added here.

For Stage A only, the native number field is protected by the explicit local-development guard. Its value is still read as a string; native stepping remains untouched for genuine owner evidence. The final text/numeric-keyboard correction is deferred until evidence 09 is captured and Stage B is approved. [The staged numeric-input record](numeric-input.md#genuine-before-and-after-evidence) explains the limits, verified behaviour and owner capture sequence. No account, email, code record, acceptance record or session is created.
