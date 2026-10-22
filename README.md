# StitchTrack

## Overview

StitchTrack is a tailoring order and agreement management platform for small fashion studios in Nigeria, designed to keep garment delivery commitments and approved agreement changes visible without losing their history.

## Status

This repository follows the *Ship & Found* five-task assessment using one repository with a separate folder for each task.

| Task | Status |
|---|---|
| Task 1 — Design System | Implemented; final evidence review pending |
| Task 2 — Repository and Scaffold | Not started |
| Task 3 — Client Validation | Not started |
| Task 4 — Server Security | Not started |
| Task 5 — Sessions, Compliance and Defence | Not started |

Task One includes a Figma-based design system, a JavaScript token converter, automated tests, and a responsive static order dashboard.

The dashboard uses sample data. It is not connected to a database, and customers cannot yet create orders or approve agreements.

The original brand-colour pinning screenshots still need final verification against the assessment instructions.

## Stack and Reasons

**Currently implemented:**

- **Figma:** To define reusable colours, typography, shadows, and semantic roles before implementation.
- **HTML and CSS:** To demonstrate one screen without introducing a full application framework prematurely.
- **JavaScript with Node.js:** To convert the complete Figma JSON export into CSS variables using a repeatable script without extra dependencies.
- **DM Sans:** Selected after comparing typefaces using StitchTrack interface content.
- **Git:** To preserve the working design system and isolate deliberate regression experiments.

**Planned for later tasks, not implemented yet:**

- **Next.js and TypeScript:** For a full-stack web application with typed application code.
- **PostgreSQL and Prisma:** For relational data, business-scoped records, and migrations.
- **Zod:** For validating application input at defined boundaries.

These are planned choices, not claims about the current implementation.

## Getting Started

Clone this repository, then enter the project directory:

```bash
git clone <REPOSITORY_URL> stitchtrack
cd stitchtrack
```

Replace `<REPOSITORY_URL>` with the actual repository URL once published.

Generate the CSS design tokens:

```bash
node task-01-design-system/scripts/build-tokens.mjs
```

Run the automated tests:

```bash
node --test task-01-design-system/tests/build-tokens.test.mjs
```

Start the static preview:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory task-01-design-system
```

Open `http://127.0.0.1:4173/preview/` in your browser.

The preview does not require an npm installation, database, or backend service. Node.js and Python 3 must be available locally.

See `task-01-design-system/README.md` for the design-system implementation and supporting evidence.

## Environment Variables

**None are required for Task One.**

The token converter and static preview do not use credentials or external service connections.

Later tasks may introduce environment variables for database connections, authentication, and other services. Their names and purposes will be documented when those services are implemented. Secret values will not be committed.

## What This Deliberately Does Not Do

The current repository does not implement order creation, customer login, payments, agreement approvals, or database persistence.

The Task One dashboard exists to demonstrate that an AI coding agent can apply a real design system to an interface.

The planned MVP will focus on garment orders, delivery dates, measurements, versioned agreements, approved changes, and payment records. Advanced inventory, full accounting, and automated WhatsApp integration are outside the initial scope.

Keeping this scope narrow allows the core workflow to be validated before adding operational complexity.

## Known Defects and Limitations

- **Shadow colour references:** `task-01-design-system/assets/stitchtrack-tokens.css` contains literal shadow colours with alpha values. Changing the Primary palette token does not automatically recolour these shadows.
- **Static data:** `task-01-design-system/preview/index.html` contains fixed example orders and dates. These do not update from live business records.
- **Palette-pinning evidence:** `01-palette-before-pin.png` and `02-palette-after-pin.png` require final confirmation that they show the specific Primary/40 pinning operation requested by the assessment.
- **Incomplete product functionality:** The current preview is not a working order-management application.

The actual implementation defects and corrections encountered during Task One are recorded in `task-01-design-system/docs/defects.md`.