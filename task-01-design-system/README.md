# Task One — StitchTrack Design System

## What This Task Was About

The goal was to create a design system in Figma, convert it into code, and prove that a coding agent actually used it.

I used StitchTrack, a tailoring order and agreement management product, as the project.

The key business concern is making garment commitments, delivery dates, and approved changes easier for small tailoring studios to track.

## What I Built

I created a Tailored Wine colour system, 15 typography styles using DM Sans, and three brand-coloured shadows.

The colour system separates primitive values from semantic roles so that interface components reference colours by their purpose rather than using raw hex values.

I exported the design tokens from Figma and instructed a coding agent to create a JavaScript conversion script.

The resulting CSS includes:

- 149 colour primitives
- 57 semantic colour roles
- 165 typography properties across 15 text styles
- 3 shadow properties

That is **374 CSS custom properties** in total.

The conversion script has 11 automated tests, with results preserved in the evidence folder.

I also built a static order-overview dashboard twice: first without the design system, then with the approved StitchTrack tokens.

## Decisions I Made

**Colour:** I used a Tailored Wine direction based on the source colour `#74344D`. The generated Primary/40 value is `#8D4962`. Separate palettes handle success, warning, and error states.

**Typography:** I compared DM Sans, Manrope, and Plus Jakarta Sans. I selected DM Sans for its appearance in compact order information, dates, amounts, and labels.

**Line height:** Heading styles use a 1.4 multiplier, while body and label styles use 1.5.

**Shadows:** I used the primary wine colour instead of black to make elevation feel consistent with the interface.

**Implementation:** Components consume semantic colour variables. The complete token JSON is converted into CSS through a repeatable JavaScript script rather than manually copying values.

## What Went Wrong

The first token export omitted Figma's custom variable collections because the variable-export option was not included.

The corrected export contained the missing primitives and semantic roles. Both exports were retained as evidence.

During verification, the initial colour-search command also incorrectly matched naira HTML character references as hexadecimal colours. I corrected the search and retained the full final results.

An early regression experiment tested the wrong failure mechanism. I repeated it by replacing a semantic role's primitive reference with a raw hex value, then changing the source palette.

The corrected experiment showed that properly referenced elements updated while the disconnected semantic role retained its old colour.

The experiment was committed on a separate Git branch and deleted without merging.

The Primary/40 palette-pinning screenshots still require final verification against the assessment requirement.

## How to Run the Preview

From the repository root:

```bash
node task-01-design-system/scripts/build-tokens.mjs
node --test task-01-design-system/tests/build-tokens.test.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory task-01-design-system
```

Open `http://127.0.0.1:4173/preview/`.

The converter reads `evidence/06-tokens-complete.json` and generates `assets/stitchtrack-tokens.css`.

The incomplete export is preserved only as assessment evidence.

## Evidence

All numbered evidence files are in `evidence/`.

| Files | What they demonstrate |
|---|---|
| `01–02` | Brand palette before-and-after evidence, pending final pinning verification |
| `03–04` | Default and chosen Display Large letter spacing |
| `05–06` | Incomplete and complete Figma token exports |
| `07` | Raw-colour search command and output |
| `08` | Agent's response about the heading typography |
| `09–10` | Dashboard without and with the design system |
| `11` | Deliberately inconsistent interface |
| `12` | Git history proving the experiment was not merged |

The optional walkthrough video has not been produced.

## Documentation

The `docs/` folder contains the business brief, colour roles and contrast measurements, type scale, shadow definitions, deliberate divergences, actual agent prompts, defects, and 12 interview answers.

## Known Limitations

This is a static demonstration, not the complete StitchTrack application.

The preview uses fixed sample data. Shadow colour values are not independently linked to a semantic shadow-colour role, so they require additional work for automatic theme updates.

The design system has been tested through its converter and preview, but it has not yet been validated across a complete production application.

The next assessment task will scaffold the application and consume the design system.