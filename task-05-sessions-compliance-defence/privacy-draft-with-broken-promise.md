# Deliberately flawed privacy draft: the promise that had to be removed

**DELIBERATELY FLAWED HISTORICAL ASSESSMENT DRAFT - RECONSTRUCTED EXAMPLE - NEVER PUBLIC POLICY**

This assessment artifact preserves one realistic earlier-style drafting mistake. It is a
reconstructed example, not evidence that StitchTrack previously adopted, published or
communicated this promise. It is not approved, public or effective and must never be used
as the privacy notice. Existing historical legal drafts are preserved unchanged.

## Unsupported promise - removed

> We guarantee that every account record, uploaded image, email-provider copy and backup will be permanently erased within 30 days of your deletion request.

## How the mistake could have entered the draft

A writer could have turned the proposed maximum-30-day erasure target into a guarantee without checking what the cleanup code actually covers.
They could then have assumed that deleting database rows also removes uploaded files, delivered emails and backups, although those copies require separate controls.

## Why StitchTrack cannot currently keep it

- **A request is an access lock, not erasure.** The [deletion service](../lib/product-auth/account-deletion.server.ts)
  confirms the password and uses the [account-access service](../lib/product-auth/account-access.server.ts)
  to commit the original deletion-request timestamp and all-session revocation. Neither
  service permanently removes the account or its related data.
- **The erasure proof has deliberately limited scope.** The [engine](../lib/product-auth/account-erasure.server.ts)
  accepts an exact disposable-fixture receipt in `stitchtrack_product_test`, checks
  baseline/retained fingerprints within its transaction and deletes only attributable rows.
  It refuses non-fixture accounts, real Terms acceptances requiring review, unexpected
  relationships and a non-null image reference. It never deletes shared TermsVersion rows.
  Fixture success cannot establish that every real account record can be erased.
- **The two successful runs were owner-triggered.** The first erased nine synthetic
  records; the second returned noop with zero deletions, followed by successful verification
  and fixture cleanup, as recorded in the [current README](README.md). They demonstrate
  controlled PostgreSQL erasure and repeat-run idempotency, not a deployed production
  scheduler, deadline monitor or general real-user service. The retention matrix's older
  unexecuted-status wording is historical and does not cancel those owner-reported results.
- **External copies are outside that transaction.** The [outbox worker](../lib/product-auth/outbox-worker.server.ts)
  decrypts eligible payloads and hands messages to SMTP; database erasure cannot recall
  already handed-off email or remove recipient/provider copies. No verified image-store
  deletion, backup/WAL/replica deletion or restore-time erasure reconciliation exists.
  An encrypted payload or session digest is protected data, not proof of anonymity or erasure.
- **Retention needs decisions, not a blanket guarantee.** The [retention matrix](docs/retention-matrix.md)
  leaves real Terms acceptance, future garment evidence, specific lawful exceptions,
  operational permissions and backups unresolved. No retention obligation, duration,
  fixed grace period or production 30-day guarantee has been established by those tests.

## Corrected wording used in the assessment privacy document

The [replacement privacy draft](privacy.md#requesting-account-deletion) says:

> Requesting deletion locks your account and revokes your existing sessions immediately after the request is successfully authorized and committed. It does not itself erase your records. Later erasure is a separate process; it has so far been demonstrated only on controlled synthetic PostgreSQL test fixtures, and no production erasure service is operational. A maximum 30-day erasure target is proposed for a future verified service, not an active guaranteed deadline; no fixed grace period has been approved or deployed.

The replacement also explains that retention requires a specific justification, that
anonymisation is not implemented generally, and that backups/provider/external copies are
not covered by verified deletion. This makes the current limit visible rather than
silently implying that a locked account has disappeared everywhere.

Task Five's separate defined-grace-period and operational-scheduled-deletion requirements
remain gaps. Their rationale, implementation and actual operation must be reviewed and
verified; neither a draft promise nor the evidence filenames can supply them. The new
privacy document remains an assessment-stage draft pending owner/legal review, with no
application behavior, legal approval or public commitment changed by this correction.
