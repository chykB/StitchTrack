# StitchTrack Privacy Policy

**V1.0 CANDIDATE — OWNER/LEGAL REVIEW PENDING — NOT PUBLIC — NOT EFFECTIVE**

No effective date has been assigned. This candidate describes known current processing separately from the intended individually operated service. It is not a published notice, a finding of compliance or a record of user acceptance. Unknown release facts below must be resolved before publication.

## 1. Operator, scope and current processing

StitchTrack is initially intended to be operated personally by its individual owner in Nigeria, for tailoring businesses and their clients, with a free initial pilot. StitchTrack is the product brand, not an assumed company or separate legal operator. No company or business-name registration is asserted.

[OWNER DECISION REQUIRED: Confirm the individual operator's full legal name, appropriate service/contact address and monitored privacy-request channel, consistently with the Platform Terms. Confirm any applicable business-name requirements before public operation.]

The service has not publicly launched. Restricted local development now supports real backend registration, email verification, login, session lookup and logout. An enabled form submission sends the entered name, email and password, or verification input, to the application server for the relevant checks. Account and security records can be stored in the isolated product-test database. Client portals, customer/order/image/payment workflows, password reset, export and complete account deletion are not yet released.

Development signup uses an explicit, development-only consent-deferral mode. It creates no public Terms acceptance record and does not approve these documents. Future normal registration must require genuine acceptance of an approved Terms version, with the Privacy Policy accessible. Deferring contractual acceptance does not remove the need for an appropriate basis and safeguards for actual personal-data processing.

Verification messages are queued with encrypted payloads. A separately started worker can submit eligible messages through the configured SMTP service; delivery is not guaranteed. Gmail has been used in owner-controlled SMTP testing; this does not establish the launch provider or its processing locations. Assessment/test history is not a promise that production processing is ready.

Website use also produces ordinary page/asset requests. The font is locally served. Password visibility only changes the display; password-manager storage/autofill is controlled separately by the browser and user. The release's hosting, logging, cookies and storage still need a complete inventory; no service-wide no-logging or no-cookie assurance is made.

## 2. Information and intended operational purposes

This table separates implemented local account processing from planned customer workflows.

| Information and source | Purpose and present boundary |
| --- | --- |
| Tailor personal/display name, canonical email, password hash, account identifiers, verification/access status and timestamps | Create and secure the account in restricted development. Email is trimmed and lowercased; accepted passwords retain their exact characters and are hashed with Argon2id. The business name is collected separately in the planned business-setup flow. |
| Verification identifiers, keyed code verifiers, expiry/attempt/use records and encrypted queued email payloads | Verify email control and manage delivery. The email service sees the recipient and code in the message; encrypted queue storage is not end-to-end encryption of email. A code's five-minute validity is not a record-deletion deadline. |
| Session cookie, server-side session-token digest, account link and expiry records | Maintain verified account access and revoke sessions on logout or an authorized account lock. The current tailor session has a fixed seven-day expiry without automatic renewal. Public production authentication remains disabled. |
| Network address processed at the request boundary and keyed identifiers derived from canonical email/network address, with counter and expiry metadata | Enforce shared account/IP abuse limits. The rate-limit table uses derived identifiers, not raw email/IP identifiers. Any additional IP/user-agent collection or logging and its retention must be confirmed for the release. |
| Approved Terms version/reference, account, acceptance context and timestamp | Evidence the specific contract when normal acceptance is enabled. The current development consent-deferral path writes no acceptance; synthetic fixtures and draft acknowledgements are not acceptance of public Terms. |
| Client name, phone and optional email supplied by a tailoring business | Maintain that business's planned customer records. A client may have no email or portal access; this does not remove privacy-notice or applicable rights requirements. |
| Invitations, verified client email and authorized business links | Provide planned passwordless client access scoped separately to each business. Matching contact details alone do not authorize access. |
| Measurements and versions, garment descriptions, fabric/style images, notes, agreements, approvals/rejections and change history | Present and preserve each clothes item's exact agreed terms and controlled changes. These customer workflows remain planned. |
| Tailor-entered manual payment/correction records, fittings, adjustments and delivery events | Show recorded balances and work progress in the planned service. Money passes directly between client and tailor; StitchTrack does not process or verify transfers. |
| Reminder/email delivery attempts and in-app/read records | Provide planned service and delivery reminders. Verification-email infrastructure exists; operational garment reminders are not yet available. |
| Necessary technical logs and information supplied in support, rights or incident reports | Operate/protect the service and handle requests. Actual logged fields, access, procedures and retention require confirmation; no working public support process is implied. |

At signup, the password is also checked against Have I Been Pwned before account creation. The server calculates the SHA-1 lookup locally, sends only the first five uppercase hexadecimal characters to the range service and compares returned suffixes locally. It does not send the password, full digest, email or name to that service. The service receives technical connection information. SHA-1 is used only for this lookup, never for password storage. An unavailable check prevents registration rather than accepting an unchecked password.

Required account data, platform Terms acceptance, privacy information and purpose-specific consent are separate matters. Without email verification and an authorized invitation, a client cannot use the planned portal or digitally approve agreements. No advertising tracking or AI processing of customer records is authorized for the initial pilot. Images and measurements require careful handling; not every image is automatically biometric data.

## 3. Responsibilities and lawful bases

The individual operator generally determines purposes and means for platform accounts, authentication, security and administration. The intended controller/processor allocation must be confirmed for each activity. Tailoring businesses generally determine purposes for their customer and garment records, with the operator processing on their instructions where appropriate. Global client identities, business links, complaints and dispute evidence need activity-specific allocation.

A separate business Data Processing Agreement must be reviewed for processor activities before operational customer processing. A business's contract with StitchTrack does not itself provide a lawful basis for every use of a client's data.

| Purpose | Basis requiring confirmation before the relevant processing |
| --- | --- |
| Requested individual account access, verification and recovery | Contract/pre-contract necessity where that person is party to the relevant contract; confirm business representatives' position separately. |
| Necessary security, abuse prevention and technical operation | Assess necessity, legitimate interests and balancing/safeguards, or identify a specific applicable legal obligation. |
| Business-controlled customer, agreement, image, payment and reminder records | The responsible controller must identify the basis for each purpose; the platform contract alone is insufficient. |
| Rights handling, legally required disclosure and justified dispute retention | Identify the actual legal obligation or justified limited interest, scope and retention; do not infer an unlimited exemption. |

[OWNER DECISION REQUIRED: Confirm applicable privacy laws and purpose-by-purpose lawful bases for actual development and planned service processing; finalize roles, business processing terms, sensitive-data/capacity safeguards and any required consent, assessments, registration or responsible privacy-officer arrangements. Individual operation is not a finding of exemption or of NDPA/GDPR compliance.]

Reading this notice or accepting Terms is not blanket consent. If a purpose relies on consent, it needs a specific informed choice and applicable withdrawal process. No unrelated marketing permission is bundled into account access.

## 4. Privacy information for clients

A tailoring business may collect a client's details before an invitation, or without ever inviting them to the portal. The intended notice process must therefore cover collection outside the portal, as well as invitation/access screens. It must identify the business and platform roles, sources, purposes, recipients and rights without requiring garment approval or a platform account first.

[OWNER DECISION REQUIRED: Confirm collection-point notice text, responsible sender/timing, invitation/portal presentation, accessible non-portal delivery and material-update notices.]

These delivery arrangements are not yet implemented. Tailors must not be told that a future portal notice has already informed clients who never received it.

## 5. Recipients and international processing

Planned business records are intended to be visible only to the authorized business and securely linked clients. Access across several businesses must not expose one business's records to another. This authorization model remains to be implemented for operational customer workflows.

Necessary recipient categories may include hosting/database, storage, backup and logging providers, email delivery services, and authorized support or professional advisers. Disclosure under a legal demand needs its own lawful justification. Provider access must be limited to the relevant service purpose.

Gmail is verified for owner-controlled SMTP testing; Have I Been Pwned is used by the implemented signup range check described above. Neither fact settles the launch contracts, locations, subprocessors or transfer grounds. Nodemailer, Prisma and Better Auth are software dependencies, not proof of a hosting or provider arrangement. A proposed image service is not a confirmed appointment.

[OWNER DECISION REQUIRED: Inventory actual current and launch providers, recipient categories/purposes, processing/storage/backup/logging and remote-access countries, contractual roles and safeguards, and how people obtain relevant transfer information. Confirm hosting and operational email arrangements rather than assuming the test setup is the launch service.]

No Nigeria-only processing or approved international-transfer mechanism is asserted. Transfers must be assessed against the actual recipient and activity before use; a generic consent clause cannot supply missing facts or protections.

## 6. Retention, corrections and deletion

The intended policy is category-specific retention tied to justified service purposes, legal obligations and limited evidence needs, with reviewable deletion triggers and justified holds. Actual periods/criteria and operational deletion remain unresolved.

A code's five-minute validity does not erase its challenge, failed-attempt history, queued message or provider copy. Internal records can remain after expiry; no automatic cleanup schedule is claimed. Session expiry likewise is not a promise of immediate record deletion.

Operational submitted agreements will preserve exact versions and references. Corrections and privacy requests must be handled without falsifying another person's approved record. This does not authorize indefinite retention or blanket refusal of erasure. Images are intended to be private/access-controlled and subject to reviewed notice/deletion rules; after eligible deletion, necessary non-image history would identify unavailable originals. The PRD image timetable remains proposed and is not an active deletion promise here.

Account closure, ending a business link, exporting records and erasing data are different actions. Internal account locking and session revocation do not erase the account or its related history. Public closure requests, customer-record export, anonymisation and retention-aware scheduled purge are not released. The notice does not guarantee immediate erasure, a deletion period, backup expiry or permanent image storage.

[OWNER DECISION REQUIRED: Approve periods or concrete criteria/triggers for accounts, acceptance evidence, challenges/outbox/sessions, customer/agreement/image/payment/delivery records, logs, requests and backups; define holds, closure effects, processor instructions and deletion propagation.]

## 7. Rights and request procedures

Subject to applicable conditions, individuals may seek information/access, correction, erasure, restriction, object to processing, request portability and withdraw consent where consent is the basis. Applicable protections concerning solely automated decisions must also be assessed. A self-service screen or garment approval is not a prerequisite for exercising rights.

[OWNER DECISION REQUIRED: Provide a monitored privacy channel and workable request process, proportionate identity checks, responsible decision-makers, operator/business routing, lawful response periods and complaint escalation.]

The intended procedure must explain any lawful limitation and help route business-controlled requests rather than pass all responsibility elsewhere. Do not send passwords or verification codes with a request. No working support/rights procedure or response guarantee is represented as already available.

Individuals may complain to the [Nigeria Data Protection Commission](https://ndpc.gov.ng/). Contacting platform support first is not a condition or waiver of that right.

## 8. Security and incidents

Implemented authentication uses Argon2id password hashes, keyed verification secrets, encrypted email-queue payloads, digest-only server-side session tokens, shared rate limits and account-lock checks. Session cookies are HttpOnly and SameSite=Lax; the explicitly restricted loopback HTTP development path omits Secure, while HTTPS uses Secure cookies. Public authentication remains disabled. The owner reports scoped PostgreSQL and SMTP tests; these are not certification of the public service or proof of completed business/client isolation, production deployment, recovery or incident response.

Before real customer processing, the relevant release must implement and verify its HTTPS deployment and trusted network boundary, business/client authorization, operational key/access management, abuse controls and protection of private records. No system is promised to be immune from incidents; SMTP acceptance does not guarantee inbox receipt.

[OWNER DECISION REQUIRED: Establish incident intake, containment/evidence and escalation procedures, responsible parties and legally required regulator/individual notification handling, including assistance to tailoring businesses acting as controllers.]

## 9. Versions and publication

Material privacy changes need appropriate notice to affected people. A revised notice is not automatic consent to a new purpose or a retrospective garment change. Platform Terms acceptance, privacy information and purpose-specific consent remain independent.

This candidate is not published at /privacy, is not effective and has not replaced the historical v0.2 local preview. The [Platform Terms candidate](platform-terms-v1.0-candidate.md) addresses the separate platform contract. Before publication, the marked identity, contact, processing, recipient, retention and request-handling gaps must be resolved and the text reviewed against the actual release with qualified Nigerian legal/privacy support. No company incorporation is assumed or made a prerequisite for continuing development by this candidate. No internal planning target becomes a retention period or response promise through this text.
