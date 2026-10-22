# StitchTrack — AI Agent Prompt Log

## Purpose

This document records the prompts used during Task One to convert Figma design tokens, build the comparison interface, verify implementation decisions, and demonstrate a broken design-token reference.

The prompts are kept in their original wording where available. Failed or incomplete attempts are included because they explain how the implementation was corrected.

---

## Prompt 1: Convert the Complete Token Export

**Objective:** Generate CSS variables from the complete Figma token export using JavaScript.

**Prompt:**

> Convert StitchTrack's Figma design tokens into reusable CSS variables.
>
> **Source file:** `task-01-design-system/evidence/06-tokens-complete.json`
>
> **Important:** Use ONLY the complete token export. Do not use, modify, or convert `05-tokens-incomplete.json`, which is preserved as assessment evidence.
>
> ### Requirements
>
> 1. Inspect the complete JSON structure before writing code.
> 2. Create a **JavaScript (.mjs) script** at `task-01-design-system/scripts/build-tokens.mjs` using Node.js.
> 3. Convert the exported colour primitives, semantic colour roles, 15 typography styles, and three shadows into valid CSS custom properties.
> 4. Preserve semantic colour references using `var()` rather than replacing them with hardcoded hex values.
> 5. Use StitchTrack's custom colour-variable collections as the source of truth, not the older Material-generated colour styles.
> 6. Preserve the actual typography values, including DM Sans, line heights, and letter spacing, and the exported shadow colours and opacity.
> 7. Write the generated CSS to `task-01-design-system/assets/stitchtrack-tokens.css`.
> 8. Add focused JavaScript tests for token counts, reference resolution, value conversion, and repeatable output.
>
> ### Constraints
>
> - Do not modify either JSON export.
> - Do not scaffold the application or create UI components.
> - Avoid unnecessary dependencies.
> - Do not commit automatically.
>
> Run the script and tests, then report the files created, token counts, test results, any conversion issues, and the commands needed to regenerate the CSS.

**Observed result:** The agent created the JavaScript converter, generated 374 CSS custom properties, and reported 11 passing tests.

**Evidence:** `scripts/build-tokens.mjs`, `assets/stitchtrack-tokens.css`, `tests/build-tokens.test.mjs`, and `evidence/token-conversion-tests.txt`.

---

## Prompt 2: Build the Dashboard Without the Design System

**Objective:** Produce the baseline interface for a before-and-after comparison.

**Prompt:**

> Create one standalone, responsive StitchTrack order-overview screen for Task One's before-and-after design-system experiment.
>
> Show a small tailoring business dashboard with garment orders, delivery dates, approval statuses, and outstanding balances. Use realistic sample data.
>
> For this first version, do not inspect or apply the existing StitchTrack design tokens, typography styles, or shadow definitions.
>
> Keep the implementation minimal, in `task-01-design-system/preview/`, using static HTML and CSS. Do not scaffold Next.js, implement authentication, connect a database, or build additional features.
>
> Run the screen locally and report how to open it in the browser. Do not commit changes automatically.

**Observed result:** The agent created a responsive order-overview screen with generic styling.

**Evidence:** `evidence/09-screen-without-system.png`.

---

## Prompt 3: Apply the Approved Design System

**Objective:** Restyle the same dashboard using generated tokens.

**Prompt:**

> Update the existing StitchTrack dashboard in `task-01-design-system/preview/` to use our approved design system.
>
> Use `task-01-design-system/assets/stitchtrack-tokens.css` as the source of truth.
>
> Requirements:
>
> 1. Import and apply the generated CSS tokens correctly.
> 2. Replace generic colours with StitchTrack's Tailored Wine semantic colour roles.
> 3. Apply the approved DM Sans typography tokens and load the font.
> 4. Apply Soft, Medium and Hard shadow tokens where appropriate.
> 5. Use semantic CSS variables in components, not hardcoded colours or primitive values.
> 6. Preserve the existing layout, sample data and responsiveness.
> 7. Verify that the design-system CSS actually loads and the browser visibly reflects its colours, typography and shadows.
>
> Do not modify the JSON exports, token generator or generated CSS. Do not scaffold the application or commit changes.
>
> Report the files changed, tokens used, verification results and any remaining hardcoded colour values.

**Observed result:** The agent reported applying 69 tokens. The updated screen showed Tailored Wine colours, DM Sans typography, and the approved shadow styles.

**Evidence:** `evidence/10-screen-with-system.png` and `preview/styles.css`.

---

## Prompt 4: Verify the Typography Decision

**Objective:** Check whether the agent could trace a rendered heading to the actual design tokens.

**Prompt:**

> Which exact StitchTrack typography style is used for the "Order overview" heading?
>
> Identify the CSS selector, the typography variables it uses, and the source style from the exported design tokens. Verify the answer against the actual code rather than guessing. Do not modify any files.

**Observed result:** The agent identified Headline / Large for desktop and Headline / Medium at 420px and below. It also reported the corresponding CSS selectors and exported values.

**Evidence:** `evidence/08-agent-typography-answer.txt`.

---

## Prompt 5: Initial Broken-Reference Experiment

**Objective:** Demonstrate a colour inconsistency on a temporary Git branch.

**Prompt:**

