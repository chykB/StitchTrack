# StitchTrack Engineering Rules

Source of truth: `docs/PRD.md` and approved technical decisions.

## 1. Technology

- Use Next.js App Router and TypeScript.
- Use Prisma with PostgreSQL.
- Use Zod for server-side input validation.
- Use Better Auth for authentication and client email verification.
- Use Nodemailer for application emails.
- Follow existing project conventions before introducing new patterns.
- Do not add dependencies without approval.
- Do not introduce Flutterwave, pgvector, or Gemini functionality without an approved feature requiring it.

## 2. Authentication and Authorization

- Authenticate every protected operation on the server.
- Verify business ownership before accessing business records.
- Verify the client's authorized link before accessing client records.
- Never use email matches, phone matches, or record IDs as proof of authorization.
- Do not rely on client-side restrictions for security.
- Apply authorization to reads, writes, file access, and background operations.
- Reject cross-business and unauthorized client access.

## 3. Database Design

- Read the PRD before proposing database structures.
- Review the existing Prisma schema and migrations before proposing changes.
- Do not invent entities, relationships, or constraints unsupported by requirements.
- Preserve business ownership across related records.
- Preserve historical measurements, agreements, decisions, and payment records.
- Use exact decimal types for monetary values.
- Use transactions for operations requiring multiple dependent database changes.
- Protect approval and payment operations against duplicate or conflicting requests.
- Propose schema changes separately from applying them.

## 4. Database Operations

- Maintain separate development and test databases.
- Never execute database migrations.
- The developer executes all migrations manually through the terminal.
- Never connect to, query, seed, reset, or modify the development database.
- The developer handles development-database operations.
- Do not execute operations against the test database without explicit task-specific authorization.
- Do not execute database-dependent tests without authorization.
- Never assume a migration succeeded without reviewing the developer's result.
- Do not modify existing migrations without explicit approval.
- Never run destructive database commands.

## 5. Data Integrity

- Do not overwrite submitted agreements or their approval evidence.
- Preserve the exact measurement, fabric, and style references associated with each agreement version.
- Approved changes must preserve earlier agreements.
- Rejected changes must not alter effective agreements.
- Prevent duplicate payment records caused by repeated submissions.
- Do not silently modify or delete recorded payments.
- Derive delivery commitments from effective approved agreements.
- Ensure failed multi-record operations do not leave partial updates.

## 6. External Services

- Keep credentials and service secrets out of source control.
- Do not send real emails without explicit authorization.
- Do not run notification workers without authorization.
- Record email failures without treating them as successful deliveries.
- Do not treat Nodemailer as an email hosting provider.
- Do not make private customer pictures publicly accessible.
- Do not delete stored pictures outside the approved retention policy.
- Do not integrate customer-to-tailor payment gateways.

## 7. Implementation and Verification

- Inspect relevant code before editing.
- Make only the approved changes.
- Preserve existing files and uncommitted work.
- Do not stage, commit, reset, clean, or push without authorization.
- Prepare focused tests for implemented behavior.
- Leave database execution and integration-test operations to the developer.
- Report the verification commands the developer should run.
- Never claim a test passed without seeing its actual result.
- Report changed files, remaining risks, and unresolved decisions.
- Stop when implementation requires an unapproved product or architecture decision.