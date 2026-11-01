# Task Three, Step 2: terms and privacy drafting note

Prepared and revised: 26 October 2026.
Current review versions: [Platform Terms v1.0 candidate](platform-terms-v1.0-candidate.md) and [Privacy Policy v1.0 candidate](privacy-policy-v1.0-candidate.md).
Historical versions: [Platform Terms v0.2](platform-terms-draft.md) and [Privacy Policy v0.2](privacy-policy-draft.md), preserved byte-for-byte.
Approval status: all texts remain NOT APPROVED and NOT PUBLIC. No effective date, incorporation, verified legal entity or completed legal review is asserted.
Publication status: internal owner-review documents. The existing opt-in assessment preview still reads only the historical v0.2 files; the v1.0 candidates are not served by the application.

## Purpose and authorship

I prepared the [platform terms](platform-terms-draft.md) and [privacy policy](privacy-policy-draft.md) with Codex assistance for owner and legal review. No lawyer, incorporated operator, registered business name, regulator approval or completed compliance assessment is asserted.

The intended final authorship is an authorized representative of the verified company operator, with qualified Nigerian counsel reviewing contractual wording and an appropriate privacy specialist reviewing data practices. Company operation is the owner-approved planning basis, not evidence that a legal entity already exists. AI-assisted drafting is not that review. No third-party SaaS policy or classroom registration template was copied.

The [PRD](../../docs/PRD.md) supplies the service facts. It is not legal boilerplate or permission to publish unfinished promises. Future product features and proposed policies remain distinguished from current UI-only behaviour.

## Owner correction and version history

The owner has now explicitly corrected the operating model: StitchTrack is being developed as an assumed company, NOT as a founder-operated personal pilot. This supersedes the individual-operator basis used in previous handoffs, prompts and reviews. No incorporation, CAC registration, registered legal name, address or contact has been verified. The intended company-operated initial pilot remains free under the read-only PRD.

v0.1 left identity unresolved. v0.2 used the earlier individual-operator account. I have kept both v0.2 files unchanged as historical drafts, including their superseded premise and stale interface descriptions. Preserving that evidence does not reaffirm its correctness. The v1.0 candidates use company operation as a planning assumption and separate the current website/UI-only forms from operational V1.

The candidates correct local email/password reading, recognise the assessment-only acknowledgement, distinguish synthetic enquiry persistence from customer account processing, remove unsupported communication-preference data and move unresolved review decisions out of customer-facing clauses. They preserve passwordless client access, business isolation, agreement versions, direct tailor payments, private images and controlled retention. They do not invent fees, refunds, liability caps, vendors, effective dates or a registered company.

No PRD correction is needed for the company-based planning premise: the PRD does not identify an individual operator. If later legal review requires a different retention policy or changes a business invariant, report that conflict and wait for an owner PRD update; do not change the PRD through legal wording.

## Actual sources consulted

Historical drafting sources, consulted/reported on 26 October 2026; access limitations are preserved below. A subsequent check for the company-based candidates is recorded after the table:

