# StitchTrack Product Requirements Document

**Version:** 1.1  
**Status:** V1 working specification  
**Platform:** Mobile-first web application  
**Target users:** Independent tailors, small fashion studios and their clients in Nigeria

## 1. Product Overview

StitchTrack helps tailors manage customer orders, measurements, fabric pictures, style references, agreements, payments and delivery dates.

Clients can securely access their own dashboards without creating passwords. They can review their orders, approve agreements, request changes and track delivery progress.

The product addresses missed delivery dates, forgotten measurements, lost style references and disagreements about what was originally agreed.

An initial interview with a fashion studio worker identified managing multiple delivery dates as a major challenge. Further user research is needed to validate the other problems.

StitchTrack is not a fashion marketplace, clothing design application or accounting platform.

## 2. Users and Authentication

StitchTrack has two V1 user types: **Tailor** and **Client**.

### Tailor

The tailor creates and manages their business account using email and password.

They can:

- Create clients and orders.
- Record measurements.
- Upload fabric and style pictures.
- Propose agreements and changes.
- Record fittings and adjustments.
- Record payments received.
- Update delivery progress.
- Receive delivery reminders.

### Client

Clients do not create passwords or complete a traditional registration form.

The tailor records the client's name, phone number and email address when creating a customer record.

To access StitchTrack, the client:

1. Receives a private invitation from the tailor.
2. Opens the invitation and enters their email address.
3. Receives a six-digit verification code by email.
4. Enters the code to verify their email.
5. Gains access to their authorized client dashboard.

Later visits require email verification when the client's existing session has expired.

### Authentication Technology

- Better Auth for authentication and session management.
- Better Auth Email OTP plugin for passwordless client access.
- Nodemailer for sending verification emails.
- PostgreSQL and Prisma for identity and session records.

**Proposed security defaults:**

| Setting | Value |
|---|---|
| Email verification code | 6 digits |
| Code validity | 5 minutes |
| Invalid attempts | 3 per code |
| Resend cooldown | 60 seconds |
| Client session | 7 days |
| Invitation | Single-use, expires after 72 hours |

Rate limits must also apply to verification requests by account and IP address.

### Client Identity and Security

One verified client identity can be linked to multiple tailoring businesses.

However:

- The same email appearing in two customer records does not automatically grant access.
- Each business relationship requires a verified invitation.
- A masked phone number or matching phone digits cannot authenticate a client.
- A client cannot access another client's records.
- A tailor cannot access another tailoring business's records.
- An incorrectly entered email must be corrected through a new verification process.

The invitation must be delivered through a channel the tailor has confirmed with the actual client. Email verification proves control of the email address, while the separate invitation authorizes the specific business relationship.

A customer record can exist without an email address, but its client cannot use the portal or digitally approve an agreement until secure access is established.

## 3. V1 Scope

StitchTrack V1 includes:

1. Tailor accounts and passwordless client access.
2. Customer records and orders.
3. Multiple individual clothes items per order.
4. Versioned measurements.
5. Fabric and style pictures.
6. Versioned agreements and client approval.
7. Controlled changes, fittings and adjustments.
8. Manual payment records and balances.
9. Delivery tracking.
10. Email and in-app delivery reminders for tailors.
11. Client dashboard across participating businesses.

### Out of Scope

- Fashion marketplace.
- Fabric inventory.
- Clothing design tools.
- Advanced accounting.
- WhatsApp and SMS automation.
- AI-generated answers.
- Payment gateway processing between clients and tailors.
- Paid subscriptions.
- Advanced staff permissions.
- Offline data synchronization.

The initial pilot is free. Future pricing remains a separate business decision.

Flutterwave is reserved for possible future subscription payments from tailoring businesses to StitchTrack. It is not used to process payments from clients to tailors.

pgvector and Gemini free tier are identified technologies but have no approved V1 product use case. Do not implement runtime AI or vector search features without a separate approved requirement.

## 4. Functional Requirements

### FR-01: Customer and Order Management

A tailor can create a customer using:

- Full name.
- Phone number.
- Optional email address.

Each customer belongs to one tailoring business.

A tailor can create an order containing one or more individual clothes items.

Each item has its own measurements, fabric and style references, agreement, price and delivery commitment.

