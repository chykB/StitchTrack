# StitchTrack — Task Two: Repository and scaffold

I built a Next.js scaffold, local persistence experiment and information-design update. **StitchTrack has not been deployed to production.** The application lives at the repository root; this folder holds assessment reports and evidence.

To run the homepage, use the [root README](../README.md). It needs neither PostgreSQL nor assessment credentials.

## Requirement and implementation

Task Two required a controlled scaffold, deliberate failure/recovery exercises, persistence evidence, a real-person README test, Git workflow, model-choice reflection and information design.

I refined my [prompt](docs/scaffold-prompt.md) to require inspection, planning and approval before edits. The [agent plan](evidence/01-agent-plan.txt) and [initial report](evidence/02-files-created.txt) preserve early installation blockers that were later resolved.

My stack is Next.js 16.4.2 App Router, React 19.3.1 and TypeScript 5.9.3, with Prisma 7.10.1, PostgreSQL and Zod 4.6.7 for the assessment. I directly import [Task One's generated tokens](../task-01-design-system/assets/stitchtrack-tokens.css) and serve its unchanged DM Sans font locally. I did not build authentication, production orders, payments or notifications.

## Three deliberately reproduced server failures

| Failure | Recovery and evidence |
| --- | --- |
| npm ran above a nested project and could not find `package.json` (`ENOENT`) | I entered the existing nested project. I also demonstrated an alternative minimal scaffold in the temporary parent directory, printing `in-place-scaffold-running`. [Failure](evidence/05-nested-folder-error.txt) · [Both recoveries](evidence/06-nested-folder-fixed.txt) |
| A controlled Node listener already occupied port 3107 (`EADDRINUSE`) | I identified the listener, recovered the port and verified a test server could start and close normally. [Failure](evidence/07-port-conflict.txt) · [Recovery](evidence/08-port-conflict-resolved.txt) |
| `/task-two-missing-page` returned 404 | I checked the route files, used the existing homepage and started the development server. The intermediate curl status 000 was not an HTTP response; the final request returned 200. [Failure](evidence/09-404-error.txt) · [Recovery](evidence/10-404-resolved.txt) |

These were controlled exercises, not customer incidents. My [first-load measurement](evidence/04-first-load.txt) was 789ms, above the approximately 10ms assessment target; the cause remains unisolated. [Performance note](docs/performance-note.md).

## Proving persistence, not just a success message

I added `/assessment/enquiry` and a separate POST endpoint for synthetic enquiries. They are disabled by default and restricted to local development. I manually applied the [version-controlled migration](../prisma/migrations/20261023_task_two_enquiry/migration.sql) to the isolated `stitchtrack_assessment` database; application code never applies migrations automatically.

The [successful logs](evidence/11-write-succeeded-logs.txt) show distinct HTTP 201 receipts with IDs and timestamps. [Prisma Studio evidence](evidence/12-database-rows.png) shows five records; records 3 and 5 are more than 24 minutes apart.

The first failed submission lacked configuration. After correcting that, my unused-port test returned **500/`internal_error`, not the expected 503**, and created no new record. The [failed logs](evidence/13-write-failed-logs.txt) and [error UI](evidence/13-write-failed-ui.png) show failure feedback, not false success. I did **not** reproduce an actual false-success incident.

The [procedure](docs/persistence-experiment.md) predates completed database verification; my [observed account](docs/false-success.md) records the actual outcome.

## The independent Windows README test

My earlier instructions did not explain version switching, new PowerShell sessions or continuing from an existing clone clearly enough. The Windows 10 tester moved from Node.js 26.5.0 to 24.22.1/npm 11.19.1 using fnm, encountered a duplicate-clone attempt and npm EPERM, then recovered with assistance using CMD and a clean dependency installation.

The retry installed 177 packages, generated Prisma Client 7.10.1 and started Next.js 16.4.2; the homepage returned 200 without WSL or PostgreSQL. I revised the instructions. An unaided fresh-clone retest, PowerShell verification, exact tester quotes and lifecycle-warning details remain outstanding. [Full test account](docs/readme-test.md).

## Git workflow and information design

My [drawing](evidence/14-working-tree-drawing.jpg) and [working-tree explanation](docs/working-tree.md) separate local edits, staging, commits, shared GitHub history and future deployment.

I merged `feat/information-design` through [PR #1](https://github.com/chykB/StitchTrack/pull/1), merge commit `e70de85`. I rejected the generic heading in `experiment/rejected-hero-copy`, commit `1efaa14`, and deleted that branch locally without merging. [Git evidence](evidence/15-git-log-graph.txt).

I clarified the heading and eight-word tagline, removed a redundant eyebrow, and added 18ch balanced wrapping, `clamp()` sizing, rem button padding, Label Large typography, hover/focus feedback, an ST favicon and a 1200 × 630 preview image. Route metadata was verified locally.

| Screenshot | What to inspect |
| --- | --- |
| [16](evidence/16-head-route-one.png) / [17](evidence/17-head-route-two.png) | Homepage marketing metadata; distinct assessment title and `noindex, nofollow` |
| [18](evidence/18-heading-wrap-bad.png) / [19](evidence/19-heading-wrap-good.png) | Genuine awkward wrapping and correction using the same heading |
| [20](evidence/20-responsive-three-widths.png) | Live renders at 375px, 768px and 1440px |

The [report](docs/information-design.md) records checks and the [original baseline](evidence/information-design-baseline.png). There was only one enquiry action; I cannot claim demonstrated choice reduction or measured growth. Public sharing previews remain untested.

## What I corrected and what remains

- **Open defect:** the 500-versus-503 classification. A database-free probe confirmed that the classifier misses structured adapter error kinds, but the historical request's exact exception remains unverified. The heading-wrap defect is resolved. [Defects report with source references](docs/defects.md).
- **Assessment deviation:** I scaffolded with **Codex in VS Code, not the required Antigravity**. Codex information-design work is owner-reported. Exact underlying models, my actual selection rationale, another-model/tool comparison and a genuine wrong-choice-and-switch account remain unverified. [Model choices](docs/model-choices.md).
- **Verification:** recorded checks include 21 passing database-free tests, TypeScript, production build and browser checks. The [server-start log](evidence/03-server-start.txt) confirms local readiness. These are recorded results, not new runs for this overview.
- **Still unfinished:** the setup and performance verification above, public metadata verification and reviewed cleanup of the temporary experiment. Planned product workflows are outside Task Two, not completed features.

I learned to check requests, logs and records together, preserve rejected work, and report gaps instead of treating a working page as proof that every requirement passed.
