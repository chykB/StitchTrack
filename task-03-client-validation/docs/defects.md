# Task Three: defects, corrections and verification limits

Reviewed against committed HEAD `c1e6180` on `feat/task-03-auth-foundation`.
I used source history, current tests, owner observations and existing investigation records. This is not a new browser test or production incident report. Authentication remains UI-only.

## 1. Unsupported auth queries silently selected Login

- **Problem:** the first consolidation displayed Login for unsupported mode parameters instead of rejecting them.
- **Discovery:** owner manual testing found examples such as `/auth?mode=forgot-password` and an arbitrary mode value. The [consolidation record](spa-rationale.md) preserves that report.
- **Impact:** a malformed link appeared to be a valid Login state, concealing navigation mistakes. This was local development behaviour; no account was authenticated.
- **Correction / status:** **resolved**. [The resolver](../../lib/auth/state.ts) now permits the explicit key-only contract; [proxy.ts](../../proxy.ts) rejects invalid requests before streaming, and [the server page](../../app/%28auth%29/auth/page.tsx) rechecks defensively. The later guarded verify state is explicit, not a fallback.
- **Evidence:** [HTTP/RSC route tests](../../tests/auth-foundation/routes.test.mjs), [state tests](../../tests/auth-foundation/state.test.mjs), [recorded responses](../evidence/04-form-switch-logs.txt) and consolidation commit `84dc8f1`. Tests cover unknown, duplicate, conflicting and valued keys, plus caller-supplied state-header replacement.

## 2. Foundation lacked programmatic required states and actionable field feedback

- **Problem:** FormField at `cb31dc9` had labels but no native required attribute or field-error associations. The original AuthForm prevented submission and showed only the unavailable-action message; it did not identify invalid fields.
- **Discovery:** comparison of the committed foundation with checkpoint `bcd1b37`, supported by the [validation baseline](validation-rules.md).
- **Impact:** the foundation could not programmatically communicate mandatory fields or explain which input needed correction. Full validation was intentionally deferred then; I do not invent an observed Narrator failure from that limited milestone.
- **Correction / status:** **implemented improvement**. [FormField](../../app/%28auth%29/_components/FormField.tsx) now exposes required state, text/caution feedback and current aria-invalid/aria-describedby associations. [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) focuses the first invalid control and uses one polite summary.
- **Evidence:** [component tests](../../tests/auth-validation/components.test.mjs), [rule tests](../../tests/auth-validation/validation.test.mjs), [required-error capture](../evidence/05-empty-field-error.png) and [owner observations in the audit](accessibility-audit.md). Reset focus/warning and Signup required/error announcements passed according to the owner.

These are connected validation/accessibility mechanisms, not automatically several independent confirmed defects. Exact historical speech and the assessment's four-issue requirement remain incomplete.

## 3. Intermediate legal preview exposed Markdown syntax instead of semantic structure

- **Problem:** the earlier intermediate preview rendered complete draft documents inside pre. Heading, list and table syntax remained text rather than navigable HTML structure.
- **Discovery:** the historical implementation records describe the raw rendering; the [current audit](accessibility-audit.md) distinguishes that source limitation from an unproven original reading failure. No exact historical commit is supplied for that intermediate state; the record is not presented as a recovered Git snapshot.
- **Impact:** document structure was unavailable to semantic navigation. This does not mean the text was unreadable, or that Tab should have visited ordinary paragraphs.
- **Correction / status:** **implemented; comparative spoken evidence incomplete**. [DraftDocument](../../app/%28auth%29/_components/DraftDocument.tsx) and [its bounded parser](../../lib/auth/draft-document.ts) produce semantic headings, paragraphs, lists, links and scoped table headers. Conditional views focus the heading and restore the initiating action on return.
- **Evidence:** [rendering tests](../../tests/auth-validation/documents.test.mjs), [Chrome focus/state checks](../../tests/auth-foundation/documents.browser.test.mjs), [Terms history](terms-note.md) and the owner's reported current heading announcements, continuous reading and working Back control. The legal source text was preserved.

I do not count each semantic element as a separate defect, infer an earlier Narrator failure, or present this as completed WCAG certification.

## 4. RSC recorder incorrectly expected an immediate HTTP 200

- **Problem:** an ad-hoc verification recorder treated a synthetic RSC cache-key request's HTTP 307 as a failed expectation.
- **Discovery:** the actual protocol response differed from the recorder's assumption.
- **Impact:** this was a **verification false negative**, not evidence of broken customer navigation or a full-document reload.
- **Correction / status:** **resolved in the recorder**. It recorded the same-origin redirect hops and final responses. No application change was required for that recorder correction.
- **Evidence:** the PROBE NOTE and request rows in [04-form-switch-logs.txt](../evidence/04-form-switch-logs.txt), plus the [consolidation investigation](spa-rationale.md).

