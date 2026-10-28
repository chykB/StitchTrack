# Task Four Step 5: email normalization and password-trimming comparison

**Prepared for owner review. Evidence 09/10 has not been captured.** This follows the Step 5 requirements supplied by the owner; the assessment PDF is unavailable. [PRD](../../docs/PRD.md) is read-only. Steps 1-4 are not repeated; [Evidence 06](../evidence/06-drift-error.txt) is completed at ca554f1 and preserved.

## Existing product behaviour

[Shared Zod schemas](../../lib/auth/schemas.ts) already canonicalize Email with trim().toLowerCase() in Signup, Login and Reset. They reject the existing invalid formats and return the canonical address in parsed data. The [UI reducer](../../lib/auth/validation.ts) keeps the raw typed value; this experiment does not change it. Provider-specific changes such as removing Gmail dots/plus tags or rewriting domains are not applied.

Inputs that differ only in supported surrounding whitespace and letter case have the same canonical value under this policy. This is not proof of mailbox ownership, delivery, account existence or permission to link client records across businesses. Whole-address lowercasing can conflate mailboxes on unusual case-sensitive systems; that is an existing approved trade-off, not new provider knowledge. Future server boundaries must consistently consume successful parsed output in registration, login and reset, while preserving verified invitations and business authorization.

Signup and Login preserve accepted password strings exactly, including case, Unicode representation and meaningful spaces. Signup retains the current 12-Unicode-code-point minimum, nonblank/control-character rules and no arbitrary maximum. Login retains presence-only validation rather than reapplying enrollment rules to an existing credential. **Consistency means neither flow transforms the credential; their existing enrollment/presence checks are intentionally different.** A nonempty Login value passing syntax checks is not a successful sign-in. Real backend verification is not implemented.

The [hashing primitive](../../lib/auth/password.server.ts) also preserves characters. It is not modified or invoked by this comparison. No benchmarks, database records, sessions, SMTP or authentication requests are involved.

## Explicit assessment/product conflict

The owner's supplied assessment Step 5 requires trimming leading/trailing password whitespace. The approved StitchTrack policy preserves the exact accepted password. The PRD defines secure server validation and authentication, but does not itself prescribe silent password trimming; exact preservation is an established owner-approved security decision reflected in current schemas and hashing utilities.

This slice demonstrates trim on isolated synthetic strings only. It does **not** satisfy a literal requirement to trim passwords in actual registration/login. If the assessor requires that implementation, record the divergence and obtain an accepted exception or a separately approved, coordinated product-policy decision; do not silently change registration, login or hashing. This assessment requirement remains qualified/pending assessor review, even after a genuine screenshot of the comparison exists.

## Executable experiment and what it shows

[comparison.ts](../experiments/normalization/comparison.ts) imports the real shared schemas; it does not duplicate email canonicalization. [demo.mjs](../experiments/normalization/demo.mjs) is an explicitly enabled, production-off CLI outside the application import graph. It accepts only two fixed modes, no user-supplied email/password arguments, stdin values or credential configuration. Its fixtures use synthetic labels and reserved example.invalid addresses.

| Evidence | Prepared executable comparison | Interpretation |
| --- | --- | --- |
| 09 | Lowercase, mixed-case, ASCII-edge-space, tab/line-break-edge and Unicode-edge-whitespace versions of one synthetic address, parsed through Signup/Login/Reset. | Display escaped raw input, canonical address, cross-flow agreement, unchanged raw input and idempotence. No account is created or looked up. |
| 10 | No edge whitespace; leading, trailing and both-edge spaces; internal spaces; whitespace-only; 12-to-10-code-point boundary; Unicode edge whitespace. | Display only lengths, validation outcomes, preservation booleans and equality comparisons. No password value or hash is printed. |

The isolated password experiment explicitly calls trim() on a separate string for comparison. It shows that distinct edge-space strings can become equal, internal spaces remain, and removing two edge spaces can reduce a currently valid 12-code-point password below the minimum. Whitespace-only input is rejected for Signup; Login's presence-only parser does not authenticate it. Composed/decomposed Unicode and case-preservation comparisons return booleans without exposing their strings. JavaScript trim semantics are not Unicode normalization.

Equality after trimming demonstrates information loss, not a successful password check or a hash collision. Consistently trimming both registration and login would still discard intentionally chosen characters. Trimming only one flow can make an otherwise correct credential fail to match. Product behaviour remains unchanged in both flows.

## Owner evidence capture after review

No environment credentials, database URL, running server, client generation or dependency installation is required. In WSL, use existing Node 24. Before running, close unrelated terminals showing secrets. The commands below print only fixed synthetic email examples and password scenario metadata. Do not supply real credentials or replace fixtures with personal data.

For Evidence 09, run:

```bash
cd /home/bmalik/stitchtrack
TASK04_NORMALIZATION_EXPERIMENT=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/normalization/demo.mjs --email
printf 'email_demo_exit_status=%s\n' "$?"
```

Capture a genuine PNG of the command, complete readable table, equivalence result and actual exit status. Use task-04-server-security/evidence/09-email-normalization.png. Raw inputs are JSON-escaped so surrounding spaces/tabs are identifiable. Widen the terminal or adjust font size before capture; do not reconstruct or edit output to fit.

For Evidence 10, run separately:

```bash
cd /home/bmalik/stitchtrack
TASK04_NORMALIZATION_EXPERIMENT=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/normalization/demo.mjs --password-trim
printf 'password_comparison_exit_status=%s\n' "$?"
```

Capture the command, readable comparison rows, product-policy limitation and actual status as task-04-server-security/evidence/10-password-trimming-experiment.png. If a complete readable view requires an additional screenshot, retain the primary PNG and add a clearly named supplement; do not overwrite existing evidence or simulate a terminal image. These are descriptive filenames for the owner-supplied Evidence 09/10 PNG requirements, not a claim to have read unseen PDF filenames.

If either command fails, retain the actual output and investigate; do not label it successful or claim that a prepared result was observed. Neither PNG exists as part of this preparation. Terminal screenshots show an isolated executable demonstration, not a browser registration or a server endpoint. Owner observations and assessor acceptance remain pending.

## Offline verification and limits

Focused tests execute the comparison with the real Zod schemas, test canonicalization/equivalence, malformed formats, provider-independent handling, password preservation, case/Unicode, length/whitespace effects and report redaction. Existing shared-schema/UI-validation tests are also run. Test report output is mocked; the owner CLI and screenshot capture are not executed by the agent.

Product schemas, hashing code, form components, database records and completed evidence remain unchanged. There are no package changes, database operations or authentication integrations in this slice. These tests establish the parsed-string behaviour only; real registration/login/reset server boundaries, lookup uniqueness and authenticated password verification remain future work.
