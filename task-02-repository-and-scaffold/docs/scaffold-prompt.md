# StitchTrack Scaffolding Prompt

## First Draft (Written by Me)

Create a  scaffolding for stitchtrack. Focus only on the project setup, folder structure, design tokens, basic layout, and a simple responsive landing page. Do not build product features, authentication, or database models yet. Read all context files and existing design system, they are the source of truth, ask questions when two files disagree, do not assume, List every file you created and every assumption you made,  Audit your own response against these instructions, preserve all existing files, and share your understanding and wait for my approval, 

## Final Refined Prompt

Create the initial application scaffold for **StitchTrack**, following the requirements below.

**Before implementing anything:**

1. Read `AGENTS.md`, `docs/PRD.md`, the relevant `.agent/rules/` files, and the existing Task One design-system files.
2. Inspect the current repository structure and existing files.
3. Identify any conflicting requirements, missing information, or implementation risks.
4. If two sources conflict, report the conflict and ask for clarification. Do not choose an interpretation yourself.

**Scope**

Prepare a minimal scaffold using Next.js App Router and TypeScript, focusing only on:

- Project configuration and folder structure.
- Integration of existing design tokens.
- Basic application layout.
- One simple, responsive StitchTrack landing page.

Use the existing design system as the source of truth. Do not recreate or replace it.

**Restrictions**

- Do not implement product features, authentication, dashboards, payments, or notifications.
- Do not create database models, migrations, or database connections.
- Do not modify or delete existing work unnecessarily.
- Do not add dependencies without approval.
- Do not run database operations or Git mutations.
- Do not invent product requirements, design values, or architectural decisions.

**First response: planning only**

Before creating or modifying any file, provide:

1. Your understanding of the requested scaffold.
2. The existing files and design-system resources you identified.
3. The proposed folder structure.
4. Every file you intend to create or modify, with a brief reason.
5. Any conflicts, unanswered questions, or assumptions requiring approval.
6. The checks you will use to verify the scaffold.

Audit your proposed plan against every instruction above.

**Stop after presenting the plan and wait for my explicit approval. Do not implement anything yet.**

After approved implementation, report every file created or modified, actual verification results, unresolved issues, and assumptions. Preserve all existing work.

## What Changed and Why

I refined my original prompt to give the coding agent clearer instructions and prevent it from implementing more than the required scaffold. The revised version explicitly requires the agent to inspect the existing repository, PRD, project rules, and design-system files before proposing changes. It also introduces a planning stage where the agent must explain its understanding, identify affected files, report assumptions, and wait for my approval before writing code. I strengthened the restrictions to protect existing files, prevent unnecessary dependencies, and ensure the agent reuses the established design tokens instead of introducing new styling values. Finally, I added clear verification and reporting requirements so I can review what was actually implemented and compare it against the approved scope.