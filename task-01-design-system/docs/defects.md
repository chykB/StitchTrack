# StitchTrack — Defects and Resolutions

## Purpose

This document records defects and workflow problems encountered while implementing and testing the StitchTrack design system.

The problems were identified during Task One. The deliberately introduced regressions were isolated on Git experiment branches and were not merged into `main`.

## 1. Invalid CSS Variable Reference

**Location:** `preview/styles.css`, `.brand` selector during the first experimental branch.

**Problem:** The coding agent referenced `--stitchtrack-color-prmary` instead of `--stitchtrack-color-primary`.

**Observed behaviour:** The StitchTrack wordmark inherited the dark body-text colour while the ST logo retained the primary wine colour.

**Why it matters:** A misspelled CSS custom property can cause styling to fall back or become invalid. In a production interface, this could introduce inconsistent branding or make important text difficult to read.

**Resolution:** We identified the incorrect variable and replaced the approach with the intended controlled regression. The invalid reference was not merged into `main`.

## 2. False Positives in Raw-Colour Search

**Location:** `evidence/07-raw-value-search.txt` and `preview/index.html`.

**Problem:** The initial regular expression identified the HTML character reference `&#8358;`, which represents the naira symbol (₦), as a hexadecimal colour.

**Observed behaviour:** The search reported nine matches in the order dashboard even though they were currency characters rather than hardcoded CSS colours.

**Why it matters:** Incorrect static-analysis results can send developers looking for defects that do not exist. They can also make assessment or CI evidence misleading.

**Resolution:** I refined the search expression to exclude HTML character references and expanded the audit to the project codebase. The corrected results found raw colour values in the generated token stylesheet and test code, but none in the dashboard's scanned HTML or CSS.

## 3. Regression Test Did Not Match the Requirement

**Location:** First `experiment/broken-token-reference` branch.

**Problem:** The initial corrected experiment replaced a component's semantic colour variable with a raw hex value. Although it demonstrated inconsistent colours, the assessment specifically required breaking the reference inside a semantic colour role.

**Why it matters:** A test can produce a convincing visual result while failing to exercise the intended failure mechanism. In production engineering, this could lead to false confidence in the coverage of an automated or manual test.

**Resolution:** I repeated only the regression experiment using the correct method. On `experiment/raw-role-reference`, the Primary semantic role was changed to a raw wine value while the Primary/40 primitive was changed to blue.

The wordmark remained wine, whereas the badge followed the palette through Surface Tint. This demonstrated the requested failure at the semantic-role level.

**Evidence:** `11-broken-referencing.png` and `12-git-log-branch-unmerged.txt`.

## 4. Screenshot Evidence Accidentally Emptied

**Location:** `evidence/11-broken-referencing.png`.

**Problem:** A Git command attempted to extract a screenshot from a filename that did not exist in the experimental commit. Its shell output redirection created an empty replacement file before Git reported the error.

**Observed behaviour:** The screenshot became a 0-byte file, despite its filename still being present in the project.

**Why it matters:** File existence alone does not prove that an artifact is valid. The same mistake in an automated workflow could destroy evidence or produce unusable files.

**Resolution:** I recaptured the correct browser screenshot, verified that it was a valid PNG, and committed it on the experimental branch. I then used `git restore --source` to copy that specific screenshot to `main` without transferring the broken code.

## Final Verification

The corrected design-system implementation remains on `main`.

The technical checks established that:

- The token converter generated 374 CSS custom properties.
- The JavaScript test suite reported 11 passing tests.
- The raw-colour audit found no hardcoded hex, RGB, or HSL colours in the dashboard's scanned HTML and CSS.
- The deliberate semantic-role regression was committed separately and never merged into `main`.
- The corrected screenshot and Git evidence were preserved in the final evidence commit, `2d2f0e3`.

These findings describe the problems observed during Task One. They do not establish that the broader StitchTrack application is free of defects, since the complete application has not yet been implemented or tested.