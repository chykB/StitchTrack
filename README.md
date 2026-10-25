# StitchTrack

## What this is

StitchTrack is a mobile-first tailoring order and agreement management project for independent tailors and small fashion studios in Nigeria. Its planned product will preserve approved garment terms and delivery commitments without losing their change history.

**Implemented now:** a reusable Task One design system and static sample dashboard, a Next.js landing page, and a separate local-only Task Two database persistence experiment. This is not yet a working production order-management application.

The authoritative product requirements are in [docs/PRD.md](docs/PRD.md). Product features described there are planned unless explicitly listed as implemented here.

## Status

This repository follows the *Ship & Found* five-task assessment. Task deliverables have separate folders; the Task Two application lives at the repository root.

| Task | Status |
| --- | --- |
| Task 1 — Design System | Implemented; final evidence review pending |
| Task 2 — Repository and Scaffold | Scaffold, isolated persistence experiment and information-design improvements implemented and verified |
| Task 3 — Client Validation | Not started |
| Task 4 — Server Security | Not started |
| Task 5 — Sessions, Compliance and Defence | Not started |

Task One includes a Figma-based design system, a JavaScript token converter, automated tests and a responsive static order dashboard with sample data.

Task Two includes a responsive landing page and a temporary enquiry form. The developer manually applied the version-controlled assessment migration to the isolated `stitchtrack_assessment` database and verified real records after HTTP 201 submissions. The experiment is disabled by default and cannot run in production.

