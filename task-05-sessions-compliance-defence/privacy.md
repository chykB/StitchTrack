# StitchTrack privacy document

**ASSESSMENT-STAGE DRAFT - OWNER/LEGAL REVIEW PENDING - NOT APPROVED, NOT PUBLIC, NOT EFFECTIVE**

No effective date is assigned. This document describes the current restricted application
and separates it from planned features; it is not a published privacy notice or a claim
of full NDPA/GDPR compliance. StitchTrack is intended to be operated personally by its
individual owner in Nigeria, not an assumed registered company. The operator's legal
identity and privacy contact still need confirmation before publication.

## What StitchTrack does today

StitchTrack is being developed for independent tailors, small fashion studios and their
clients. The implemented account flows support tailor signup, email verification, login,
logout, password reset and authenticated deletion requests. These have been tested in the
isolated product-test environment; public authentication and production deployment are not
approved. Customer, garment-order and client-portal features described below are planned,
not operational data-collection features already available to users.

## Information handled and why it is needed

| Information | Current use and limits |
| --- | --- |
| Your name, email, account identifiers and verification/access status | Identify and secure your tailor account. Signup asks for your name, email and password, not a business name. Email is trimmed and lowercased consistently. |
| Password and credential hash | The server needs the supplied password to register, authenticate or confirm sensitive actions. Accepted password characters are preserved exactly; stored credentials use Argon2id hashes, not recoverable password text. Passwordless-client access remains a separate planned flow; reset cannot create a password for an ineligible account. |
| Verification and reset records | Send and validate six-digit codes, expiry, incorrect attempts and one-time use. Codes expire after five minutes and permit three incorrect attempts. Keyed verifiers protect stored checking secrets; expiry is not automatic deletion of every associated record. |
| Email delivery records | An encrypted outbox holds the recipient and code payload, linked to a verification/reset issuance, with attempt/status/timing metadata. The worker decrypts eligible messages for sending; the SMTP provider and recipient mailbox receive the email content. Queue encryption is not end-to-end email encryption. |
| Sessions and account-access records | A signed browser cookie maintains access; the database stores a keyed session-token digest, user link and timestamps. Tailor sessions have a fixed seven-day expiry without renewal. Logout revokes the current session; reset and deletion requests revoke all sessions. Account-lock/request timestamps enforce access restrictions. |
| Security counters and technical request information | The server processes the real connection address and canonical email to apply account/IP limits. Stored bucket identifiers are keyed digests, not plaintext email/IP keys. These remain potentially linkable security data, not anonymous statistics. Session IP/user-agent fields exist in the schema; their population and any wider request logging must be inventoried before publication. |
| Platform administration and Terms records | A server-controlled administrator flag permits the restricted aggregate-security summary, not access to tailoring-business records. TermsVersion stores shared document provenance; TermsAcceptance can link an account to a version/time/context. Current development signup defers legal consent and creates no fictitious acceptance. Test acceptances are not approved public Terms. |

For signup and final password reset, the breached-password check sends Have I Been Pwned
only the first five hexadecimal characters of a locally calculated SHA-1 digest. Matching
happens on the server; the password, full digest, name and email are not sent to that
service. The service can receive connection metadata from StitchTrack's server. SHA-1
is used for the range lookup, not credential storage; an unavailable check fails closed.

The planned tailoring service would also handle:

- Business-owned customer names, phone numbers and optional emails, plus invitations and
  verified client-to-business links for passwordless access.
- Orders and individual clothes items; versioned measurements; fabric/style pictures;
  garment notes, prices, delivery dates, agreements, approvals and controlled changes.
- Fittings, adjustments, delivery progress and service reminders.
- Manual records of payments made directly from clients to tailors, including corrections.
  StitchTrack V1 does not process those payments or independently verify the transfers.

These planned records help a tailor and client preserve exactly what was agreed for each
item. Their implementation, collection-point privacy information, access controls and
retention must be verified before real customer processing. No payment-card collection,
subscription billing or automatic sharing across businesses is implied.

## Who should have access and which services are involved

A tailor may access their own authenticated account. Future business records must be
limited to authorized business members and securely linked clients; a matching email or
a valid login alone must not grant access. An administrator role is separate from business
membership. The implemented admin action exposes aggregate authentication-security counts,
not individual emails, passwords, tokens or garment records. Necessary operator and service
access must be limited and reviewed; production access/audit arrangements are unfinished.

The application uses PostgreSQL, Prisma and Better Auth, with Nodemailer for SMTP email.
These software choices do not identify contracted hosting or storage providers. Gmail was
used in owner-controlled SMTP tests; that does not appoint it as the launch provider or
establish processing countries, contracts or retention. Have I Been Pwned is involved in
the limited password check described above. Actual hosting, database, email, image-storage,
backup and logging providers, their access, locations and international transfers still
need confirmation. No Nigeria-only storage or approved transfer arrangement is asserted.

Authentication cookies are HttpOnly and SameSite=Lax. HTTPS uses Secure cookies; an explicit
loopback-only HTTP development exception omits Secure and cannot enable production.
Passwords, codes and session secrets must not appear in logs or assessment captures. This
is not a blanket claim that the website or its providers keep no technical logs.

## Requesting account deletion

In the enabled authenticated application, use **Delete my account** near the signed-in
account controls and confirm your current password. The server derives your identity from
your session, rechecks eligibility and applies request limits. It does not accept a
browser-supplied identity as permission to delete someone else's account.

The current behavior and the corrected wording replacing the unsupported promise are:

