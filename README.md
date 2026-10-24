# StitchTrack

## Overview

StitchTrack is a tailoring order and agreement management platform for small fashion studios in Nigeria, designed to keep garment delivery commitments and approved agreement changes visible without losing their history.

## Status

This repository follows the *Ship & Found* five-task assessment using one repository with a separate folder for each task.

| Task | Status |
|---|---|
| Task 1 — Design System | Implemented; final evidence review pending |
| Task 2 — Repository and Scaffold | Initial scaffold implemented and verified |
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

**Task Two assessment implementation:**

- **PostgreSQL and Prisma:** Isolated Task Two assessment persistence code; database verification is developer-run.
- **Zod:** Server-side validation for the temporary assessment form.

Database identity checks, migration application, and real persistence evidence remain unverified until the developer performs them.

## Task Two Application Scaffold

The Next.js App Router application lives at the repository root. It contains one
responsive landing page and a shared layout. It imports Task One's generated
token stylesheet directly; the local DM Sans font and its licence are copied
unchanged into `public/fonts/`. Task One remains an independent deliverable.

Use native WSL Linux Node.js 24.22.1 and npm 11.19.1 through NVM:

```bash
cd ~/stitchtrack
source ~/.nvm/nvm.sh
node --version
npm --version
```

Dependency installation completed successfully. The installed runtime versions
are Next.js 16.4.2, React 19.3.1, and React DOM 19.3.1.
`package-lock.json` has been generated; use `npm ci` for a clean installation
from the locked dependency versions.

```bash
npm ci
npm ls --depth=0
npm run typecheck
npm run build
npm audit
npm run dev
```

Open `http://localhost:3000`.

Confirmed verification results for the original scaffold, before the persistence experiment:

- Dependency installation completed successfully.
- TypeScript checks passed.
- The production build passed.
- `npm audit` reported zero vulnerabilities.
- Browser verification passed.

The initial scaffold uses `next`, `react`, `react-dom`, `typescript`,
`@types/node`, `@types/react`, and `@types/react-dom`. The separate persistence
experiment additionally uses `@prisma/client`, `@prisma/adapter-pg`, `pg`,
`zod`, `prisma`, and `@types/pg`. The landing page needs no database settings.
Authentication, product workflows, payment processing, and notifications are absent.

Spacing, border widths, radii, and breakpoints reuse approved Task One preview
values because the token export contains no corresponding token categories.
Colours, typography, and elevation use the existing CSS variables.

## Task Two Persistence Experiment

The temporary assessment page is at `/assessment/enquiry`, with a separate
POST endpoint at `/api/assessment/enquiries`. Both are disabled by default
and unavailable outside local development. They use synthetic data only.
No migrations are included or applied by code implementation.

See [the persistence experiment procedure](task-02-repository-and-scaffold/docs/persistence-experiment.md)
for confirmed-test-database configuration, user-only migration review, two
submission checks, isolated connection failure, recovery, and evidence capture.
Never use a development or production database for this assessment.

Generate the ignored Prisma client before checks (pretypecheck/prebuild also do this):

```bash
npm run prisma:validate
npm run prisma:generate
npm run test:assessment
npm run typecheck
npm run build
```

Implementation checks passed: 21 database-free unit tests, Prisma schema validation,
client generation, TypeScript checking, and the production build. On 2026-10-24,
Zod was upgraded from 4.1.12 to exactly 4.6.7 to address the high-severity finding.
The subsequent `npm audit` reported zero vulnerabilities. Assessment tests,
TypeScript checking, and the production build passed after the upgrade.
No general dependency upgrade or automatic audit fix was run.
Earlier dependency installation attempts failed because of registry availability
and download errors. Installation and the Prisma 7.10.1 upgrade later succeeded.
The earlier five-finding audit and original scaffold audit above are historical.

These commands require no live database. Unit tests use mocked persistence.
Real database verification and browser form submissions must be performed by
the developer after reviewing the documented preflight and migration steps.

## Getting Started

Clone this repository, then enter the project directory:

```bash
git clone https://github.com/chykB/StitchTrack.git stitchtrack
cd stitchtrack
```

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

Task Two assessment configuration names are listed in `.env.example`; no database identity or credential is supplied. The experiment requires explicit, independently confirmed test settings. See its procedure before enabling it. Secret values must not be committed.

## What This Deliberately Does Not Do

The current repository does not implement order creation, customer login, payments, agreement approvals, or production database persistence. The separate, disabled-by-default assessment has persistence code awaiting developer-run database verification.

The Task One dashboard exists to demonstrate that an AI coding agent can apply a real design system to an interface.

The planned MVP will focus on garment orders, delivery dates, measurements, versioned agreements, approved changes, and payment records. Advanced inventory, full accounting, and automated WhatsApp integration are outside the initial scope.

Keeping this scope narrow allows the core workflow to be validated before adding operational complexity.

## Known Defects and Limitations

- **Shadow colour references:** `task-01-design-system/assets/stitchtrack-tokens.css` contains literal shadow colours with alpha values. Changing the Primary palette token does not automatically recolour these shadows.
- **Static data:** `task-01-design-system/preview/index.html` contains fixed example orders and dates. These do not update from live business records.
- **Palette-pinning evidence:** `01-palette-before-pin.png` and `02-palette-after-pin.png` require final confirmation that they show the specific Primary/40 pinning operation requested by the assessment.
- **Incomplete product functionality:** The current preview is not a working order-management application.

The actual implementation defects and corrections encountered during Task One are recorded in `task-01-design-system/docs/defects.md`.