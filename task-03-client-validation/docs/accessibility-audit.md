# Task Three, Step 6: accessibility audit

Prepared: 27 October 2026.
Branch inspected: feat/task-03-auth-foundation.
HEAD at inspection: 003d8a1, plus the existing uncommitted authentication and documentation work.
Status: semantic document rendering is implemented, with browser checks and owner-reported Narrator reading/navigation successes. Exact before/after transcripts and the four-defect assessment requirement remain incomplete.

## Scope and evidence provenance

I reviewed the authoritative, read-only [PRD](../../docs/PRD.md), applicable agent rules, the current consolidated Signup, Login and Reset interface, validation, CSS and test coverage. The assessment PDF is unavailable to the agent; this document follows the Step 6 requirements explicitly supplied by the owner. It is not a claim to have checked unseen assessment wording or certified WCAG compliance.

The routes are /auth?signup, /auth?login and /auth?reset. Authentication remains UI-only. No real accounts, sessions, credential transmissions or reset emails are implemented. The draft acknowledgement is local-only, not approved legal acceptance. The original audit was documentation-only. The later owner-approved conditional-document implementation below changes the UI/rendering and tests, while preserving the PRD, policy sources and historical evidence.

The owner personally tested using Windows Narrator and Chrome, including a follow-up after the conditional document views were implemented. The observations below are owner-reported, not independently reproduced by the agent. The Windows/Chrome/Narrator versions, voice, verbosity, scan-mode settings, exact test date and recording timestamps were not supplied. This report's preparation date is not an inferred test date.

