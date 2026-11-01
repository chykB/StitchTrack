# Task Three, Step 6: accessibility audit

## 1. Scope and evidence

Revised: 27 October 2026, against committed HEAD `c1e6180` on `feat/task-03-auth-foundation`.
The original inspection used `003d8a1` plus then-uncommitted work; it was not an inspection of today's HEAD.
The relevant authentication corrections are now committed in checkpoint `bcd1b37`.

I reviewed the authoritative, read-only [PRD](../../docs/PRD.md), agent rules, source history and existing evidence.
No separate assessment PDF or original Step 6 instructions were found in the repository.
This audit follows the owner's supplied requirements; it does not claim WCAG certification.

Scope: `/auth?signup`, `/auth?login` and `/auth?reset`, including inputs, password visibility,
draft acknowledgement, Terms/Privacy views, submit buttons and navigation.
The later verification screen is covered by [its own record](numeric-input.md), not retrospectively by these Narrator observations.
Authentication remains UI-only. The development-only draft acknowledgement is not contractual acceptance;
the unapproved v0.2 preview and company-based v1.0 candidates remain distinct.

The owner personally tested in Chrome with Windows Narrator, including a follow-up after the document-view correction.
These are owner-reported observations, not independently reproduced speech.
The [supplementary ScreenPal recording](https://go.screenpal.com/watch/cO6tiJnygkv) is preserved unchanged.
Earlier retrieval failed; no audio was played or transcribed by the agent, and its AI summary is not a verbatim transcript.
Exact test dates, Windows/Chrome/Narrator versions, settings and recording timestamps were not supplied.

Separate automated evidence comes from the [component tests](../../tests/auth-validation/components.test.mjs),
[document rendering tests](../../tests/auth-validation/documents.test.mjs),
[HTTP/RSC tests](../../tests/auth-foundation/routes.test.mjs) and
[real-Chrome document checks](../../tests/auth-foundation/documents.browser.test.mjs).
Those checks establish markup, interactions and focus behaviour, not what Narrator actually said.
This revision runs documentation checks only; it does not repeat application or owner tests.

## 2. Field-by-field accessibility audit

**S** = inspected source; **O** = owner-reported manual success; **A** = previously recorded automated success;
**V** = unverified detail. Shared source is [FormField](../../app/%28auth%29/_components/FormField.tsx),
[AuthForm](../../app/%28auth%29/_components/AuthForm.tsx), [validation](../../lib/auth/validation.ts),
[auth CSS](../../app/%28auth%29/auth.module.css) and [global focus styles](../../app/globals.css).

| Field / control | Colour independence | Keyboard reachability | Focus visibility | Screen-reader announcements | Error association |
| --- | --- | --- | --- | --- | --- |
| Signup Email | S: words and caution icon accompany colour. | S: native labelled input; A: browser interaction. | S: explicit outline; V: contrast/forced colours. | O: field, required state and errors recognized; exact speech unavailable. | S/A: required, conditional aria-invalid and signup-email-error; correction clears stale references. |
| Signup Password | S: error words/icon; guidance and edge-space note are text. | S: native input; separate eye button; A: interaction. | S: input outline and reserved eye space; V: zoom rendering. | O: required/errors, masking and reveal recognized. | S/A: signup-password-error/hint; duplicate guidance avoided and corrected errors removed. |
| Login Email | S: same words/icon mechanism. | S: native input; A: interactions. | S: outline; V: dedicated visual audit. | V: complete Login-specific Narrator sequence not separately documented. | S/A: login-email-error; required blur and submit-led format feedback. |
| Login Password | S: same words/icon mechanism. | S: input/eye button; O: Chrome keyboard checks in validation record. | S: input/eye outlines; V: dedicated visual audit. | O: general masking/eye-name successes; full per-route Narrator sequence V. | S/A: login-password-error; presence-only Login policy preserved. |
| Reset Email | S: words/icon supplement colour. | S: native input/submit; O: invalid submission tested. | S: outline; V: dedicated visual audit. | O: invalid submission announced value and warning. | S/A: reset-email-error; O: focus returned to Email with warning. |
| Signup draft acknowledgement | S: native check mark, label and words/icon error. | S/A: native checkbox and Space; independent document actions. | S: checkbox outline; V: forced colours. | O: required, checked and unchecked states announced; exact full name/error speech V. | S/A: required, conditional invalid state and checkbox-error ID; correction clears it. |
| Signup/Login Show/Hide | S: distinct icon and changing accessible action name. | S/A: nonsubmit native button; keyboard operation, value preservation. | S: outline and 2.75rem target; V: contrast. | O: both names announced; masked characters spoken, revealed characters readable. | S/A: existing input ID, label, autocomplete and error descriptions retained. |
| Terms / Privacy / Back to Signup | S: underlined actions and text, not colour alone. | S/A: native buttons outside checkbox label; independent activation. | S/A: heading on opening, initiating control on return. | O: controls, headings, continuous reading and Back work; precise return utterance V. | Not fields; S/A: checkbox owns its error, article has a labelled heading. |
| Create account | S: text action and programmatic aria-disabled; visual state is not sole feedback. | S/A: visible, focusable after hydration; guarded mouse/keyboard submission. | S: outline retained while aria-disabled. | O: recognized; V: exact unavailable-state reason/activation speech. | S/A: inline errors and polite summary after attempt; no initial reason description. |
| Log in / Request reset link buttons | S: text labels and separate words/icon errors. | S/A: native submit; O: Reset activation. | S: submit outline; V: dedicated visual audit. | O: Reset warning; V: full Login-specific speech. | S/A: form summary description and field-owned errors. |
| Account navigation, home and skip links | S: textual names, focus/hover styles. | S/A: native links; no positive tabindex. | S: explicit focus styling; V: comprehensive visual audit. | O: Login link recognized; other exact announcements V. | Not fields; errors remain with their inputs. |

The Signup/Login legends remain visually hidden, retaining grouping without redundant visible headings.
The disabled fieldset before hydration/without JavaScript is intentional credential-submission protection.
Tab should reach interactive elements, not ordinary paragraphs; static prose does not need added tabindex.
Contrast/forced-colour testing and a comprehensive visible-focus/zoom audit are not established by source CSS alone.

## 3. Problems and corrections

The history below distinguishes missing foundation capabilities from later implemented improvements.
It is not a list of independently reproduced Narrator failures or invented production incidents.

| Historical shortcoming | Implemented correction and user benefit | Evidence and qualification |
| --- | --- | --- |
| Foundation inputs did not expose required state programmatically. | FormField now sets native required; the preview checkbox is also required. Assistive technology can identify mandatory controls. | Compare FormField at `cb31dc9` and `bcd1b37`; O: Signup required states now announced. No historical failed utterance supplied. |
| Foundation submission had no field-specific validation, invalid-state association or first-invalid-field focus. | Inline words/caution icons, aria-invalid, current aria-describedby IDs, correction clearing, invalid-field focus and one polite summary provide actionable feedback. | AuthForm/FormField committed comparison and current tests; O: Signup errors and Reset focus/warning passed. These related mechanisms are one connected improvement, not four separate defects. |
| The earlier intermediate draft preview displayed raw Markdown in pre instead of navigable document structure. | Semantic headings, paragraphs, lists, links and scoped table headers support structured reading; conditional views manage focus and hide inactive controls. | Historical audit/Terms record describes the intermediate pre version; current renderer is committed in `bcd1b37`. No independent original document-reading failure or exact comparative speech was supplied. |

The foundation intentionally contained no full validation. Its missing capabilities are source-backed historical
limitations, not evidence that an owner encountered a screen-reader failure at that time.
Labels, basic focus CSS and the polite unavailable-action region already existed; I do not claim they were all newly added.

<a id="implemented-conditional-signup-document-views---27-october-2026"></a>

**Semantic document correction.** [DraftDocument](../../app/%28auth%29/_components/DraftDocument.tsx) and the
[bounded parser](../../lib/auth/draft-document.ts) render unchanged trusted v0.2 text as semantic HTML.
Public citations retain destinations and announce new-tab behaviour; repository-only references stay plain text.
The [Terms controls](../../app/%28auth%29/_components/TermsPreview.tsx) are outside the checkbox label,
so opening either document does not toggle acknowledgement.

[AuthScreen](../../app/%28auth%29/auth/AuthScreen.tsx) keeps the form mounted under native hidden while a document is open.
The inactive form is absent from visual/accessibility navigation; values, acknowledgement and validation remain in memory.
Opening focuses the document H1; Back restores the initiating control without a new route or document reload.
Automated checks verified these behaviours, source-text preservation, semantic tables/links and 375/768/1440px layouts.
Owner-reported heading/reading successes confirm current usability, not a retrospectively proven original reading failure.

**Submit-button improvement.** The owner preserved [hidden-button evidence 13](../evidence/13-button-hidden-version.png)
and [visible-disabled evidence 14](../evidence/14-button-disabled-version.png).
The historical hidden action was undiscoverable while incomplete; the final visible button remains focusable after hydration.
aria-disabled communicates incompleteness while the shared handler prevents native submission, provides errors and focuses
the first invalid field. A valid local attempt reports only that account creation is unavailable.
The pre-hydration/no-JavaScript disabled fieldset remains. This deliberate assessment comparison is not four defects.

No additional screen-reader failure is confirmed. Earlier concerns about notification timing, repeated submissions
and the initial disabled-button explanation remain unverified, not approved fixes.
The successful Signup warnings and Reset focus result must not be relabelled as defects.

## 4. Narrator observations and comparative evidence

The table preserves reported behaviours, not quotations. “Before” means the owner-tested interface before the
conditional-document change; it does not imply a Narrator baseline was captured for the original foundation.
The owner reconfirmed the earlier Signup errors, password controls, required/checkbox states and Reset warning successes.

| Phase / user action | Exact Narrator announcement | Focus behaviour | Outcome / provenance |
| --- | --- | --- | --- |
| Before, reconfirmed: encounter Signup Email/Password, required states and validation errors. | Not supplied; owner paraphrase only. | Exact blur/typing/submit sequence not supplied. | O: fields recognized; required/error announcements passed. |
| Before, reconfirmed: type a masked synthetic password; reveal and hide it. | Not supplied; do not infer full speech from button labels. | Exact per-route focus sequence not supplied. | O: masked characters, then displayed characters, were read; Show/Hide controls announced. |
| Before: encounter the former Terms/Privacy disclosures. | Not supplied. | Exact body-navigation position not supplied. | O: controls recognized; no original structural-navigation failure established. |
| Before, reconfirmed: check/uncheck draft acknowledgement. | Not supplied. | Precise focus sequence not supplied. | O: required and checked/unchecked states announced. |
| Before: encounter Create account and Login link. | Not supplied. | Exact activation sequence not supplied. | O: both recognized; not proof of every disabled-state announcement. |
| Before, reconfirmed: submit invalid Reset email. | Not supplied; value/warning paraphrased. | O: focus returned to Email. | O: input value and warning announced successfully. |
| Before and after: Tab past ordinary prose. | Not supplied; silence is not invented as a quotation. | O: Tab traversed interactive controls rather than paragraphs. | Expected behaviour, not a defect. |
| After: open each Terms/Privacy conditional view. | Not supplied. | O: headings announced; A: H1 focus verified. | O: controls and both document headings recognized. |
| After: read using Insert + Down Arrow. | Not supplied; no verbatim document-reading transcript. | Exact reading positions not supplied. | O: continuous document reading passed. |
| After: activate Back to Signup. | Not supplied. | O: Back works; A: initiating-control focus restored. | O: successful return; precise Narrator return-focus announcement remains unreported. |

No exact historical or current utterances have been supplied. Source labels, HTML and ScreenPal's AI summary
cannot fill those cells. Recover genuine quotations/timestamps from existing recordings where available;
a current test cannot recreate missing historical speech. Use synthetic values and distinguish paraphrases from quotations.

The owner's separate Chrome checks confirm Login password-toggle keyboard operation and responsive/error layouts;
they are not a complete Login-specific Narrator transcript.
Prior automated document checks covered Enter/Space/mouse actions, independent checkbox operation, focus/state
restoration, no local application writes, no tested password storage and JavaScript-disabled inert controls.
They did not audit every network request or speak through Narrator.

## 5. Assessment status and remaining limitations

| Requirement | Status |
| --- | --- |
| Required Markdown audit and all five criteria across Signup/Login/Reset and relevant controls | Satisfied as an evidence-qualified source/control review; unverified manual details are marked above. |
| Genuine owner observations, source history and implemented corrections | Recorded with separate manual/automated provenance. No WCAG certification claimed. |
| Exact before/after Narrator transcripts | Incomplete: behavioural comparisons exist, but exact historical/current speech and test metadata are missing. |
| Four independently confirmed-and-fixed accessibility issues | Not established. Related validation mechanisms and the deliberate button experiment must not be counted automatically as independent defects. |
| Regression evidence | Prior component/validation, HTTP/RSC, Chrome, typecheck and build passes are recorded in the linked implementation records; no rerun is claimed for this edit. |
| Optional recordings | `evidence/11-screenreader-before.mp3` and `evidence/12-screenreader-after.mp3` were not present. Optional, not mandatory; ScreenPal is not relabelled as either file. |

The smallest remaining evidence work is:

1. Add exact action/key sequences, spoken words, focus outcomes and timestamps from genuine available recordings,
   with actual environment/settings and revision. Preserve the reported passes; do not repeat them merely to fill a table.
2. Resolve only missing coverage: a distinct Login Narrator record and the unreported document heading/table
   navigation and precise Back-focus announcement. Record results without assuming they will reveal defects.
3. Keep the four-issue shortfall explicit with the owner/assessor. If a new genuine issue is demonstrated,
   record its baseline, obtain approval for a minimal correction and compare the same case afterward.
   Do not reconstruct broken UI, count speculative concerns or invent failures to meet the number.

Supporting records: [field justification](field-justification.md), [validation rules](validation-rules.md),
[Terms note](terms-note.md) and [consolidation history](spa-rationale.md).
Earlier pending statements in those records describe their own historical stages; this audit retains the later owner reports.
Reference guidance: [W3C form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/),
[information and relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) and
[keyboard focus for disabled controls](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#focusability-of-disabled-controls).

This revision changes only this audit. Local links, the retained incoming anchor, whitespace and changed-file scope
are checked separately; no application test, screenshot, recording or transcript was created for the revision.
The PRD, code, legal sources and historical evidence remain unchanged. Step 6 is not claimed fully complete.

Assumptions: none.