| Source | Material actually used | Access and limits |
| --- | --- | --- |
| [PRD](../../docs/PRD.md), sections 1-7 and 10; current auth source | Tailor/client distinction, agreement preservation, direct payments, planned data categories, scope and unresolved launch checks. | Read-only product source; not a legal approval. |
| [Nigeria Data Protection Act 2023, official gazette hosted by NCC](https://ncc.gov.ng/media/1084/view) | Relevant text in sections 24-27, 34-43 and the Act's arrangement of sections, used to frame privacy review. | Government-hosted Act text retrieved. The NDPC-hosted copy returned HTTP 403, so I used this traceable government copy. |
| [NDPC final GAID 2025](https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf), NDPC/NDP ACT-GAID/01/2025 | Operative guidance; official indexed material on articles 8-9 (major-importance designation/registration) and the earlier lawful-basis/consent material in articles 16-17. | Direct retrieval was blocked by HTTP 403, including the [July-hosted copy](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf) checked for v0.2. This is not a full-text review. Counsel must obtain the complete current directive; the 2024 draft is not the operative source. |
| [NDPC Journal 2026, GAID overview](https://ndpc.gov.ng/wp-content/uploads/2026/02/NDPC-Journal-2026-1.pdf) | Official indexed abstract confirms GAID issuance on 20 March 2025 and effect from 19 September 2025. | Context for treating GAID 2025 as operative, not a substitute for the directive or an individual registration determination. |
| [CAC service guidance](https://cac.gov.ng/services/service-timelines) | Official page distinguishes business-name and company registration services. | Retrieved for the pre-launch verification task; no name search or registration-status check was performed and no deadline/fee is adopted. |
| Earlier owner account used for v0.2 (superseded) | Founder-operated free pilot in Nigeria; no confirmed registered company or registered business name. | Historical drafting input only. The latest explicit company-based correction supersedes it; it is not the current operating premise. |
| [NDPC public guidance](https://ndpc.gov.ng/faqs/) | Official indexed guidance on the Act's scope, privacy rights and compliance responsibilities. | A guidance reference, not a StitchTrack-specific determination or a policy template. |
| [FCCPA 2018, official FCCPC-hosted gazette](https://fccpc.gov.ng/wp-content/uploads/2022/07/FCCPA-2018.pdf) | Relevant text around sections 114 and 125-129: understandable information, representations and contract fairness. | Retrieved text; counsel must confirm application to the actual operator/user relationships. |
| [FCCPC consumer-rights guidance](https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/) | Official summary used as a clarity/fairness review checklist. | Does not supply approved contract clauses. |

For the v1.0 candidates I re-read the PRD, agent rules, historical drafts and the current [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx), [draft preview loader](../../lib/auth/terms-preview.ts), [assessment gate](../../lib/assessment/config.ts), [assessment endpoint](../../lib/assessment/enquiry.ts), [schema](../../prisma/schema.prisma), root layout and package configuration. These are source inspections, not new browser, database or integration tests. Private environment values were not inspected.

The latest owner instruction is the source for company-based planning; it is not a company-registry search. The official [CAC business-name guidance](https://cac.gov.ng/services/business-name) and [FCCPC consumer-rights guidance](https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/) were retrieved again. Official indexed NDPC material was consulted for the Act/GAID review context. The NCC Act link timed out on the latest retry; direct NDPC GAID and FAQ retrieval returned HTTP 403. This does not establish a complete current-law review. No obsolete draft GAID or another website policy was substituted as approved legal wording.

The candidate wording is an original, provisional application of the service facts. Source material identifies questions to resolve; it is not pasted into a supposedly approved contract. I did not treat NDPC's own website privacy notice as StitchTrack's notice.

## Three different instruments

1. Platform Terms of Service would govern the operator-user service relationship.
2. Tailor-client garment agreements concern specific clothes items, measurements, pictures, prices and delivery commitments. Accepting platform terms cannot approve or alter those agreements.
3. A Privacy Policy explains actual processing and rights. Acknowledging that information is not blanket permission for every use of personal data. Any processing relying on consent needs its own justified, specific mechanism; a platform-terms checkbox cannot substitute for it.

The [field audit](field-justification.md) distinguishes the future approved-terms acceptance control from the temporary assessment-only draft acknowledgement below. No public policy page, consent workflow or acceptance record has been implemented.

## Stage One: local draft acknowledgement and hidden-button experiment

This section records the historical hidden-button version. The owner has now confirmed capture of [evidence 13](../evidence/13-button-hidden-version.png); Stage Two below supersedes its page copy and button behaviour. No historical screenshot or legal source was changed.

I added an initially unchecked native checkbox after Password in the opt-in Signup preview. Its label is: **"I have reviewed the unapproved draft Platform Terms v0.2 for this assessment demonstration."** The associated notice says the drafts are unapproved, checking the box creates neither an account nor a legal agreement, values are checked locally and no acknowledgement is saved.

Native expandable disclosures show the exact existing [Platform Terms v0.2](platform-terms-draft.md) and [Privacy Policy v0.2](privacy-policy-draft.md) as wrapped source text. Neither source document was edited, approved or given an effective date. The Privacy Policy is readable information, not a second consent checkbox. The drafts remain NOT APPROVED and NOT PUBLIC service policies. Their older description of a handler not reading values predates local validation; this preview does read values transiently, as its notice states. The separate v1.0 candidates correct that wording. The historical v0.2 preview is deliberately unchanged and must not be passed off as the company-based candidate or an approved policy.

This preview is default-off. The server loads draft text only for Signup when NODE_ENV is development, ENABLE_AUTH_TERMS_PREVIEW is exactly true and the request Host is a canonical loopback host. Production rejects the preview even if the flag is set. Bind the development server to 127.0.0.1; the Host check is an additional safeguard, not authentication or a substitute for local binding. There are no new /terms or /privacy routes, static policy assets or public raw-draft routes.

For this temporary Stage One experiment, Create account is hidden until the email and password meet existing client rules AND the acknowledgement is checked. Invalidating either field or unchecking hides it again. A visible hint explains how to reveal it. If a submission reaches the local handler while incomplete, the handler blocks it, associates field/checkbox errors and focuses the first invalid control. A valid submission still says only "Account creation is not available yet." It does not establish legal acceptance, create a session, send credentials or persist anything.

The checkbox keeps a visible label, required state, associated notice/error, caution icon and keyboard focus. It sits inside the existing disabled-before-hydration fieldset. Without JavaScript the form controls remain inert; native disclosures can still be read. Login and Reset have no acknowledgement or hidden action.

The hidden action deliberately has a discoverability and keyboard limitation: users cannot focus or activate a button that is hidden. The hint and guarded submission do not turn this into the final design. The visible-disabled version has NOT been implemented.

### Local activation and owner evidence

Stop the existing development server with Ctrl+C first; do not run a second normal Next.js development server against the same output directory. In WSL:

~~~sh
cd /home/bmalik/stitchtrack
source ~/.nvm/nvm.sh
nvm use 24.22.1
NODE_ENV=development ENABLE_AUTH_TERMS_PREVIEW=true ENABLE_PERSISTENCE_EXPERIMENT=false npm run dev -- --hostname 127.0.0.1 --port 3000
~~~

Open http://127.0.0.1:3000/auth?signup. Use synthetic input only. Restart without ENABLE_AUTH_TERMS_PREVIEW to return to the default form. No database credentials or database operations are needed.

The owner must verify both disclosures, checkbox keyboard operation, field/checkbox error associations, JS-disabled safety, mobile layout and the hidden/shown transitions in the running browser. Check that a valid checked submission displays only the unavailable message and makes no authentication request. These new interactions have not been claimed as browser or screen-reader verified.

Capture the genuine hidden state as **task-03-client-validation/evidence/13-button-hidden-version.png**: for example, valid synthetic email/password with the acknowledgement unchecked and Create account absent. Preserve all previous screenshots. No screenshot was generated or overwritten by this implementation. Stop here until the owner confirms evidence 13 is captured; only then may separately authorized Stage Two produce the visible-disabled state and evidence 14.

### What this does and does not satisfy

This demonstrates the assessment checkbox placement, readable source wording and the first hidden-button state honestly. It does not satisfy legally effective registration acceptance, completed legal review, durable versioned acceptance, the full hidden-versus-disabled comparison or its owner screenshots. Future registration must validate acceptance server-side against a specific approved Terms version and record the actor, version and time under a reviewed data policy. The current local boolean is not that record.

Database-free verification passed: 50 validation/component/query-policy tests, 21 assessment regression tests and 42 HTTP/RSC route checks in each of production and enabled local development. Typecheck and production build passed, with the preview flag deliberately set during the production build/run. Production responses contained neither draft text nor the checkbox. These are automated source/HTTP checks, not a browser layout, keyboard or spoken screen-reader audit.

## Owner and legal decisions still required

The candidates are ready for owner content review on the expressly assumed company basis. That review can approve or reject the proposed wording and product boundaries without claiming that the missing factual or legal checks are complete. There is no need to decide hypothetical future pricing, add a new product feature or invent details to fill a policy.

The three publication gates below are the smallest unresolved work packages. They are kept here as internal review items rather than presented as established facts or drafting instructions in the candidate policies. They apply proportionately to the release: the current website must be described accurately now; operational account/customer processing needs its own completed review before activation.

## Pre-launch checklist

| Gate | Facts or decisions the owner must supply | Qualified legal/privacy review and completion evidence |
| --- | --- | --- |
| 1. Identify the operator, audience and contact routes | Establish the actual company operator, legal name and registration status; supply an appropriate address and monitored service/privacy contacts. Decide who the Terms cover and participant eligibility. Identify who is actually responsible for current website processing rather than assigning it retroactively to an unverified future company. No private or fictional details should be inserted. | Check relevant CAC/company-name obligations, contracting capacity/authority, minors and what identification/contact information must be published. Record factual evidence; do not label the company incorporated merely because that is the product plan. |
| 2. Confirm the real data practices and a workable rights process | Supply the current release inventory: hosting/providers, locations/recipients, technical logs/cookies, access and backups. Approve limited retention criteria and a monitored process for rights, complaints and incidents. Before operational V1, add the actual authentication/email/image arrangements and reviewed closure/export/deletion handling; manual procedures may suffice where appropriate, but must exist and work. | Finalise purpose-by-purpose roles and lawful bases, notices for client data supplied by tailors, any processor terms and transfer safeguards. Assess children/sensitive data and applicable NDPC major-importance registration, DPO/audit, impact-assessment and incident obligations using the Act and operative GAID 2025, including articles 8-9. Review retention against evidence preservation and legal rights. Supply the verified facts and required disclosures for the publication version, not candidate bases copied as conclusions. |
| 3. Approve fair terms and the specific release | Confirm available features, service/complaint and closure arrangements, material-change communication, and the exact text/version proposed for release. The current free-pilot/direct-payment boundaries need no new commercial scheme. Choose an effective date only for an authorised, ready release. | Counsel reviews enforceability, content permissions, fair suspension/closure, non-excludable rights and any dispute provisions without inventing caps, refunds or guarantees. Complete a full current-law review and record its scope. Verify that the published text, actual operation and any future acceptance mechanism agree. |

These gates do not mean that all operational V1 features must be built to review candidate content. They mean an unfinished product must not be represented as operational, and incomplete identity/privacy information must not be represented as a finished public policy. No registration exemption is assumed merely because the pilot is free or the company is small.

## Review and release process

1. **Owner content approval:** Review the two v1.0 candidates and confirm wording, company-based planning and current-versus-planned scope. Keep the public-release gates separately open until evidence resolves them. Owner content approval is not legal sign-off, incorporation, approval of real customer processing or evidence that the assessment checkbox records legal acceptance.
2. **Publication approval:** Resolve the applicable gates, incorporate verified identity/contact and privacy disclosures, obtain qualified review and approve a specific immutable text. Version each document independently; record approver, actual approval/publication/effective dates and a text digest or immutable copy. Do not backdate or treat this candidate label as an effective version. Any material change to an approved candidate needs review again.
3. **Separately authorised implementation:** Only then publish readable /terms and /privacy pages and replace the demonstration with any approved acceptance design. Preserve the historical drafts and screenshots. No such implementation is part of this documentation task.

Before real registration, the future server must validate affirmative acceptance of the specific required approved Terms version and record the account, version and server timestamp with the successful account creation, retaining the wording or its immutable reference. A checkbox value alone is insufficient. Terms acceptance must remain distinct from receiving privacy information and any purpose-specific consent. The separate client invitation flow also needs a reviewed approach; it must not become client password registration.

## Stage Two: visible, focusable guarded button

The owner confirmed that evidence/13-button-hidden-version.png was captured before authorising Stage Two. The file exists and its SHA-256 is 4e2e9183e664074f2e95f0a0aaf9e3368326985133282fa65444b293536b70b6. It is preserved unchanged; this is not a claim that the agent captured or independently reproduced the owner's browser session.

Create account is now always visible. After hydration the native submit button remains keyboard-focusable and uses aria-disabled=true whenever Signup credentials are invalid or the local draft acknowledgement is unchecked. It uses aria-disabled=false when complete. Default-off Signup checks the same credentials without requiring a checkbox that is not rendered. Login and Reset are unchanged.

The choice fixes the hidden version's discoverability problem: a user can find the action and attempt it to learn what is missing. A native disabled button would prevent ordinary focus/click feedback; aria-disabled communicates the state while the form handler enforces it. It does not authorize an incomplete action.

Mouse activation, Enter/Space on the native button, implicit Enter and other submit events all reach the same onSubmit guard. That guard prevents native submission before reading fields, revalidates live credentials and checkbox state, focuses the first invalid control and exposes associated inline errors. If only draft acknowledgement is missing, feedback says "Review the draft Platform Terms before continuing." Other incomplete attempts retain the field-error summary. Feedback uses the existing single polite status region. Actual browser event and spoken-output checks remain owner/manual verification.

The disabled-before-hydration fieldset remains. Without scripts executing, inputs, password eye buttons, checkbox and submit remain inert. The aria-disabled action is focusable only after hydration; it does not weaken the native no-JavaScript safeguard. Valid local submission still displays only "Account creation is not available yet." No credentials, acknowledgements or sessions are transmitted or persisted.

The page no longer shows the assessment notice or instructions about revealing the button. The final labels are "I have reviewed the draft Platform Terms.", "Draft Platform Terms" and "Draft Privacy Policy". The checkbox has no stale description reference to the removed notice; only an active error is associated. The client note is "Clients access StitchTrack through an invitation from their tailor." These copy changes do not approve the drafts or convert review into contractual acceptance.

The existing explicit development/flag/loopback preview gate is unchanged. Its disclosures still show the exact historical v0.2 sources. The company-based v1.0 candidates remain under review, unmodified and unserved. No public /terms or /privacy route was introduced.

### Verification and owner screenshot 14

Actual automated checks passed: 58 component/validation/query-policy tests, 21 database-free assessment regressions, TypeScript checking, production build and 42 HTTP/RSC checks in each of production and enabled local development. The production build/run deliberately set the preview flag true and still excluded draft text. Unit tests cover the shared submit boundary and native semantics, not actual mouse or keyboard events in a browser. No new browser, screen-reader or all-network verification is claimed.

Using the local activation command above, open /auth?signup. The owner should verify: Tab reaches Create account after hydration while incomplete; mouse, Enter and Space produce contextual errors; implicit Enter cannot bypass the guard; email/password/acknowledgement correction changes the disabled state; unchecking reverses it; valid submission gives only the unavailable message; the eye, checkbox, labels and visible focus still work. Check at 375px, 768px and 1440px, check a JavaScript-disabled reload and inspect the browser network for credential/authentication requests.

Capture the final genuine visible-disabled state as task-03-client-validation/evidence/14-button-disabled-version.png, with valid synthetic credentials and the acknowledgement unchecked if a focused Terms-only example is desired. The action must remain visible with aria-disabled=true. Screenshot 14 is for the owner to capture; it was not generated, renamed or overwritten by this implementation. Keep evidence 13 unchanged for the comparison.

## Assessment and current implementation boundary

The hidden and visible-button stages demonstrate UI design, not approved legal acceptance or working account registration. The required owner capture for Stage One is now present; Stage Two is implemented, but screenshot 14 and the new manual browser/accessibility checks remain pending. Original Step One, Step Three and foundation evidence remain historical records.

The company correction and v1.0 candidates do not replace the historical draft preview or record end-user agreement. Owner content approval must not be portrayed as acceptance by a user. Real publication, legally effective acceptance and authentication still require the separate release process above. No policies, screenshots or database records were modified by Stage Two.

## Conditional draft views - current implementation

The owner approved replacing the disclosures with local conditional views inside /auth?signup. The sentence is now "I have reviewed the draft Terms and Privacy Policy." Terms and Privacy Policy are separate native nonsubmit buttons styled as links, outside the checkbox label. The label preserves the complete accessible name; neither document action changes its checked state.

The form remains mounted under a hidden ancestor while a document is displayed, preserving transient values, acknowledgement and validation state. Opening focuses the document heading; Back to Signup restores the original initiating action after the form is visible. The route and document remain unchanged. This adds no persistence or contractual acceptance.

The semantic renderer reads the unchanged historical v0.2 sources. Their superseded personal-operator premise and stale historical clauses are preserved rather than silently rewritten; the company-based v1.0 candidates are not substituted or approved. Public citation links retain their original destinations and open in a new tab. Relative references to the counterpart draft change the local view; references to unpublished PRD/review notes remain plain labels instead of broken or newly exposed public pages.

Passed: 66 component/validation/query tests, 21 assessment regressions, typecheck, production build, 42 production and 42 local-development route checks, plus six real Chrome cases (seven Node tests including the parent). State/focus restoration, keyboard/mouse independence, semantic structures, no navigation reload, three widths and script-disabled safety were checked. The [accessibility audit](accessibility-audit.md#implemented-conditional-signup-document-views---27-october-2026) distinguishes this automated improvement from still-missing genuine Narrator after observations and the four-defect requirement.

Screenshots 13 and 14 are preserved as historical evidence of the earlier hidden/visible-button stages; they are not screenshots of the new document views. No screenshot or spoken evidence was created. Existing draft-review and actual approved-Terms acceptance remain distinct.
