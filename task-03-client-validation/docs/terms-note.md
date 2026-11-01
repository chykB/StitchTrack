# Task Three, Step 2: terms and privacy drafting note

Historical note prepared: 26 October 2026. Current company-candidate finalization: 29 October 2026.
Current review versions: [Platform Terms v1.0 candidate](platform-terms-v1.0-candidate.md) and [Privacy Policy v1.0 candidate](privacy-policy-v1.0-candidate.md).
Historical versions: [Platform Terms v0.2](platform-terms-draft.md) and [Privacy Policy v0.2](privacy-policy-draft.md), preserved byte-for-byte.
Candidate status: **V1.0 CANDIDATE — OWNER/LEGAL REVIEW PENDING — NOT PUBLIC — NOT EFFECTIVE**. The company-operated product direction is owner-approved; the legal text, incorporation, effective date and publication are not approved or verified.
Publication status: internal owner-review documents. The existing opt-in assessment preview still reads only the historical v0.2 files; the v1.0 candidates are not served by the application.

## Latest company-candidate review

Inspected branch feat/task-04-server-security at HEAD e09b419, including the existing pending product/email work. This is a source/documentation review, not a new database, browser, SMTP or registry test. The owner-approved direction is a company-operated SaaS, registered in Nigeria before public launch. The product brand need not be the legal company name; preferred company form and actual registration particulars still need the owner's final choices/advice.

The two v1.0 candidates are now complete as **review candidates**, not as publishable policies. They preserve the free initial pilot, direct unverified tailor payments, business-scoped client access, independent garment approvals and exact agreement history. They correct the earlier blanket description of the implementation as entirely browser-only, add the tailor's personal/display name, identify known test egress and keep unimplemented customer workflows and procedures expressly prospective. Operational acceptance, privacy information and any purpose-specific consent remain distinct.

Historical v0.1/v0.2 wording, source-access reports and assessment evidence are unchanged. Stage narratives below describe their own historical state; statements such as screenshot/verification pending or no internal account persistence do not override this update or newer source/evidence. Existing draft-preview text is not substituted with either candidate. No public policy route or approved TermsVersion record was created.

### Known-processing audit and remaining factual limits

| Area checked | Current supported position | Publication consequence |
| --- | --- | --- |
| Public auth UI and local draft views | [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) remains an unavailable local action; name/email/password/code and review state are read for feedback. Conditional documents use historical v0.2, not legal acceptance. | Describe the disabled public flow separately from internal services. Do not claim all repository processing is transient. |
| Local HTTP previews | [Validation boundary](../../lib/auth/validation-preview.server.ts) can receive synthetic signup/login/reset input only behind development/local opt-in guards. It returns validation/unavailable results, not accounts or sessions. | Do not describe these requests as browser-only or as working registration. |
| Breach screening | [Range checker](../../lib/auth/breach-check.server.ts) sends a five-character SHA-1 prefix to HIBP; password/email/full digest are not sent. The connection has technical metadata. Real operational registration requires a fail-closed prerequisite; its public wiring is absent. | HIBP is a known external implementation dependency to assess, not an invented hosting vendor or a claim of anonymity. Confirm its lawful basis, recipient role and transfers for launch. |
| Internal account processing | [Registration service](../../lib/product-auth/registration.server.ts) and [product schema](../../prisma/product/schema.prisma) support name/canonical email, Argon2id credential, Terms fixture/acceptance metadata, challenge lifecycle and encrypted email jobs. Owner reports the real isolated PostgreSQL harness passed; no customer database was inspected here. | Synthetic test persistence is separate from public enrollment. Optional schema fields do not prove collection; profile-image/OAuth-token/session-IP fields are not asserted as live data uses. |
| Email and background dispatch | [SMTP boundary](../../lib/product-auth/smtp.server.ts), [worker](../../prisma/product/email-worker.md) and owner evidence establish Gmail test sends to an owner-controlled mailbox, plus PostgreSQL worker-mechanics checks. Eligible worker SMTP dispatch remains untested. | Gmail testing is verified; launch SMTP contracting, location, recipients and operational delivery remain unresolved. A real test mailbox/address and provider metadata can be personal data even with a synthetic code. No sender address is copied into these policies. |
| Assessment records | The separate [enquiry fixture](../../lib/assessment/enquiry.ts) can persist synthetic name/enquiry and emit allow-listed request/receipt logs. Other isolated experiments have their own synthetic records/captures. | Do not erase this history or equate it with customer onboarding. Keep detailed fixture implementation out of the proposed public notice; actual log/record retention still needs review. |
| Controlled timing experiment | [Evidence 18 preparation](../../task-04-server-security/docs/email-timing.md) uses a private temporary synthetic file store and controlled transport, not PostgreSQL registration or SMTP. No owner timing results are assumed here. | It creates no approved Terms, operational account or public feature. |
| Customer product and infrastructure | Client/business authorization, garment/payment workflows, customer images, reminders, recovery, closure/export/deletion and staffed rights/support arrangements are not currently offered as an operational service. No release hosting/logging/backup/transfer configuration was verified. | Keep these future-oriented; inventory actual release data/recipients before turning the candidate into a notice for that release. |

No new PRD conflict was identified: sections 2-4 preserve verification/access and garment/payment boundaries; section 5 expressly leaves image retention subject to review. Legal wording does not approve that timetable, invent an alternative or authorize new features. Registration remains disabled for the public. Existing internal test Terms and the local checkbox are not public legal acceptance.