Orders and items must never reference records belonging to another business.

### FR-02: Measurement History

Tailors can record client measurements in centimetres or inches.

Measurements belong to the client and can be reused for later orders.

Each measurement-taking event creates a new version.

Older measurement versions cannot be overwritten.

Approved agreements identify the exact measurement version used.

### FR-03: Fabric and Style Pictures

Each clothes item must have:

- **One fabric picture:** The actual fabric selected for the clothes.
- **One style picture:** The design the client expects the tailor to produce.

Both are mandatory before submitting an agreement for approval.

The tailor can add descriptive notes for the fabric and style.

The tailor and client must see both pictures on the order details screen.

The client must also see the pictures while reviewing the agreement.

Each submitted agreement preserves the exact fabric and style pictures presented for approval.

If either picture changes after approval, a new change proposal and client approval are required.

A later agreement version may reuse an existing picture when it has not changed.

### FR-04: Agreements and Approvals

The tailor prepares an agreement for each clothes item containing:

- Clothes description.
- Fabric picture.
- Style picture.
- Measurement version.
- Price.
- Delivery date.
- Relevant notes.

The client opens the agreement through their verified dashboard.

The client can:

- Approve the agreement.
- Reject the agreement.
- Request a change.

Submitted agreements are immutable.

An editable draft is not an approved agreement.

Each submitted version may have only one final resolution: approved, rejected or withdrawn.

Only an authenticated, securely linked client can approve or reject their agreement.

The tailor cannot approve on the client's behalf.

An approved agreement becomes the effective reference for the clothes item.

### FR-05: Changes, Fittings and Adjustments

Clients can request changes to an order through their dashboard.

The tailor reviews the request and prepares a proposed amendment when the request affects approved terms.

Changes to fabric, style, measurements, price or delivery date require client approval.

Approval creates a new effective agreement version.

Rejection preserves the existing approved agreement.

Earlier versions remain available.

Tailors can record simple fitting notes and adjustments without changing approved commercial terms.

### FR-06: Manual Payment Records

Clients pay the tailor directly through cash, bank transfer, POS or another agreed method.

StitchTrack does not collect or process the payment.

After receiving money, the tailor records:

- Amount.
- Payment date.
- Payment method.
- Optional reference or note.

StitchTrack displays the total amount recorded as received and the outstanding balance.

For an order containing several clothes items, the approved total is the sum of the effective approved prices.

If some items have no approved price, the system must not present an incomplete total as final.

Clients see:

**"Payment recorded by tailor. Not independently verified by StitchTrack."**

Payment records cannot be silently overwritten or deleted.

Corrections use reversing entries with a reason and recorded actor.

Refunds happen outside StitchTrack and are recorded separately.

Overpayments appear as credits requiring review. StitchTrack never automatically refunds money.

Duplicate submissions must not create duplicate payments.

V1 does not integrate Flutterwave or any other payment gateway for customer-to-tailor payments.

### FR-07: Delivery Tracking

Each clothes item has its own approved delivery date and progress.

V1 delivery states:

- `NOT_STARTED`
- `IN_PROGRESS`
- `READY`
- `DELIVERED`
- `CANCELLED`

A tailor updates progress as work proceeds.

Delivery confirmation records the actor and actual delivery time.

Before agreement approval, the tailor can cancel an item with a recorded reason.

After approval, cancellation requires the client's explicit agreement, and any payment consequences must be recorded.

Delivered or cancelled items do not receive future delivery reminders.

Only approved changes can modify the effective delivery date.

### FR-08: Delivery Notifications

Tailors receive reminders through:

- In-app notifications.
- Email using Nodemailer.

**Proposed V1 schedule:**

| Reminder | Time |
|---|---|
| Upcoming delivery | 9 AM WAT, one calendar day before the approved date |
| Overdue delivery | 9 AM WAT, the day after the approved date if still undelivered |

The schedule must use the approved date and the business's configured timezone.

The system must:

- Avoid duplicate logical reminders.
- Suppress obsolete reminders after an approved date change.
- Stop future reminders after delivery or cancellation.
- Keep in-app notifications available in the notification centre.
- Record email delivery attempts and failures.
- Retry eligible failed sends without blocking order management.

A background process sends emails independently of whether the tailor has StitchTrack open.