The information-design work was merged into `main` through [Pull Request #1](https://github.com/chykB/StitchTrack/pull/1). See the extended Task Two details below for verification and Git workflow evidence.

## Stack, with reasons

| Technology | Current use and reason |
| --- | --- |
| Next.js 16.4.2, App Router | Root application layout, route-specific metadata and a server-side assessment endpoint in one TypeScript project |
| React and React DOM 19.3.1 | Render the landing page and manage the assessment form's pending, error and confirmed-success states |
| TypeScript 5.9.3 | Check application types and request/receipt contracts before building |
| PostgreSQL, Prisma 7.10.1 and pg 8.16.3 | Prove real relational persistence in an isolated assessment database; Prisma provides the schema and generated client, with the PostgreSQL adapter/driver |
| Zod 4.6.7 | Validate assessment input on the server and validate success receipts |
| Figma, generated CSS variables and DM Sans | Keep colours, typography and shadows consistent with Task One's approved Tailored Wine design system |
| Static HTML and CSS | Preserve Task One's independent dashboard demonstration without requiring the application framework |
| JavaScript and Node.js | Convert the complete Figma export reproducibly and run focused tests without extra test packages |
| Git | Preserve assessment evidence and isolate reviewed changes and rejected experiments |

Better Auth and Nodemailer are specified for later authentication and email milestones. They are not installed or implemented in this scaffold.

## Getting started

### Run the landing page from a new or existing clone

Choose the setup path for your operating system. WSL is the developer's verified environment, not a StitchTrack application requirement. Both paths use Git, Node.js 24.x and npm 11.x.

**Why Node.js 24.x:** it is the verified version line and matches the repository's declared Node.js requirement. Use 24.22.1 to reproduce the tested setup. Compatibility with Node.js 26, including the tester's initial 26.5.0, has not been established. A newer installed version is not evidence of compatibility with these locked dependencies; select and verify 24.22.1 before installation.

**Verification status:** the developer verified WSL using NVM, Node.js 24.22.1 and npm 11.19.1. An independent tester also ran the homepage on native Windows 10 using CMD, fnm, Node.js 24.22.1 and npm 11.19.1, with troubleshooting assistance and an existing clone. See the [Step 7 README test](task-02-repository-and-scaffold/docs/readme-test.md). The PowerShell alternative remains unverified.

**The landing page runs without assessment database credentials, a PostgreSQL service or an environment file.** Leave the assessment experiment disabled. Do not create a database or run migrations to view the homepage.

#### Windows — Command Prompt (independently tested with assistance)

Use **Command Prompt (`cmd.exe`)** for the sequence below. Run one step at a time and confirm success before continuing. If PowerShell instructions cause shell-related difficulties, use this CMD path. Install Git for Windows and fnm and ensure they are available on PATH:

```bat
git --version
fnm --version
```

**1. Install the verified Node.js version.** fnm can keep multiple versions installed; you do not need to uninstall an existing Node.js version first:

```bat
fnm install 24.22.1
```

Installing the version makes it available. Each `fnm exec --using=24.22.1` command below then selects it for that command and its child processes. This does not depend on `fnm use` in an earlier terminal or change the Node.js version used by every other application.

**2. Enter the repository.**

**Option A: Already cloned StitchTrack**

Use the existing clone's actual location; this example assumes it is in your Windows user directory:

```bat
cd /d "%USERPROFILE%\stitchtrack"
dir package.json
```

**Option B: Haven't cloned StitchTrack yet**

```bat
cd /d "%USERPROFILE%"
git clone https://github.com/chykB/StitchTrack.git stitchtrack
cd stitchtrack
dir package.json
```

Choose only one option, then continue to Step 3.

If cloning reports that the destination already exists, check that it is your StitchTrack clone and resume there. Do not delete the repository to repeat setup. Switching Node.js versions also does not require cloning again.

**3. Verify the version that will run StitchTrack:**

```bat
fnm exec --using=24.22.1 node --version
fnm exec --using=24.22.1 npm.cmd --version
```

Expect Node.js 24.22.1 and npm 11.x; the successful independent test used npm 11.19.1. An unprefixed `node --version` can still show another installed version; use the explicitly versioned commands for this setup.

**4. Install dependencies from the lockfile:**

```bat
fnm exec --using=24.22.1 npm.cmd ci
```

**Stop if installation fails. Do not continue to Prisma generation or server startup with an incomplete `node_modules` directory.** Resolve the error using the troubleshooting guidance below, retry this step, and continue only after it exits successfully.

**5. Generate Prisma Client after installation succeeds:**

```bat
fnm exec --using=24.22.1 npm.cmd run prisma:generate
```

If generation fails, stop and resolve it before starting the server.

**6. Start the development server:**

```bat
fnm exec --using=24.22.1 npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

Wait for Next.js to report Ready, then open **http://127.0.0.1:3000/** in your browser. Stop the server with **Ctrl+C**.

#### Windows — PowerShell option (not independently verified)

Use PowerShell's directory syntax for an existing clone, adjusting the path as needed:

```powershell
Set-Location "$env:USERPROFILE\stitchtrack"
Get-Item package.json
fnm exec --using=24.22.1 node --version
fnm exec --using=24.22.1 npm.cmd --version
fnm exec --using=24.22.1 npm.cmd ci
```

After installation succeeds, run the generation and startup steps separately:

```powershell
fnm exec --using=24.22.1 npm.cmd run prisma:generate
```

Only after generation succeeds, start the server:

```powershell
fnm exec --using=24.22.1 npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

Use `fnm install 24.22.1` first if that version is not installed. Stop on installation or generation errors, as in the CMD path. `npm.cmd` invokes npm's Windows command launcher without requiring execution of `npm.ps1`.

**PowerShell sessions and fnm:** shell initialization is session-specific unless configured in the PowerShell profile. For example, to initialize fnm and select the version for the current PowerShell session:

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm use 24.22.1
```

Opening a new PowerShell session does not carry over initialization performed only in the previous session. To initialize future sessions automatically, configure the initialization line in the relevant PowerShell `$PROFILE`, following [fnm's official PowerShell instructions](https://github.com/Schniz/fnm#powershell). Then select and verify the intended version in the new session. The explicit `fnm exec --using=24.22.1` commands above select the version per command and do not require this optional profile setup.

Do not paste CMD's `cd /d` or `%USERPROFILE%` syntax into PowerShell. **If shell initialization, syntax or script-launch issues are confusing, open CMD, navigate to the same existing clone and follow its numbered sequence.** Changing shells does not require another clone.

#### Windows troubleshooting: identify which step failed

These are different possible problems; do not assume every failure has the same cause:

| Problem | What to check and do |
| --- | --- |
| Incorrect shell syntax | Use the block for your terminal. CMD uses `cd /d` and `%USERPROFILE%`; PowerShell uses `Set-Location` and `$env:USERPROFILE`. Use the CMD alternative if PowerShell causes difficulties. |
| Node.js version mismatch | Verify with `fnm exec --using=24.22.1 node --version`. Node.js 26 compatibility is not established. A mismatch can introduce compatibility problems, but it does not prove the cause of an EPERM error. |
| Failed or incomplete dependency installation | Stop after a failed `npm.cmd ci`. Missing modules after that failure do not mean Prisma generation or the server should be tried anyway. Complete a successful clean dependency installation first. |
| Windows EPERM / files in use | The tester encountered EPERM while removing a Next.js SWC binary. A process holding a file can prevent removal. Stop development servers and close relevant Node.js processes/editor sessions; remove only the incomplete project's `node_modules` directory using File Explorer, then retry the explicitly versioned CMD install. |

Before removing `node_modules`, confirm you are in the intended repository root. Preserve `package.json`, `package-lock.json`, source files and evidence. Retry `fnm exec --using=24.22.1 npm.cmd ci` in that existing clone. If it still fails, retain the error for investigation and stop rather than continuing to later steps. The reported EPERM failure is distinct from the unverified compatibility of Node.js 26.

#### Linux/WSL — Bash and NVM

Use a Linux terminal with Git and NVM installed. In WSL, use Linux Node.js and npm inside that environment. Load NVM, select the verified Node.js version and check the prerequisites:

```bash
source ~/.nvm/nvm.sh
nvm install 24.22.1
nvm use 24.22.1
git --version
node --version
npm --version
```

Confirm Node.js 24.x and npm 11.x; the verified WSL setup used npm 11.19.1. If Git or NVM is missing, install those prerequisites in your Linux environment before continuing.

For a new clone, run the commands below from your Linux home directory. If the repository already exists, skip the clone command, run `cd ~/stitchtrack` (or use its actual path), and resume at `npm ci`.

```bash
cd ~
git clone https://github.com/chykB/StitchTrack.git stitchtrack
cd stitchtrack
npm ci
npm run prisma:generate
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open **http://127.0.0.1:3000/** in your browser. Stop the server with **Ctrl+C**. The recorded verification applies to WSL; other Linux installations have not been independently tested.

#### Notes for both setup paths

**If dependency installation fails on either platform, stop.** Resolve it and rerun installation successfully before Prisma generation or development-server startup.

`npm ci` uses the committed `package-lock.json`. Prisma generation creates the ignored client in `app/generated/prisma`; it does not connect to PostgreSQL.

If port 3000 is occupied, choose another port with `--port` in the development-server command and open the corresponding browser URL. The current Open Graph URLs intentionally target port 3000 for local assessment verification.

### Run checks without a database

From the repository root, with the development server stopped before the build, run the following commands. In Windows CMD or PowerShell with fnm, replace each leading `npm` with `fnm exec --using=24.22.1 npm.cmd`; in Linux/WSL, use `npm` as shown.

```text
npm ls --depth=0
npm run prisma:validate
npm run test:assessment
npm run typecheck
npm run build
npm audit
```

The existing pretypecheck and prebuild scripts generate Prisma Client automatically. Assessment unit tests use mocked persistence; these commands need no live database. The audit checks the npm registry and its results can change over time.

To inspect the production build locally, run `fnm exec --using=24.22.1 npm.cmd run start -- --hostname 127.0.0.1 --port 3000` in Windows CMD or PowerShell or `npm run start -- --hostname 127.0.0.1 --port 3000` in Linux/WSL. The assessment routes remain unavailable in production.

### Run the independent Task One preview

Node.js and Python 3 are required; npm installation and a database are not. From the repository root, use the commands for your platform.

**Windows — CMD or PowerShell** (fnm and Python 3 with the `py` launcher; this preview path was not part of the independent homepage test):

```bat
fnm exec --using=24.22.1 node task-01-design-system/scripts/build-tokens.mjs
fnm exec --using=24.22.1 node --test task-01-design-system/tests/build-tokens.test.mjs
py -3 -m http.server 4173 --bind 127.0.0.1 --directory task-01-design-system
```

**Linux/WSL — Bash**:

```bash
node task-01-design-system/scripts/build-tokens.mjs
node --test task-01-design-system/tests/build-tokens.test.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory task-01-design-system
```

Open **http://127.0.0.1:4173/preview/**. See [Task One's README](task-01-design-system/README.md) for its design-system implementation and evidence.

An independent tester completed an assisted Windows CMD installation and homepage run from an existing clone. The revised instructions have not yet had an unaided, end-to-end fresh-clone retest. The [test account](task-02-repository-and-scaffold/docs/readme-test.md) records initial failures, assistance, results and pending exact tester quotes.

## Environment variables

No environment variables are required for the landing page, Task One token conversion/static preview, or the database-free checks above.

The optional assessment configuration names are listed in [.env.example](.env.example). It contains no database identity or credentials.

| Variable | Purpose |
| --- | --- |
| `ENABLE_PERSISTENCE_EXPERIMENT` | Disabled unless explicitly set to `true` for local development |
| `EXPERIMENT_DATABASE_URL` | Private connection setting for the independently confirmed, isolated test database |
| `EXPERIMENT_EXPECTED_DATABASE` | Confirmed test database name |
| `EXPERIMENT_EXPECTED_HOST` | Confirmed connection host |
| `EXPERIMENT_EXPECTED_PORT` | Confirmed connection port |
| `EXPERIMENT_EXPECTED_USER` | Confirmed database user |
| `EXPERIMENT_FAILURE_PORT` | Optional verified-unused loopback port used only by the assessment application's controlled failure test |

Next.js sets `NODE_ENV`; do not override it to bypass the assessment's development-only gate. The assessment also checks the request host and origin. Database configuration never falls back to `DATABASE_URL` or a default database.

Before enabling the experiment, follow the [persistence procedure](task-02-repository-and-scaffold/docs/persistence-experiment.md) for private shell configuration and independent database-identity checks. A database name alone does not verify the target. Never use a development or production database for this assessment.

Keep passwords, connection strings and tokens out of source files, logs, screenshots and shell history. Local environment files are ignored by Git; do not commit secret values. The application and Prisma CLI configuration are described in [lib/assessment/config.ts](lib/assessment/config.ts) and [prisma.config.ts](prisma.config.ts).

## What this deliberately does not do

The current implementation does not provide tailor/client authentication, a client portal, order creation, agreement approval, measurement history, manual payment records, delivery workflows, notifications or production database persistence. The local assessment form is a temporary synthetic-data experiment, not a production product workflow.

The Task One dashboard demonstrates design-system application using fixed example orders and dates. It does not operate a tailoring business.

The planned MVP includes multi-item orders, measurements, fabric/style references, versioned agreements and controlled changes, manual records of money paid directly to tailors, delivery progress and reminders. These are future product work under the PRD.

The MVP deliberately excludes a marketplace, fabric inventory, full accounting, customer-to-tailor payment processing, paid subscriptions, automated WhatsApp/SMS, runtime AI, vector search and offline write synchronization. Keeping the scope narrow allows the core workflow to be validated first.

Application code does not execute migrations automatically. Database identity checks, migrations and integration verification remain developer-run. Do not operate on the development database or run test-database operations without specific authorization.

## Known defects, including real file references

- **Unexpected database-failure classification — unresolved:** the controlled unavailable-port submission returned HTTP 500 with outcome `internal_error`, rather than the intended HTTP 503/`database_unavailable`. An earlier configuration failure also returned 500; these were separate attempts. The final failed submission created no new row, and the UI correctly showed an error instead of success. Investigate the real error classification in [lib/assessment/enquiry.ts](lib/assessment/enquiry.ts) alongside the adapter in [lib/assessment/prisma.ts](lib/assessment/prisma.ts). See the observed account in [false-success.md](task-02-repository-and-scaffold/docs/false-success.md), [server-log evidence](task-02-repository-and-scaffold/evidence/13-write-failed-logs.txt) and [UI evidence](task-02-repository-and-scaffold/evidence/13-write-failed-ui.png). Mocked unit tests do not resolve this real-driver discrepancy.
- **Shadow colours do not follow palette changes:** [stitchtrack-tokens.css](task-01-design-system/assets/stitchtrack-tokens.css) preserves literal exported shadow colours with alpha values. Changing Primary/40 does not automatically recolour these shadows.
- **Static dashboard data:** [preview/index.html](task-01-design-system/preview/index.html) contains fixed sample orders and dates, not live business records.
- **Palette-pinning evidence review pending:** [01-palette-before-pin.png](task-01-design-system/evidence/01-palette-before-pin.png) and [02-palette-after-pin.png](task-01-design-system/evidence/02-palette-after-pin.png) still need final confirmation against the specific Primary/40 pinning requirement. [02a-primary-40-variable.png](task-01-design-system/evidence/02a-primary-40-variable.png) is additional evidence.
- **Local-only sharing metadata:** [app/page.tsx](app/page.tsx) uses a loopback metadata base for the assessment. A public production origin is not approved, and public social-sharing previews have not been tested. See [information-design.md](task-02-repository-and-scaffold/docs/information-design.md).
- **Incomplete product functionality and setup coverage:** [app/page.tsx](app/page.tsx) is a landing page, not the full order-management product. The independent Windows test succeeded with assistance using an existing clone; an unaided fresh-clone retest and PowerShell verification remain outstanding. Lifecycle-script warnings were reported, but their exact text remains to be reviewed. See [readme-test.md](task-02-repository-and-scaffold/docs/readme-test.md).

Historical Task One defects and their resolutions are recorded in [defects.md](task-01-design-system/docs/defects.md). Deliberate regression branches were isolated and not merged into the working design-system implementation.

## Task One design-system details

The application imports [Task One's generated token stylesheet](task-01-design-system/assets/stitchtrack-tokens.css) directly. The local DM Sans font and licence were copied unchanged into `public/fonts/`; Task One remains an independent deliverable.

The token converter uses only [06-tokens-complete.json](task-01-design-system/evidence/06-tokens-complete.json). The incomplete export is preserved as assessment evidence. Task One's recorded verification reports 374 CSS custom properties and 11 passing JavaScript tests.

Colours, typography and elevation use the existing CSS variables. Layout dimensions such as spacing, borders and breakpoints reuse approved Task One preview values because the export contains no corresponding token categories. Step 10's approved button padding/radius use rem values; see the [information-design measurements](task-02-repository-and-scaffold/docs/information-design.md).

## Task Two implementation, verification and history

### Scaffold and dependencies

The initial scaffold uses `next`, `react`, `react-dom`, `typescript`, `@types/node`, `@types/react` and `@types/react-dom`. The separate persistence experiment adds `@prisma/client`, `@prisma/adapter-pg`, `pg`, `zod`, `prisma` and `@types/pg`; Prisma CLI remains a development dependency.

Dependency installation, TypeScript checks, production build and browser verification passed for the original scaffold. Its original npm audit reported zero vulnerabilities.

Initial persistence-experiment installation attempts failed because of registry availability and download errors. Those blockers were later resolved, including the targeted Prisma 7.10.1 upgrade. The earlier five-high-severity-finding audit is historical.

On 2026-10-24, Zod was upgraded from 4.1.12 to exactly 4.6.7 to address the subsequently identified high-severity finding. The audit after that upgrade reported zero vulnerabilities; all 21 database-free assessment tests, TypeScript checking and the production build passed. No general dependency upgrade or automatic audit fix was used. These are recorded results, not a new audit run for this README edit.

### Persistence evidence and migration ownership

The temporary page is `/assessment/enquiry`, with POST endpoint `/api/assessment/enquiries`. Both are disabled by default and unavailable outside local development. Use synthetic data only; never enter real customer information.

The migration file is version-controlled at [prisma/migrations/20261023_task_two_enquiry/migration.sql](prisma/migrations/20261023_task_two_enquiry/migration.sql). **Database deployment was performed manually by the developer** against the isolated `stitchtrack_assessment` database. Application startup and request handling do not execute this migration.

The developer verified successful HTTP 201 submissions and actual PostgreSQL records. Prisma Studio displayed five records; records 3 and 5 were created more than 24 minutes apart. The deliberately failed submission returned HTTP 500 (`internal_error`) and left the same five records. The UI did not report false success; the classification issue remains listed above.

Prisma schema validation, client generation, 21 database-free unit tests, typechecking and the production build passed during implementation. Generation and the unit tests require no live database; they do not independently prove real persistence.

The [persistence procedure](task-02-repository-and-scaffold/docs/persistence-experiment.md) preserves the initial implementation procedure, including intended failure responses and user-only migration instructions. Its opening code-only status predates the developer's completed database verification; use the observed results above and [false-success.md](task-02-repository-and-scaffold/docs/false-success.md) for the actual experiment outcome. Do not rerun initial migration generation over the existing migration or database structures.

Any further database operations require the documented identity preflight and separate developer review. Cleanup of the temporary model/data/routes needs a reviewed strategy; never remove an applied migration automatically.

### Information design and Git workflow

The information-design improvements were developed on `feat/information-design` and merged through [Pull Request #1](https://github.com/chykB/StitchTrack/pull/1). They include clearer homepage copy, responsive headings, button hover/focus feedback, an ST favicon and route-specific metadata.

The developer also tested a more general homepage heading on `experiment/rejected-hero-copy`, rejected it because it did not clearly explain StitchTrack's purpose, and deleted that branch without merging it. The history and rejection evidence are recorded in [15-git-log-graph.txt](task-02-repository-and-scaffold/evidence/15-git-log-graph.txt).

[Information-design documentation](task-02-repository-and-scaffold/docs/information-design.md) records actual wrapping observations, typography values, local metadata checks, keyboard focus checks and screenshots 16–20. All 21 assessment tests, TypeScript checking, the production build and `git diff --check` passed for that change. Public sharing previews and user-growth effects were not tested.

### Supporting documents

- [Independent Windows README test and troubleshooting](task-02-repository-and-scaffold/docs/readme-test.md).
- [Original and refined scaffold prompts](task-02-repository-and-scaffold/docs/scaffold-prompt.md).
- [Performance observations](task-02-repository-and-scaffold/docs/performance-note.md).
- [Persistence implementation and developer-run procedures](task-02-repository-and-scaffold/docs/persistence-experiment.md).
- [Observed failure and false-success assessment](task-02-repository-and-scaffold/docs/false-success.md).
- [Product and engineering instructions](AGENTS.md) and [detailed project rules](.agent/rules/01-product.md).
