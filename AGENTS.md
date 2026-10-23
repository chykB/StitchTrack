# StitchTrack

## Description
StitchTrack is a mobile-first web application for independent tailors and small fashion studios in Nigeria.
Tailors manage customer orders, clothes items, measurements, fabric and style pictures, agreements, manual payment records, and deliveries.
Clients use a passwordless email-verified portal to review and approve agreements, request changes, and track their orders.

## Who uses it
- **Tailor:** Manages business-owned records, agreement proposals, payment entries, delivery updates, and reminders.
- **Client:** Views authorized orders, reviews pictures and terms, approves or rejects proposals, requests changes, and tracks delivery.
- These are the only two V1 user types.

## One thing that the agent must do well
Preserve the exact client-approved agreement, including its measurement version, fabric picture, style picture, price, delivery date, and change history.
Never silently overwrite approved terms or evidence.

## Defined Scope for the MVP
- Tailor authentication and passwordless email verification for clients.
- Verified client links across separate tailoring businesses.
- Business-isolated customers and orders containing multiple individual clothes items.
- Versioned measurements and a required fabric and style picture for each item before agreement submission.
- Client-approved agreements, controlled changes, fittings, and adjustments.
- Manual records of money paid directly to tailors.
- Delivery progress, email and in-app reminders, and authorized dashboards.
- Pilot measure: businesses still recording real orders after four weeks.

## Not in scope items for the MVP
- Fashion marketplace, clothing design tools, or fabric inventory.
- Processing customer-to-tailor payments, full accounting, or paid subscription tiers.
- WhatsApp or SMS automation, runtime AI features, or vector search.
- Offline write synchronization or advanced fitting scheduling.

## Stack
- Next.js App Router, TypeScript, Prisma, PostgreSQL, and Zod.
- Better Auth for authentication; Nodemailer for application email.
- Existing StitchTrack design tokens and DM Sans.
- Flutterwave is reserved for future tailor-to-StitchTrack payments, such as subscriptions. Do not implement it in V1.
- pgvector and Gemini free tier are named technologies with no approved V1 use case. Do not implement their features without approval.

## Folder map
- `README.md`: Repository entry point.
- `task-01-design-system/`: Existing design-system deliverables.
- `task-02-repository-and-scaffold/`: Task Two assessment documentation; the application scaffold lives at the repository root.
- `docs/PRD.md`: Intended location of the current PRD. Confirm the file exists before product implementation.
- `.agent/rules/`: Detailed project rules.
- Verify paths against the actual repository before modifying files.

## How to work in this codebase
- Read `docs/PRD.md`, relevant rule files, and affected code before proposing implementation.
- Perform read-only review first. State scope, affected files, and checks; wait for implementation approval.
- Work on one approved change at a time. Do not expand scope or add packages without approval.
- Do not start scaffolding until the user approves the specific scaffold plan.
- Never run database migrations. The user runs all migrations in the terminal.
- Never connect to, query, seed, reset, or modify the development database. The user handles these operations.
- Do not run test-database operations without explicit task-specific authorization.
- Do not send real email, run background workers, or trigger external side effects without approval.
- Do not stage, commit, reset, clean, or push Git changes without authorization.
- Use actual verification results. Do not claim unrun commands or successful tests.
- Stop and report missing rules, conflicts, or unspecified product decisions. Do not guess.
- End each implementation report with `Assumptions: none` or a list requiring approval.

## Where the detailed rules live
- `.agent/rules/01-product.md`: Product boundaries and approved business invariants.
- `.agent/rules/02-engineering.md`: Access control, integrity, database boundaries, and integration safety.
- `.agent/rules/03-design.md`: Design-system and image-display requirements.
- Read relevant files explicitly. Do not assume other agent environments auto-load them.

## Definitions
- **Tier:** Product access or pricing level. V1 has no paid tiers.
- **Record:** Stored information about a business, client, order, item, agreement, payment, or event.
- **Clothes item:** One physical item within an order. One order can contain multiple items.
- **Agreement:** Submitted terms for one clothes item. Approved versions preserve their history.
- **Client portal:** Passwordless access to records linked to a verified client identity.
- **Manual payment:** Money paid directly to the tailor, then recorded by the tailor; StitchTrack does not verify receipt.