Nodemailer is the approved email library. An SMTP service is still needed for actual delivery.

A dedicated Gmail SMTP account may be used for small pilot testing. Production email infrastructure must be verified before launch.

### FR-09: Tailor Dashboard

The dashboard displays:

- Upcoming deliveries.
- Overdue clothes items.
- Orders in progress.
- Pending client approvals.
- Recorded outstanding balances.
- Unread delivery notifications.

Opening an order shows:

- Client information.
- Clothes items.
- Fabric and style pictures.
- Measurements.
- Effective agreement.
- Payment history.
- Delivery status.
- Previous changes and approvals.

### FR-10: Client Dashboard

The client can access the dashboard after email verification.

The dashboard shows orders from every tailoring business securely linked to that client's identity.

For each clothes item, display:

- Tailoring business.
- Clothes description.
- Fabric picture.
- Style picture.
- Approved price.
- Approved delivery date.
- Current progress.
- Recorded payments.
- Outstanding balance.
- Agreement approval status.

The client can open an order to view complete agreement history, approve pending proposals or request changes.

Clients cannot directly edit approved agreements or modify payment and delivery records.

## 5. Image Storage and Retention

### Storage

**Proposed service:** Cloudinary Free.

The system must use private or access-controlled storage, not unrestricted public URLs for customer images.

Accepted file formats:

- JPEG.
- PNG.
- WebP.

**Proposed limit:** 3 MB per uploaded picture.

Images should be optimized for web display without materially changing fabric colours or hiding design details.

Each agreement contains one fabric picture and one style picture per clothes item.

### Retention Policy

Proposed lifecycle:

1. During an active order, pictures remain accessible.
2. Thirty days after confirmed delivery, the order moves to archived status.
3. Archived pictures remain accessible through order history.
4. Eleven months after delivery, notify the tailor that eligible pictures are scheduled for deletion.
5. Twelve months after delivery, delete eligible picture files unless a dispute or other legitimate retention requirement prevents deletion.

The tailor must receive 30 days' notice before scheduled picture deletion.

Clients must be informed about the retention policy.

Archiving alone does not reduce cloud storage usage.

After deletion, the system keeps the minimum necessary non-image agreement history and clearly indicates that the original pictures are no longer available.

This retention schedule is a proposed product policy and must pass a privacy and legal review before real customer data is collected.

## 6. Data Model

| Entity | Purpose |
|---|---|
| User | Global identity for tailor or client |
| Business | Tailoring business |
| BusinessMember | Authorized business ownership |
| Client | Business-owned customer record |
| ClientAccountLink | Verified association between client and user account |
| ClientInvitation | Single-use invitation for client portal access |
| Order | Customer order |
| ClothingItem | Individual clothes item |
| MeasurementVersion / MeasurementEntry | Reusable measurement history |
| FabricReference | Fabric picture and description |
| StyleReference | Style picture and description |
| AgreementDraft | Editable agreement |
| AgreementVersion | Immutable submitted agreement |
| AgreementResolution | Approval, rejection or withdrawal |
| ChangeRequest / ChangeProposalVersion / ChangeDecision | Controlled change history |
| FittingEvent / AdjustmentEvent | Work history |
| PaymentRecord | Tailor-recorded external payment |
| PaymentCorrection | Reversal or correction history |
| DeliveryEvent | Progress and delivery confirmation |
| NotificationIntent | Delivery reminder event |
| NotificationDelivery | Email and in-app delivery status |
| NotificationRead | Read state for business notifications |
| EmailOutbox | Pending email delivery work |

### Database Rules

- Every business-owned record must be restricted to the correct business.
- A client can access only records linked to their verified identity.
- Fabric and style references must belong to the correct clothes item.
- Approved agreements must preserve exact historical references.
- Payments use exact decimal monetary values.
- Important multi-record changes must be atomic.
- Concurrent approvals cannot create contradictory effective agreements.
- Notification jobs must recheck current delivery status before sending.
- Record identifiers alone never grant authorization.

The final Prisma schema will be designed and reviewed during the relevant implementation milestones.

## 7. Technical Requirements

### Locked Stack

- Next.js App Router.
- TypeScript.
- Prisma ORM.
- PostgreSQL.
- Zod.