Valid RSC queries use a transport representation different from public key-only URLs. Current policy/tests handle that explicitly. Recorded malformed RSC 404s are expected rejections; the available evidence does not establish an additional unfixed legitimate-navigation block. The [owner's document-marker and history test](../evidence/05-browser-navigation-verification.txt) subsequently passed.

## 5. Stale generated route types blocked typechecking after cleanup

- **Problem:** after the obsolete code-input page was deleted, a generated Next.js validator still imported that removed route.
- **Discovery:** the cleanup typecheck failed, as recorded in [numeric-input.md](numeric-input.md#cleanup-verification).
- **Impact:** verification could not finish even though that route was intentionally removed. No authentication or database behaviour failed.
- **Correction / status:** **resolved** by running the installed Next.js typegen command, followed by successful typecheck and build. The application route was not restored to satisfy stale generated files.
- **Evidence:** the cleanup report records the initial failure, command and passing rerun; current [verification route tests](../../tests/email-verification/routes.test.mjs) assert the retired path remains 404. Generated files are not treated as historical source evidence.

The same record reports an initially interrupted flag-off HTTP run caused by restarting its test server prematurely. That run was not claimed successful; a completed rerun passed all five checks.

## Verification-environment failures, not product outages

Earlier [consolidation verification](spa-rationale.md) could not initialize browser automation because the Windows sandbox helper failed. The [foundation record](auth-foundation.md) also describes a temporary Windows-hosted test proxy timeout that was resolved by running the fixture in WSL. These failures limited what could be claimed then; they were not authentication defects.

Later [security verification](client-side-is-not-security.md#automated-verification-actually-completed) records genuine isolated Chrome attack and document/verification regression passes. I use those newer results without rewriting earlier failed attempts as passes. Browser automation remains separate from actual Narrator speech and broad browser compatibility.

## Controlled experiments, not accidental defects

| Exercise | Genuine observation and correction | Classification / evidence |
| --- | --- | --- |
| Native number input for a verification identifier | Owner observed `004281` with spinners; native adjustment changed it to `4280`. The corrected text input preserved zeros and Arrow keys did not change the value. | Deliberately authorized temporary mismatch, not a Chrome bug or production regression. [Completed six-image comparison](numeric-input.md#genuine-before-and-after-evidence). |
| Hidden Signup submit | An incomplete form's action could not be discovered/focused while hidden. Final design keeps it visible and focusable with aria-disabled and guarded validation feedback. | Deliberate assessment comparison. [Evidence 13](../evidence/13-button-hidden-version.png), [14](../evidence/14-button-disabled-version.png), [Terms record](terms-note.md#stage-two-visible-focusable-guarded-button). Not four independent accessibility fixes. |
| Direct malformed HTTP payload | Browser rejected the fixed pair; the opt-in synthetic fixture returned 200 acknowledging that exact pair without creating anything. | Intended fixture behaviour, not an insecure real registration endpoint. [Evidence 15](../evidence/15-form-attack-results.txt), [16](../evidence/16-direct-request-command-and-response.txt). |
| Git rollback | A temporary note was added and reverted; the development checkpoint remained. | Controlled Git exercise, not recovery from a broken production release. [Rollback](rollback.md), [evidence 17](../evidence/17-commit-list-and-rollback.txt). |

## Open limitations and risks, not reproduced bugs

- **Accessibility evidence:** four independently confirmed-and-fixed issues and exact comparative transcripts remain unestablished. Existing passes stay passes; the shortened audit is authoritative for the reported scope.
- **Input-policy compatibility:** coarse email syntax can accept unusable addresses; localized digit glyphs are rejected; very large password inputs have no client maximum. [Rules and trade-offs](validation-rules.md) and [attack results](../evidence/15-form-attack-results.txt) document the actual limits. No backend resource-exhaustion incident or account compromise was tested.
- **Future server enforcement:** real registration, verification, recovery and sessions do not exist. Missing future workflows are not classified as defects in the approved UI-only slice. Task Four must establish compatible bounds, authoritative validation and account/business authorization.
- **Legal release:** the checkbox acknowledges unapproved drafts only. Approved Terms acceptance and publication remain incomplete, not silently implemented.
- **Remaining manual coverage:** scoped Chrome/Narrator successes do not establish autofill, all devices, comprehensive contrast/zoom or all network behaviour.

This report proposes no new fix and changes no application, legal source or historical evidence.

Assumptions: none.