Current legal-source check: the official [FCCPC rights guidance](https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/) was retrieved for clarity, fair dealing and non-excludable-rights review. Direct retrieval of the [NDPC Act page](https://ndpc.gov.ng/download/nigeria-data-protection-act-2023) and [final GAID 2025 PDF](https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf) returned HTTP 403; official indexed information is not a full-text legal review. No draft GAID, regulator's own privacy policy or generic SaaS template was adopted as StitchTrack's policy. The historical source/access table below remains provenance for earlier drafting, not a claim of fresh full-law verification.

## Purpose and authorship

I prepared the [platform terms](platform-terms-draft.md) and [privacy policy](privacy-policy-draft.md) with Codex assistance for owner and legal review. No lawyer, incorporated operator, registered business name, regulator approval or completed compliance assessment is asserted.

The intended final authorship is an authorized representative of the verified company operator, with qualified Nigerian counsel reviewing contractual wording and an appropriate privacy specialist reviewing data practices. Company operation is the owner-approved planning basis, not evidence that a legal entity already exists. AI-assisted drafting is not that review. No third-party SaaS policy or classroom registration template was copied.

The [PRD](../../docs/PRD.md) supplies the service facts. It is not legal boilerplate or permission to publish unfinished promises. Future product features and proposed policies remain distinguished from current public UI-only behaviour and the internal test foundation summarized above.

## Owner correction and version history

The owner has now explicitly corrected the operating model: StitchTrack is being developed as an assumed company, NOT as a founder-operated personal pilot. This supersedes the individual-operator basis used in previous handoffs, prompts and reviews. No incorporation, CAC registration, registered legal name, address or contact has been verified. The intended company-operated initial pilot remains free under the read-only PRD.

v0.1 left identity unresolved. v0.2 used the earlier individual-operator account. I have kept both v0.2 files unchanged as historical drafts, including their superseded premise and stale interface descriptions. Preserving that evidence does not reaffirm its correctness. The v1.0 candidates use company operation as a planning assumption and separate the current website/UI-only forms from operational V1.

The earlier company-based revision corrected local email/password reading, recognised the assessment-only acknowledgement, distinguished synthetic enquiry persistence from customer account processing and removed unsupported communication-preference data. The current candidates also distinguish internal product processing and mark essential unresolved publication facts explicitly. They preserve passwordless client access, business isolation, agreement versions, direct tailor payments, private images and controlled retention. They do not invent fees, refunds, liability caps, vendors, effective dates or a registered company.

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

The [field audit](field-justification.md) distinguishes the future approved-terms acceptance control from the temporary assessment-only draft acknowledgement below. No public policy page or operational privacy-consent workflow is enabled. Public approved-Terms acceptance remains disabled; internal synthetic acceptance tests are separate.

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

## Launch-approval checklist

This is the single current publication checklist. Earlier product decisions and provisional figures in the [operating record](legal-operating-decisions.md) remain internal direction, not deadlines or guarantees. Complete the applicable facts/procedures for the actual release; reviewing text does not require building every future feature, but the notice must describe only what that release does.

| Unresolved gate | Minimum completion evidence before legal publication/related customer use |
| --- | --- |
| 1. Operator and reachable contacts | Complete company registration before public launch; verify legal name/number/form/address and contracting authority. Identify the current website controller separately. Confirm monitored support, complaints and privacy channels and who handles them. |
| 2. Actual processing and supplier facts | Approve the release data/recipient inventory: hosting, database, email, breach screening, image/storage if enabled, backup/logging/support, cookies/technical fields, processing and access countries. Confirm contracts and applicable transfer protections; Gmail testing and a proposed image provider do not settle launch arrangements. |
| 3. Workable handling procedures | Set justified category retention/deletion/backup/hold criteria; verify proportionate rights checks/routing and incident handling. Confirm client notice at collection and in invitations, including a non-portal route. Establish complaints, suspension/review and closure/access/export procedures suitable for available features; do not promise missing capabilities or the provisional response windows. |
| 4. Qualified Nigerian legal/privacy review | Confirm company/representative and client capacity/contract terms, content permissions, fair suspension/change/closure and statutory remedies; activity-specific roles/bases and business DPA; transfer grounds, image/measurement and capacity safeguards, and applicable NDPC registration, DPO, audit/DPIA and incident obligations. Obtain current Act/GAID text and record review scope; no exemption/compliance conclusion is inferred from a free pilot. |
| 5. Specific release approval | Resolve precise candidate placeholders; reconcile wording with that release and any necessary owner PRD correction. Owner and qualified reviewers approve the exact immutable policy texts/versions and authorized publication arrangements. Only a later approved release may assign actual publication/effective dates, publish readable policies and enable server-validated Terms acceptance. Privacy notice and consent remain separate. |

No date is assigned now. The owner can approve product direction and proposed content while these gates remain open; that is not legal sign-off, user acceptance, permission for real customer processing or authority to mark a TermsVersion approved. Future acceptance must record account, exact approved version and server time with successful registration, preserving the immutable wording/reference. Existing internal transaction support is not public acceptance. Client garment approvals remain independent.

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

Passed: 66 component/validation/query tests, 21 assessment regressions, typecheck, production build, 42 production and 42 local-development route checks, plus six real Chrome cases (seven Node tests including the parent). State/focus restoration, keyboard/mouse independence, semantic structures, no navigation reload, three widths and script-disabled safety were checked. The [accessibility audit](accessibility-audit.md) distinguishes this automated improvement from still-missing genuine Narrator after observations and the four-defect requirement.

Screenshots 13 and 14 are preserved as historical evidence of the earlier hidden/visible-button stages; they are not screenshots of the new document views. No screenshot or spoken evidence was created. Existing draft-review and actual approved-Terms acceptance remain distinct.