### Authentication and Email

- Better Auth.
- Better Auth Email OTP for passwordless client access.
- Nodemailer for email verification and delivery notifications.

### Interface

Reuse the Task One StitchTrack design system:

- Tailored Wine colours.
- Existing semantic tokens.
- DM Sans typography.
- Responsive layouts.
- Clear error, loading and empty states.

The interface must be mobile-first and work reasonably on slower networks.

### Security

- Validate authentication and authorization on the server.
- Never link client accounts using email or phone matches alone.
- Limit verification attempts and resend frequency.
- Protect private images and measurements.
- Preserve approved agreement history.
- Keep credentials out of Git.
- Use HTTPS in production.
- Provide safe error messages.
- Test cross-business and cross-client access.

### Development and Database Operations

- Use separate development and test databases.
- Coding agents may inspect the schema and propose changes.
- The developer runs database migrations in the terminal.
- Coding agents must not execute migrations or operate on the development database.
- Test-database operations require task-specific authorization.
- No database models or connections are required for the initial application scaffold.

## 8. Implementation Milestones

| Milestone | Work |
|---|---|
| M1 | Task Two: Next.js scaffold, design tokens, PostgreSQL, Prisma, minimal home page and persistence evidence |
| M2 | Tailor authentication and passwordless client portal |
| M3 | Client records, multi-item orders, measurements, fabric and style pictures |
| M4 | Versioned agreements, client approvals and controlled changes |
| M5 | Fittings, manual payments and delivery tracking |
| M6 | In-app notifications and Nodemailer delivery reminders |
| M7 | Complete dashboards, testing and pilot |

### Task Two Boundary

The initial scaffold includes only project configuration, the existing design tokens, a basic layout and one responsive landing page.

Database persistence verification is a separate Task Two activity.

Task Two must not implement the full product, authentication, payment processing, agreement workflows or notifications.

## 9. Success Metrics and Risks

### Pilot Metrics

1. Percentage of active clothes items with approved delivery dates.
2. Percentage of eligible reminders processed on time.
3. Percentage of approved changes with complete preserved history.
4. Percentage of sampled payment balances matching external payment evidence.
5. Percentage of pilot tailoring businesses still recording real orders after four weeks.

Targets will be established during pilot planning.

### Risks

| Risk | Mitigation |
|---|---|
| Unauthorized client or business access | Verified invitations and server-side authorization |
| Lost fabric or style evidence | Immutable agreement references and controlled image retention |
| Incorrect payment balances | Exact decimal calculations and preserved payment records |
| Missed or repeated reminders | Persistent notification events and controlled retries |
| Low client adoption | Passwordless access and a simple mobile dashboard |
| Email delivery failures | Retry handling, in-app fallback and SMTP monitoring |

## 10. Decisions and Launch Requirements

### V1 Product Decisions

- Two user types: Tailor and Client.
- Tailors use authenticated business accounts.
- Clients use passwordless email verification.
- A verified invitation is required to associate business-owned client records with a client account.
- Exactly one fabric picture and one style picture are required per clothes item in each submitted agreement.
- Clients approve or reject agreements themselves.
- Approved agreements and changes preserve their history.
- Tailors collect customer payments directly and enter payment records manually.
- Flutterwave is reserved for possible future payments from tailors to StitchTrack.
- Delivery reminders use email and in-app notifications.
- Nodemailer is the email library.
- The initial pilot is free.

### Configuration and Launch Checks

Before the related features are used with real customers, confirm:

1. Authentication rate limits and account-recovery behavior.
2. Client invitation delivery, correction and expiry.
3. Image storage capacity, private access and retention compliance.
4. SMTP sender, quotas, hosting and retry limits.
5. Payment dispute, reversal and refund procedures.
6. Data export, backup and deletion procedures.
7. Final reminder sending times.
8. Pilot targets and success criteria.

These implementation and launch checks must not be silently omitted.

### Core V1 Principle

StitchTrack must preserve what the tailor and client agreed.

Every clothes item must retain its measurements, fabric picture, style picture, approved terms and change history, subject to the approved retention policy.

The client must be able to view those records securely without creating a password.

The tailor must be able to track delivery commitments and recorded payments without processing customer payments through StitchTrack.