The owner supplied a [supplementary ScreenPal recording](https://go.screenpal.com/watch/cO6tiJnygkv). The web tool could not retrieve that URL during this review; I did not play, transcribe or independently verify its audio. The ScreenPal AI summary is not used as a verbatim transcript. A button label in the source is also not proof of Narrator's complete spoken wording.

Related records: [field justification](field-justification.md), [validation rules](validation-rules.md), [Terms note](terms-note.md) and [consolidation history](spa-rationale.md). Their earlier statements that screen-reader checks were pending describe earlier evidence states. The latest owner observations are recorded here without rewriting those historical documents.

## Owner-reported results

| ID | Observation actually reported | Scope and limit |
| --- | --- | --- |
| O1 | Narrator announced required input states and validation errors on Signup. | Positive result; no exact wording or separate blur/typing/submit sequence was supplied. |
| O2 | Email and Password fields were recognized. | Positive recognition result; do not infer that every route and input state was tested. |
| O3 | Masked passwords were spoken as masked characters, not the actual secret. | Positive masking observation for the tested case, not a claim about every input method or browser. |
| O4 | Revealing the password allowed Narrator to read its displayed characters. | Expected consequence of an explicit reveal; use synthetic credentials for recordings. |
| O5 | Show password and Hide password buttons were announced. | Names recognized; exact utterances, focus persistence and per-route keyboard sequences remain to be recorded. |
| O6 | Earlier draft Terms and Privacy disclosure controls were recognized. | Historical result for the removed disclosures; current conditional views are covered separately below. |
| O7 | The required acknowledgement checkbox announced checked and unchecked states. | Positive state/required announcement; the separate error announcement sequence is not fully specified. |
| O8 | Create account and the Login link were recognized. | Does not establish every activation method or the announced reason for an incomplete action. |
| O9 | Reset invalid-email submission returned focus to Email and Narrator announced its value and warning. | Positive observed focus/error result. Do not report this tested Reset scenario as a confirmed focus defect. |
| O10 | Ordinary paragraphs were skipped during Tab navigation. | Expected: Tab traverses interactive elements. Reading static text uses Narrator reading/scan navigation; this is not a defect by itself. |
| O11 | Terms and Privacy controls are announced on Signup. | Owner-reported success for the current conditional-view controls; no verbatim utterances supplied. |
| O12 | Opening each document view announces its heading. | Both Terms and Privacy heading announcements passed according to the owner; exact wording is not inferred from the source headings. |
| O13 | Narrator reads document content using Insert + Down Arrow. | Owner-reported successful continuous reading; this does not independently establish every heading-navigation or table-header relationship. |
| O14 | Tab moves through interactive links rather than ordinary paragraphs. | Expected behaviour, confirmed again in the current views. No paragraph tabindex correction is needed. |
| O15 | Back to Signup works. | Successful return reported; the precise restored focus target and announcement were not supplied. Chrome previously verified return to the initiating control. |

The owner also reconfirmed the earlier successful Signup error, password-control, required-state, checkbox-state and Reset error-feedback observations. These are retained as passes, not reopened as defects or presented as independently repeated agent tests.

No owner-reproduced accessibility failure was supplied in this set of observations. Successes must not be relabelled as failures to reach an assessment count.

## Field-by-field audit

S means supported by inspected source, O means owner-reported positive observation, and V means a specific manual check remains. S is not a real-browser pass. Contrast, forced-colour rendering and visible focus were not measured in this audit.

O1-O10 record the earlier observations, which the owner has reconfirmed. O11-O15 describe the current conditional views. The updated checkbox's full spoken name and error sequence still lack verbatim wording; that evidence gap does not negate the reported required/checked-state success.

The shared [FormField](../../app/%28auth%29/_components/FormField.tsx), lines 23-58, provides visible labels, native required inputs, conditional aria-invalid, associated error/hint IDs and caution icons with text. [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx), lines 81-111, retains the hidden Signup/Login legends, hydration guard and one polite status region. [Styles](../../app/%28auth%29/auth.module.css), lines 85-88, 101-113 and the document/checkbox focus selectors, define focus/error treatments.

| Field | Colour independence | Keyboard reachability | Focus visibility | Screen-reader announcements | Error association |
| --- | --- | --- | --- | --- | --- |
| Signup Email | S: error words and caution icon supplement colour. V: contrast/forced colours. | S: native email input in DOM order after hydration. V: full traversal. | S: explicit focus outline. V: actual visibility/zoom. | O: Signup required/error announcements and field recognition. V: exact timing and wording. | S: label, aria-invalid and signup-email-error; stale references clear with correction. V: spoken correction sequence. |
| Signup Password | S: text/icon error and text guidance; edge-space note is not colour-only. | S: native input and separate nonsubmit eye button. V: complete keyboard sequence. | S: input/eye focus rules and reserved icon space. V: zoom/overlap. | O: Signup error/required feedback; password masking, revealing and eye names were reported. Per-case route/sequence details need confirmation. | S: signup-password-error and distinct hint IDs; duplicate hint/error text is described once. V: guidance changes while focused. |
| Login Email | S: same text/icon mechanism. V: contrast. | S: native input. V: Login-specific traversal. | S: outline. V: actual visibility. | V: a complete Login-specific Narrator run was not separately supplied. O2 is general recognition evidence only. | S: login-email-error; empty blur and submit-led format validation. V: spoken timing/correction. |
| Login Password | S: same text/icon mechanism. | S: native input and nonsubmit eye button. V: per-route keys. | S: input/eye outlines. V: actual rendering. | V: independently identify the Login cases within O3-O5; do not assume all were repeated on Login. | S: login-password-error; presence-only rules remain distinct from Signup policy. |
| Reset Email | S: same text/icon mechanism. | S: native input and submit action. O9 confirms return focus in the tested sequence; other keys remain V. | S: outline. V: visible result at zoom/viewport sizes. | O9: value and warning announced after invalid submission. V: verbatim words, repeat attempts and correction. | S: reset-email-error. O9 supports an effective warning association in that case; it does not prove all timing paths. |
| Signup draft acknowledgement, local preview only | S: native check mark and text label; errors include words/icon. | S: native checkbox with a separate label and sibling document buttons. Chrome verified its full accessible name, required state and Space operation; O7's required/checked-state success was reconfirmed. V: exact current Narrator wording. | S: checkbox outline. V: actual visibility/forced colours. | O7: required/checked-state announcements passed and were reconfirmed. Chrome verified the current full name. V: verbatim current name and checkbox-specific error feedback. | S: conditional signup-draft-acknowledgement-error, cleared when corrected. V: spoken error/clearing. |

## Other relevant controls

| Control | Colour independence | Keyboard reachability | Focus visibility | Screen-reader announcements | Error association |
| --- | --- | --- | --- | --- | --- |
| Signup/Login eye buttons | S: distinct icons plus Show/Hide accessible names; not colour-only. | S: native type=button, no forced tabindex, no form submit. V: Enter/Space and focus/value preservation per route. | S: 2.75rem target and focus outline. V: real rendering. | O5: both names recognized; O3/O4: mask/reveal behaviour. Exact utterances remain V. | S: changing input type preserves its existing ID/descriptions. The button has no independent field error. |
| Terms / Privacy Policy document actions | S: underlined text controls, not colour-only. | Native nonsubmit buttons outside the checkbox label; Chrome verified Enter/mouse opening and independent checkbox state. | Explicit focus outline; Chrome verified heading/trigger focus. | O11-O13: current controls, both opened headings and continuous document reading passed, owner-reported. O15: Back works. V: exact utterances, structural navigation and precise return-focus announcement. | These controls have no field error; the separately labelled required checkbox owns its description. |
| Create account | S: aria-disabled state; visual state changes use semantic colours. V: clarity without colour or pointer cues. | S: native submit remains focusable after hydration; all submits reach the guard. V: actual mouse, Enter, Space and implicit Enter. | S: preserved focus outline while aria-disabled. V: real display. | O8: recognized. V: disabled-state reason, activation and repeated feedback. | S: dynamic feedback description plus inline errors; no initial reason is attached (C3). |
| Log in / Request reset link | S: text labels; errors are identified separately in words/icons. | S: native submit buttons. O9: Reset submission tested. V: all Login/Reset activation paths. | S: submit outline. V: actual display. | O9 supports Reset feedback. Login-specific result remains V. | S: form description references the polite feedback region after an attempt; inputs own specific errors. |
| Login / Signup / Forgot password links, home and skip link | S: textual names; focus/hover treatment is not just an icon colour. | S: native links, main skip target and no positive tabindex. O8: Login link recognized. V: complete route traversal/Back/Forward; local document opening/back was browser-verified without a reload. | S: [global link focus styles](../../app/globals.css), lines 65-86. V: actual focus placement/visibility. | O8 covers recognition only; other link names and route heading focus need V. | Not form fields; field errors must remain with their inputs. |

The [auth layout](../../app/%28auth%29/layout.tsx) supplies main and a labelled section. [AuthScreen](../../app/%28auth%29/auth/AuthScreen.tsx), the mode-change heading effect and keyed AuthForm, focuses the active heading on mode changes and remounts the form. Test direct loads and Back/Forward for predictable focus; do not assume this intended route announcement is itself a defect.

The native disabled fieldset before hydration/without JavaScript is intentional credential-submission protection. Missing aria-pressed on the eye is not automatically a defect: it uses a changing action name. Skipping ordinary paragraphs with Tab is not a defect, and static text must not be added to the Tab order merely to make Narrator read it.

## Findings and smallest proposed corrections

### F1 - Raw Markdown document bodies (implemented correction)

Status: the original source-level structural limitation is corrected by the approved semantic renderer. Rendering/Chrome checks passed, and the owner now reports successful heading announcements and document reading with Narrator. No original user-facing document-reading failure was independently confirmed. Exact comparative transcripts remain incomplete; this is not a certified WCAG finding.

Original source: TermsPreview rendered each complete source as a text child of pre. Current [DraftDocument](../../app/%28auth%29/_components/DraftDocument.tsx) and [bounded parser](../../lib/auth/draft-document.ts) replace that rendering. In the original version, headings, tables and references were not rendered as semantic HTML. That text was still readable; the limitation was document navigation/structure, not proof that Narrator could not read it.

Affected users: people navigating lengthy policies by heading, table or link structure. O6 established the old disclosures' recognition. O11-O15 now establish owner-reported current control recognition, opening announcements, reading and return. They do not retrospectively prove that the old text could not be read.

Historical baseline gap: no exact heading/link/table-navigation or reading transcript from the former disclosures was supplied. Recover it only from genuine existing evidence if available; do not recreate a failing interface or infer a past reading failure. Tab skipping prose was expected, not a defect.

Implemented correction: render the unchanged trusted v0.2 text as semantic headings, paragraphs, lists, safe public citation links and tables. Local Signup views replace the disclosures, without public routes or dependencies. Existing source-word/punctuation preservation tests pass. Repository-only PRD/review-note references remain plain reference labels instead of broken public links; the Privacy draft reference changes the local document view. Original public citations open a new tab with an accessible new-tab name; the auth route stays unchanged.

Current after result: the owner confirms document-heading announcements, reading with Insert + Down Arrow, expected Tab traversal and working Back to Signup. The disclosures no longer exist. Only unreported details, such as heading navigation between sections, table-header announcements and the exact return-focus target, remain targeted manual checks; the passed opening/reading checks do not need repeating merely to fill the report.

Implementation checks: source text is preserved, headings have one active H1, table headers have column scope, and the inactive Signup form is absent from Chrome's accessibility tree. Form state and initiating-control focus are restored. The local-only gate and unavailable-action guard remain. These automated checks do not supply the missing Narrator transcript.

### C1 - Exact blur/typing notification coverage remains unknown

Status: source concern awaiting case-specific owner verification, not a confirmed failure.

Sources: FormField lines 49-58, [validation](../../lib/auth/validation.ts), lines 93-105, and AuthForm feedback calculation and polite status region. Errors are associated with inputs but have no individual live regions; the summary is empty before a submission. Narrator can announce dynamic input descriptions without an extra live region. O1 is positive evidence and must be retained.

Targeted check only if not covered by the owner's successful error test: determine which exact blur/typing interaction produced the heard warning, and whether a correction removes its description without interrupting typing. Do not repeat already passed Signup error or Reset feedback cases just to search for a failure.

Proposed correction only if a real gap is reproduced: route concise, deduplicated feedback through the existing polite strategy at the necessary interaction point; do not add assertive per-keystroke announcements everywhere. Retest the same cases and confirm correction removes stale descriptions.

Affected users: screen-reader users who could miss a newly displayed error. Functionality impact: announcement scheduling and feedback state, not credential rules; preserve the approved validation timing.

### C2 - Focus is requested before newly dispatched errors render

Status: source timing concern, not a confirmed failure. No Reset focus failure was reported: O9 confirms the tested Reset focus/warning path worked and the owner reconfirmed it.

Source: AuthForm handleLocalSubmit (dispatch followed by focus) dispatches validation state and then immediately focuses the first invalid field. [React documents event batching](https://react.dev/learn/queueing-a-series-of-state-updates); the new description may not yet be present at the instant of focus. That possibility does not establish an observed speech failure.

Targeted check only for unreported paths: Enter while the first invalid field is already focused, and a repeated identical invalid submission. Record whether the current description and summary are heard. Keep O9 and the successful Signup errors as passes; do not rerun them as suspected failures.

Proposed correction only if missed announcements are reproduced: focus the invalid control after its current error description has committed. Retest all three modes, including the already passing Reset case.

Affected users: screen-reader users relying on focus-triggered descriptions. Functionality risk: focus timing and duplicate announcements; do not change Reset merely to fix an unobserved failure.

### C3 - Incomplete Signup action initially has no associated reason

Status: source fact with usability risk awaiting manual confirmation, not a proven inaccessible button.

Source: AuthForm submit button and feedback description sets aria-disabled for incomplete Signup, but attaches the feedback description only after feedback exists. O8 confirms button recognition, not the announced reason or every activation method.

Before check: enter valid synthetic credentials, leave acknowledgement unchecked, Tab to Create account and record its announcement. Try Enter and Space; inspect whether the checkbox error is announced and focus moves there. Repeat with missing credentials and with the preview off. Record any assistive-technology refusal to activate instead of assuming it.

Smallest proposed correction if necessary: associate an on-demand reason on button focus using existing validation context. Keep the action visible, keyboard reachable and guarded; do not restore a permanent development/assessment paragraph.

After check: the reason and first invalid field must be understandable, complete input must still show only the unavailable-action response, and no credentials may be sent.

Affected users: screen-reader and keyboard users who cannot discover why the action is unavailable. Functionality impact: feedback timing/presentation; keep legal acknowledgement and authentication semantics unchanged.

### Other unresolved risks, not additional confirmed defects

- Repeating identical errors or an identical unavailable message may not cause new live-region speech; measure it before adding an announcement counter or changing focus.
- Route heading focus on direct load/Back/Forward, high contrast, zoom/reflow and visible focus on every control still need a dedicated audit.
- A route-specific Login transcript, autofill/paste experience and Narrator's precise password-toggle focus announcement are not established by general recognition reports. The reported password controls/masking successes remain passes.
- Rendering credentials as visible text makes them available to screen reading after explicit reveal. O4 is expected behaviour, not evidence of a security failure; use synthetic values.
- The original audit did not run browser automation. The later scoped Chrome checks below cover DOM/focus/keyboard/layout and local application requests, not an all-network audit or spoken screen-reader certification.

## Before-and-after transcript record

Before refers to the owner-observed interface before the conditional document correction, not a reconstructed broken version. O6 concerns the former disclosures; no exact prior body-navigation transcript was supplied. The missing historical speech must not be invented now that the UI has changed. The owner has supplied behavioural summaries, not exact spoken quotations. Even where a UI label is known, it is not inserted below as a verbatim Narrator utterance. No exact wording has yet been supplied for these cells.

| Phase / case | User action | Exact Narrator announcement | Focus behaviour | Outcome / provenance |
| --- | --- | --- | --- | --- |
| Before B1 | Encounter Signup required fields and trigger validation errors. | Awaiting owner verification; verbatim wording not supplied. | Exact sequence/location awaiting owner verification. | O1/O2: required/error announcements and fields recognized, owner-reported positive. |
| Before B2 | Enter a synthetic password while masked. | Awaiting owner verification; masked-character wording not supplied. | Awaiting owner verification. | O3: masked characters rather than the secret were spoken. |
| Before B3 | Reveal and hide the synthetic password using the eye control. | Awaiting owner verification; no full button or character utterances supplied. | Focus retention and exact key sequence awaiting owner verification. | O4/O5: displayed characters could be read and both button names were announced. |
| Before B4 | Navigate to Draft Platform Terms and Draft Privacy Policy controls. | Awaiting owner verification; verbatim wording not supplied. | Awaiting owner verification. | O6: controls recognized; inner semantic navigation not established. |
| Before B5 | Check and uncheck the draft acknowledgement. | Awaiting owner verification; full required/checked/unchecked wording not supplied. | Awaiting owner verification. | O7: required and both checked states announced. |
| Before B6 | Encounter Create account and Login link. | Awaiting owner verification; full utterances not supplied. | Awaiting owner verification. | O8: both recognized; activation/reason coverage not inferred. |
| Before B7 | Submit an invalid email on Reset. | Awaiting owner verification; exact value/warning words not supplied. | Owner reports focus returned to Email. | O9: value and warning announced; tested behaviour passed. |
| Before B8 | Complete a dedicated Login keyboard/error/masking run. | Awaiting owner verification; no distinct Login transcript supplied. | Awaiting owner verification. | Pending; do not infer a per-route pass from shared components. |
| Before B9 | Tab past ordinary paragraphs. | Awaiting owner verification; do not invent silence as a quotation. | Owner reports paragraphs were skipped in Tab navigation. | O10: expected interactive-control navigation, not a defect. |
| After A1 | Encounter Terms and Privacy controls on Signup; open each conditional view. | Awaiting owner verification; exact control and heading utterances not supplied. | Owner reports each heading was announced; Chrome separately verified H1 focus. | O11/O12: both controls and both opened headings passed, owner-reported. |
| After A2 | Read document content using Insert + Down Arrow. | Awaiting owner verification; no verbatim document-reading transcript supplied. | Exact reading position/sequence not supplied; no failure reported. | O13: document reading passed, owner-reported. This does not establish an earlier reading failure. |
| After A3 | Tab through document interactions. | Awaiting owner verification; exact link utterances not supplied. | Owner reports Tab traversed interactive links rather than ordinary paragraphs. | O14: expected behaviour, passed. |
| After A4 | Activate Back to Signup. | Awaiting owner verification; exact return utterance not supplied. | Owner reports Back works; exact Narrator focus target unreported. Chrome previously verified initiating-control restoration. | O15: successful return, owner-reported; precise spoken focus evidence remains open. |
| Reconfirmed A5 | Previously tested Signup errors, required states, password controls, checkbox states and Reset error feedback. | Awaiting owner verification; exact utterances not supplied. | Preserve O9's reported return to Reset Email; do not infer additional focus details. | Owner reconfirmed earlier passes. No new agent test or full per-route transcript is claimed. |

The owner should add precise action/key sequences, recording timestamps and actual spoken words from listening, distinguishing quotations from paraphrases. Do not reconstruct them from ScreenPal's AI summary or from expected HTML. Use synthetic values and omit real credentials from transcripts/recordings.

Optional bonus paths are evidence/11-screenreader-before.mp3 and evidence/12-screenreader-after.mp3. Neither exists in the inspected repository. The supplementary ScreenPal link is not falsely relabelled as either MP3, and no recording was created or converted.

## Hidden-button history and current visible design

The [hidden-button screenshot](../evidence/13-button-hidden-version.png) and [visible-disabled screenshot](../evidence/14-button-disabled-version.png) both exist. They are owner evidence and were preserved unchanged; file presence is not a spoken transcript or proof of every activation path.

The historical version hid Create account until credentials and acknowledgement were valid. A hidden control could not be discovered or focused while incomplete. Stage Two replaced that with an always-rendered native submit button, focusable after hydration, with aria-disabled reflecting incomplete input. The single submit handler prevents native submission, checks current values, displays associated errors and focuses the first invalid control. A valid local attempt only reports that account creation is unavailable.

The disabled-before-hydration/JavaScript-disabled fieldset remains. No actual legal acceptance or account creation is introduced. The local-only conditional views still read unchanged historical v0.2 texts; the company-based v1.0 candidates remain unapproved and unserved.

This is a documented historical design improvement, not four independent accessibility defects or a completed Step 6 before/after transcript. I do not use the deliberately hidden assessment state to manufacture unrelated failures.

## Tests that passed and their limits

These are prior Stage Two results recorded in the [Terms note](terms-note.md#stage-two-visible-focusable-guarded-button) and [validation record](validation-rules.md#stage-two-visible-signup-action-with-accessible-guarded-submission), not rerun during this documentation-only audit:

| Check | Prior actual result | What it establishes / does not establish |
| --- | --- | --- |
| Component, validation and query-policy tests | 58 passed | Labels/descriptions, caution markup, error clearing, credential rules, native control contracts, guarded local submission and hydration markup; not real Narrator speech. |
| Database-free assessment regressions | 21 passed | Existing mocked assessment behaviour; not authentication or database integration. |
| HTTP/RSC route tests | 42 passed in production and 42 in enabled development | Route policy, SSR markup, local preview isolation and production exclusion; not actual browser key events. |
| Typecheck and production build | Passed | Type/build consistency including offline client generation; not accessibility conformance. |

I inspected the [component tests](../../tests/auth-validation/components.test.mjs), [validation tests](../../tests/auth-validation/validation.test.mjs), [preview tests](../../tests/auth-validation/terms-preview.test.mjs), [route tests](../../tests/auth-foundation/routes.test.mjs) and [render harness](../../tests/auth-validation/rendering.mjs). The harness renders server markup and invokes callbacks; it is explicitly not a screen-reader simulation.

## Minimal correction and retesting sequence

1. Preserve the recorded passes. Add exact spoken words and timestamps only from the owner's genuine evidence, together with the actual environment/settings and revision. Recover missing historical before speech from existing recordings if possible; a new current run cannot replace that history. ScreenPal's AI summary is not a transcript.
2. Check only the unreported document details: section-heading navigation, table-header relationships where tables are present, and whether Back returns focus to the initiating Terms/Privacy control. Opening headings, continuous reading and ordinary Tab behaviour have already passed.
3. Triage the narrowly defined C1-C3 cases only where not covered: clarify the successful error test's timing, repeated submission while already focused, and the reason/checkbox feedback for an incomplete Create account action. Complete missing Login-specific observations and visible-focus/zoom checks without repeating the passed masking and error scenarios. Record a pass and close a concern if no defect appears.
4. If a genuine defect is demonstrated, record its exact action, speech and focus baseline, request approval for the smallest fix, then repeat that same case after correction. Relevant regression tests/typecheck/build belong after any approved code change, not this documentation update.
5. Keep the four-defect shortfall explicit. The inspected source provides no additional confirmed accessibility defect in this review. If targeted checks also pass, report that result to the owner/assessor rather than inventing defects, reintroducing failures or counting successful behaviours as fixes.

Only the later, explicitly approved conditional document correction is implemented. C1-C3 remain concerns awaiting evidence, not authorization for speculative fixes.

## Assessment completion and explicit shortfall

| Mandatory element supplied by the owner | Current status |
| --- | --- |
| Markdown audit at the exact required path | Prepared. |
| Signup/Login/Reset fields and relevant controls reviewed against all five dimensions | Source-based matrix provided; named manual gaps remain. |
| Owner observations and evidence provenance | Recorded without broadening their scope or inventing words. |
| Genuine before/after transcript table | Structured table includes current owner-reported after successes; exact spoken quotations and the historical structural-failure baseline remain missing. |
| At least four genuine problems identified and fixed | NOT MET. F1 is one corrected source-level structural limitation with automated evidence. No owner-reproduced failed case or complete genuine before/after Narrator comparison has been supplied for it. Even if F1 counts, at least three additional genuine problems and the required fix/observation evidence remain. C1-C3 are not counted as confirmed defects. |
| Evidence of correction and regression checks | Prior scoped rendering/browser/regression checks passed. Owner-reported Narrator control, heading, reading and return successes are now recorded; exact comparative speech and remaining structural/focus details are not established. |
| Optional before/after MP3 recordings | Not present; optional, not fabricated. |

This document meets the requested audit-record delivery, but it does not establish completion of every mandatory Step 6 requirement. Successful Narrator behaviour and the hidden/visible experiment cannot fill the four-defect shortfall artificially.

## Implemented conditional Signup document views - 27 October 2026

The exact visible sentence is "I have reviewed the draft Terms and Privacy Policy." Terms and Privacy Policy are independent native type=button actions styled as links. They sit outside the native checkbox label, which supplies the complete sentence as its accessible name. This prevents opening a document from toggling the checkbox and preserves native keyboard/hydration semantics.

AuthScreen retains the mounted AuthForm inside a hidden ancestor while a document is active. The main content becomes the selected semantic article with Back to Signup. Native hidden removes the form, its actions, feedback and navigation from visual display and accessibility navigation. View state lives only in React memory; no URL/query/hash, history entry, password storage or new route is created.

Opening focuses the document H1 after rendering. Back unhides the same form instance and then focuses the initiating Terms or Privacy Policy action. A document-to-document reference keeps the original Signup trigger for return focus. The hidden Signup heading uses a different ID while the active article owns auth-title, avoiding duplicate IDs.

Actual verification passed: 66 component/validation/query tests, 21 assessment regressions, typecheck, production build, 42 production HTTP/RSC checks and 42 enabled-development HTTP/RSC checks. The new [browser test](../../tests/auth-foundation/documents.browser.test.mjs) passed all six cases (seven Node tests including its parent) in isolated headless Chrome 155.0.8059.85. The Windows driver used Node 24.19.0; application tests/build used WSL Node 24.

Chrome verified real Enter/Space and mouse actions, exact checkbox accessible name/required state, independent activation, heading and trigger focus, preservation of email/password/acknowledgement/validation/password-visibility state, the hidden form's absence from the accessibility tree, semantic tables/links, unchanged URL and zero full-document reloads while switching. At 375px, 768px and 1440px the document and form had no page-level horizontal overflow. Long documents scrolled normally; tables used their own keyboard-focusable horizontal scroll region.

Scoped network observations contained no local application writes/authentication requests, and no tested password was stored in localStorage/sessionStorage. The valid Signup unavailable response, Login/Reset behaviour and JavaScript-disabled inert controls passed browser checks. These results are DOM/accessibility-tree/browser automation, not actual Narrator speech.

The first browser-control tool failed to initialise, and Next.js refused a second development server. Verification therefore used an isolated headless Chrome profile against the owner's already-enabled local port-3000 preview, without stopping or reconfiguring it. Test-harness issues were corrected: boolean readiness checks, complete native Enter events, raw RSC text framing, and HTML text extraction that preserves inline punctuation. Final checks passed; legal wording was not changed to make tests pass.

No screenshots, audio or transcripts were generated. The owner has now confirmed current control/heading announcements, document reading with Insert + Down Arrow, expected Tab behaviour and working Back to Signup. Exact spoken wording, detailed structural navigation and the precise Narrator return-focus target remain unreported. Missing earlier body-navigation speech remains an honest evidence gap. The screenshots 13/14 show earlier stages and are not substituted as screenshots of these new views.

## Review references and preservation

I used [W3C form notification guidance](https://www.w3.org/WAI/tutorials/forms/notifications/) for concise field/overall feedback, [W3C information-and-relationships guidance](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) for document structure, and [W3C keyboard guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#focusability-of-disabled-controls) for focusable disabled controls. These guide investigation; they do not prove a specific Narrator failure or certify compliance.

This latest follow-up changes only this audit, records the owner's additional observations and reinspects the relevant source. It does not repeat application tests, create new browser evidence or independently reproduce Narrator speech. Earlier actual implementation checks are retained above as historical results. Local documentation links, changed-file scope and git diff --check are checked for this update. PRD, legal documents, code, Task One/Two files and historical evidence remain unchanged. No database, migration, staging, commit or push operation was performed.

Assumptions: none.
