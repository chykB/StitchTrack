# Task Three, Step 2: field justification

Status: implemented field audit and limited UI cleanup, 26 October 2026.
Starting revision: 2cf53c61e640986d102a22910817078dfc1d1ab2 on feat/task-03-auth-foundation.

## What the current forms actually do

I audited [AuthScreen](../../app/%28auth%29/auth/AuthScreen.tsx), [FormField](../../app/%28auth%29/_components/FormField.tsx) and [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) against the authoritative [PRD](../../docs/PRD.md), particularly section 2.

There are five existing input instances across three states of one page. The forms remain UI-only: submission is prevented locally and displays an unavailable-action message. They do not create accounts, send email, start sessions, save acceptance or transmit credentials. The field purposes below describe future approved authentication work, not completed functionality.

## Every field and its justification

| Form and field | Why StitchTrack needs it | What the business will do with the value | Consequence if incorrect |
| --- | --- | --- | --- |
| Signup: email address | Identify the tailor's account using the PRD's email/password model. | Use it as an account identifier and recovery contact when authentication is implemented. It must not automatically link client records or confer business access. | A typo may make recovery messages unreachable or direct them to the wrong mailbox. No recovery email is sent by today's UI. |
| Signup: password | Establish the tailor's credential. | Let the future authentication system verify a protected credential representation, without saving or logging plaintext. The business does not need to read the password. | An unintended password can prevent later login; an insecure password can increase compromise risk. Password rules are a later milestone, not invented here. |
| Login: email address | Identify the existing account the tailor intends to access. | Supply the identifier to the future authentication service before server-side access checks. | The intended account may not match. Future error handling must avoid disclosing another person's account details. |
| Login: password | Demonstrate control of that account. | Verify the credential through the approved authentication system, rather than use it as business-profile information. | Login should fail. The current UI only explains that login is unavailable. |
| Password-reset request: email address | Identify the account for a recovery request. | Initiate the future account-recovery process. This screen does not need a new password or an email verification code yet. | Recovery will not reach the intended account holder. Future responses must avoid account enumeration; today's UI never claims an email was sent. |
| Planned signup: platform-terms acceptance | Meet the assessment's registration acceptance requirement after actual legal content is reviewed. | Eventually gate registration on affirmative acceptance of a specific approved terms version, with acceptance recording designed in the later authentication/persistence milestone. | Unchecked or ambiguous acceptance must not be treated as agreement. No checkbox or enforcement is implemented in this step. |

All five existing inputs are justified, so I removed no fields. The only additional approved registration control is the future terms checkbox, after review. Current counts stay Signup 2, Login 2 and Reset 1; planned Signup becomes 3 input controls.

## Why I did not collect more

Full name, business name, phone number, member number and password confirmation are absent and remain absent. The PRD's future customer-record fields are not requirements for tailor registration. Business-profile setup belongs to a separately justified workflow. Password confirmation would duplicate input at this stage; password behaviour and validation have separate assessment milestones.

Clients keep invitation-based, passwordless email verification. These tailor forms do not introduce client password registration. Platform acceptance must not be confused with a client's approval of an individual clothes-item agreement.

## Information-design cleanup

I removed the signup subtitle, "A clearer place for your tailoring business." It supplied neither an instruction nor a requirement beyond "Create your tailor account." Its paragraph is no longer rendered. Login's audience hint and Reset's email instruction remain because they orient the user.

I preserved a 24px title-to-form gap using the existing spacing convention when no subtitle is present. Labels, fieldset legend, focus indicators, unavailable feedback, working links and ST branding remain.

The actual cosmetic decoration removed was the submit button's Soft box shadow in [auth.module.css](../../app/%28auth%29/auth.module.css), selector .submit. Its semantic fill, border, pointer, hover feedback and focus outline already identify the action. The panel's Soft shadow remains part of the existing visual grouping. This was removal of a decorative CSS effect, not a claim that I found a useless DOM element. I did not remove the useful brand badge or fabricate decoration merely to remove it.

## Terms and next boundary

The [terms note](terms-note.md) records sources and unresolved decisions for the [platform terms draft](platform-terms-draft.md) and [privacy draft](privacy-policy-draft.md). They are review artifacts, not public policies. There is no /terms or /privacy route and no checkbox linking to nonexistent or unapproved text.

After owner/legal review, a separately authorized change can present approved text and a signup-only, initially unchecked native checkbox. Contract acceptance must be distinguished from a privacy notice and any purpose-specific consent. Actual enforcement and durable acceptance records still require the relevant validation/authentication approvals.

## Verification and evidence scope

The strict /auth?signup, /auth?login and /auth?reset policy, default /auth login, hydration guard and local-only unavailable response are unchanged. Verification on 26 October 2026 passed: 2 query-policy tests, 38 [HTTP route tests](../../tests/auth-foundation/routes.test.mjs), 21 database-free assessment regression tests, TypeScript checking and the production build. The route tests used a local production server with the assessment experiment disabled. Prisma Client generation ran without connecting to a database.

Additional rendered-HTML checks confirmed 2/2/1 inputs, disabled server-rendered fieldsets, polite status regions, no Set-Cookie response, no terms checkbox, the removed signup phrase, and retained Login/Reset hints. /terms and /privacy returned HTTP 404. CSS source checks confirmed the retained panel shadow and signup spacing. These HTTP/source checks are not a fresh browser visual, keyboard or screen-reader test; those remain a manual follow-up for this cleanup. All 20 local links in the four new documents resolved.

Existing Step One evidence is preserved. The owner's [navigation record](../evidence/05-browser-navigation-verification.txt) reports same-document switching and Back/Forward for Step One; it explicitly does not claim a cookie check. It is not a fresh Step Two visual test. Any later before/after capture must show the actual running cleanup, and must not pretend that terms acceptance or account creation already works.