> Perform a controlled broken-token referencing experiment for StitchTrack Task One.
>
> Work ONLY on the existing `experiment/broken-token-reference` branch. Verify the branch before modifying anything.
>
> 1. Find a prominent dashboard component that currently uses `--stitchtrack-color-primary`.
> 2. Replace that component's semantic colour reference with the original hardcoded wine colour `#8d4962`.
> 3. In `evidence/06-tokens-complete.json`, temporarily change the source primitive `stitchtrack primitives.primary.40.value` from `#8d4962ff` to `#3c6f8aff`.
> 4. Regenerate the CSS using the existing JavaScript token conversion script.
> 5. Verify that components using semantic primary colour references update to the new colour, while the hardcoded component remains wine.
> 6. Keep the layout, sample data, typography and other styles unchanged.
>
> This experiment must not affect `main`. Do not modify the conversion script or tests, and do not commit, merge, delete branches or restore files automatically.
>
> Report the files changed, exact component and CSS declaration, before-and-after primary values, and how to view the inconsistency in the browser.

**Initial obstacle:** The agent found that `main` was active and the requested experiment branch did not exist. It stopped without modifying files.

After creating the branch, I sent a continuation instruction.

**Follow-up prompt:**

> I've created and switched to `experiment/broken-token-reference`.
>
> Please verify the active branch and proceed with the previously provided broken-token experiment.
>
> Use the `.brand` selector you identified. Make all experimental changes only on this branch, regenerate the CSS, and verify the visible colour inconsistency.
>
> Do not commit, merge, delete branches, or restore files. Report your changes and verification results.

**Unsuccessful result:** The agent changed `.brand` to reference a misspelled CSS variable, `--stitchtrack-color-prmary`. This caused the wordmark to inherit a dark text colour but did not demonstrate the requested hardcoded-colour problem.

---

## Prompt 6: Correct the Initial Experiment

**Objective:** Replace the misspelled-variable experiment with an actual raw-colour regression.

**Prompt:**

> The previous experiment used a misspelled CSS variable, but I need to demonstrate the problem with hardcoded colours.
>
> On `experiment/broken-token-reference` only:
>
> 1. In `preview/styles.css`, change `.brand` to use the literal `#8d4962` instead of any semantic colour variable.
> 2. In `evidence/06-tokens-complete.json`, change `stitchtrack primitives.primary.40.value` from `#8d4962ff` to `#3c6f8aff`.
> 3. Regenerate `assets/stitchtrack-tokens.css` using the existing JavaScript script.
> 4. Verify that `.brand` remains wine while `.brand-mark`, which uses the semantic primary token, changes to the new blue colour.
> 5. Preserve the existing layout and sample data.
>
> Do not change the generator, tests, or original incomplete JSON. Do not commit, switch branches, merge, or restore files.
>
> Report the actual CSS declarations and computed browser colours.

**Observed result:** This demonstrated that a component with a hardcoded colour did not respond to a palette change.

**Limitation:** Reviewing the assessment afterward revealed that it specifically required breaking a **semantic role's palette reference**, rather than a component's reference. A separate corrective experiment was therefore necessary.

---

## Prompt 7: Correct the Experiment to Match the Assessment

**Objective:** Replace a semantic colour role's primitive alias with a raw colour value.

**Prompt:**

> Correct the StitchTrack Task One, Step 8 regression experiment.
>
> First verify that the active Git branch is `experiment/raw-role-reference`. Do not proceed on `main`.
>
> In `task-01-design-system/`:
>
> 1. Inspect `evidence/06-tokens-complete.json`.
> 2. Change the semantic `roles.primary.value` in the `stitchtrack color roles` collection from its primitive alias to the raw colour `#8d4962ff`.
> 3. Change the source primitive `stitchtrack primitives.primary.40.value` from `#8d4962ff` to `#3c6f8aff`.
> 4. Keep the `surface tint` semantic role referencing the Primary/40 primitive.
> 5. In `preview/styles.css`, keep `.brand` using `var(--stitchtrack-color-primary)`, but temporarily make `.brand-mark` use `var(--stitchtrack-color-surface-tint)` as its background.
> 6. Regenerate the CSS with the existing JavaScript conversion script. Do not manually edit generated CSS.
>
> Verify in the browser that the StitchTrack wordmark remains wine because its semantic role is hardcoded, while the ST badge changes to blue because its role still references the palette.
>
> Do not modify the generator, tests, incomplete export, or unrelated files. Do not commit, merge, switch branches, or delete anything.
>
> If the converter rejects the raw role value, report the error without changing the generator.
>
> Report all changes, relevant generated CSS declarations, and computed browser colours.

**Observed result:** The converter accepted the raw role value. The Primary role stayed wine, while Surface Tint followed the changed blue primitive.

The corrected experiment was committed on a separate branch. The branch was subsequently deleted without merging, and the evidence was retained on `main`.

**Evidence:** `evidence/11-broken-referencing.png` and `evidence/12-git-log-branch-unmerged.txt`.

---

## Lessons From the Prompting Process

The token-conversion task benefited from explicit file paths, output constraints, and instructions to preserve semantic references.

The first Git experiment also showed why prompt verification matters. A visually different result did not necessarily prove the intended design-system failure. Comparing the agent's changes with the assessment wording led to the corrected semantic-role experiment.

The final process preserved the working design system while retaining evidence of the deliberate regression.

## Record Completeness

This log reproduces prompts available from the project discussion. Before submission, compare each entry against the actual coding-agent conversation and replace any wording that was edited before execution.

Any additional prompts used during the earlier Figma palette generation, typography testing, or shadow creation should be added from their original records rather than reconstructed from memory.