> Requesting deletion locks your account and revokes your existing sessions immediately after the request is successfully authorized and committed. It does not itself erase your records. Later erasure is a separate process; it has so far been demonstrated only on controlled synthetic PostgreSQL test fixtures, and no production erasure service is operational. A maximum 30-day erasure target is proposed for a future verified service, not an active guaranteed deadline; no fixed grace period has been approved or deployed.

Other browsers lose access through server-side revocation and lock checks, not just cookie
clearing on the requesting device. If the response is uncertain, the interface does not
claim that erasure succeeded or that a committed lock was rolled back. There is no
self-service reactivation or approved restoration procedure.

This authenticated control is the implemented request route for eligible tailor accounts.
A verified alternative channel for people unable to sign in, clients without accounts or
other privacy requests is still missing. No support email, office address, export screen
or alternative request channel is invented here. Do not send passwords or codes as part
of a privacy request. A monitored channel and proportionate identity-checking procedure
must be established before public use; the absence of a screen does not settle anyone's
applicable rights.

## What deletion, retention and anonymisation mean here

| Category | Present position |
| --- | --- |
| Data eligible for erasure | Account identity, credential hashes, residual sessions, attributable verification/reset records and encrypted outbox payloads can be erased together by the controlled fixture proof. It checks relationships and historical-data fingerprints, then commits all required deletes or rolls back. Real-user erasure is not yet operational. |
| Records that may need justified retention | Actual agreement/claims records or Terms acceptance evidence might require a specific legal or business justification. No obligation or duration is established here. Real TermsAcceptance records block the current erasure job pending review; synthetic acceptances are erased. Shared TermsVersion documents are retained independently, not treated as another user's account data. |
| Abuse-prevention records | Active keyed rate-limit budgets are not reset by deleting an account. The proof removes only exact expired synthetic keys. General maintenance periods, necessity and operational cleanup still need review. |
| Potentially anonymised information | Properly de-identified aggregate statistics could potentially be retained if people cannot reasonably be identified. No general anonymisation job or approved standard is implemented. Token hashes, keyed identifiers, encrypted email and linked acceptance records are not anonymous merely because they are protected. |
| Backups and external copies | The proof does not erase backups, WAL/replicas, external images, provider logs or mail already sent to provider/recipient systems. Their retention, access, expiry and restore-time reconciliation are unverified. Removing a database image reference would not prove that the file was erased. |
| Future customer/business records | Closing a tailor login must not silently destroy a client's approved agreement or another business's records. Record-specific retention, lawful grounds, minimisation and responsibilities need review before those features operate. The PRD's image lifecycle is proposed, not a deployed deletion promise. |

No blanket legal hold, indefinite retention right or automatic exception process exists.
Any future exception needs a specific purpose/basis, necessary scope, justified duration,
restricted access and review/end condition. Reading this draft or accepting Platform Terms
is not blanket privacy consent. Terms acceptance, privacy information and purpose-specific
consent must remain distinct.

## Decisions and capabilities required before publication

1. Confirm the individual operator's identity, appropriate contact details and a monitored
   privacy-request route, including access/correction/deletion requests when sign-in is
   unavailable. Assign responsibility, identity checks, escalation and incident handling.
2. Obtain qualified Nigerian privacy/legal review of purposes, lawful bases, operator versus
   tailoring-business responsibilities, client notice delivery and any required processing
   arrangements. Do not assume a contract supplies every basis or claim full NDPA/GDPR compliance.
3. Inventory actual providers, processing/access countries, external assets, technical logs,
   backups and transfers, and confirm relevant contractual safeguards and retention criteria.
4. Decide real TermsAcceptance and future garment/business retention, potential anonymisation
   and documented exceptions without inventing periods or overriding approved agreements.
5. Verify non-fixture erasure, restricted operational authority, safe pending-mail handling,
   scheduling, failure/deadline monitoring and backup/restore reconciliation before adopting
   the proposed maximum-30-day target as a public commitment.

**Task Five gap:** the separate assessment requirement for a defined, justified grace period
and operational scheduled deletion remains unmet. No fixed grace period has been approved
or deployed; the fixture job permits prompt processing and its two successful owner runs
were manually triggered. A grace period must be explicitly justified and reconciled with
prompt erasure and any later adopted maximum target, not inferred from the number 30.
No scheduler is represented as deployed by the evidence filenames.

## Assessment sources and version boundary

The [current Task Five checkpoint](README.md) supersedes older prepared/pending status
passages in linked design records. See the [nine-model retention matrix](docs/retention-matrix.md),
[account lifecycle](docs/account-lifecycle.md), [reset design](docs/password-reset.md),
[session protection](docs/sessions.md) and [administrator boundary](docs/administration.md).
Implemented safeguards and fixture scope are grounded in the
[deletion service](../lib/product-auth/account-deletion.server.ts),
[locking service](../lib/product-auth/account-access.server.ts),
[erasure engine](../lib/product-auth/account-erasure.server.ts),
[session service](../lib/product-auth/session.server.ts),
[outbox worker](../lib/product-auth/outbox-worker.server.ts) and
[product schema](../prisma/product/schema.prisma).
The existing [Task Three privacy candidate](../task-03-client-validation/docs/privacy-policy-v1.0-candidate.md)
and [operator decision record](../task-03-client-validation/docs/legal-operating-decisions.md)
remain review artifacts; this assessment draft does not approve or publish them.
The [deliberately flawed draft](privacy-draft-with-broken-promise.md) records the unsupported
promise and why it was removed, without claiming that it was ever published.
