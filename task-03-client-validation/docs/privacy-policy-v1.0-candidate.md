# StitchTrack Privacy Policy

**v1.0 candidate | Owner content review | NOT APPROVED | NOT PUBLIC**

No effective date has been assigned. This candidate describes verified application behaviour separately from planned operational V1 processing. It is not a published privacy notice or a claim of legal compliance.

## 1. Scope and company-operated service

StitchTrack is being developed for company operation in Nigeria. The planned initial operational pilot is free. The product name does not establish incorporation, registration or a verified company identity.

This document distinguishes the current informational website and UI-only authentication forms from the planned service for tailoring businesses and their clients.

## 2. Current email and password forms

Email and password values are read in the browser to check the current form rules and display feedback. They remain in transient form and component memory. The authentication components do not send them to an authentication endpoint, log them, write them to application-managed persistent storage, create accounts or sessions, or deliver emails.

The password visibility control changes only whether the typed password is displayed. Browser password-manager storage or autofill is controlled separately by the browser and user; the application does not implement that storage.

The opt-in local development preview includes an acknowledgement of unapproved v0.2 drafts. Its checked state is local and is not saved as an acceptance record. The preview does not collect contractual acceptance or consent to unrelated processing.

## 3. Separate synthetic-data assessment experiment

A separate assessment tool can write a synthetic name and enquiry, a database identifier, a request identifier and a creation timestamp to an explicitly configured assessment PostgreSQL database. It is disabled by default, restricted to local development and unavailable in production. It does not create customer accounts, tailoring orders or authentication sessions.

The endpoint emits structured request logs containing time, request identifier, method, assessment path, HTTP status, duration and outcome, plus the record identifier and creation time on success. Its application log allow-list excludes enquiry contents, passwords and database credentials. This is distinct from infrastructure or development-server logging.

The tool is intended only for synthetic input. It must not be used for real customer information or credentials. Its records are not automatically deleted by the application; cleanup requires a separately reviewed process. Describing authentication as UI-only does not mean this separate experiment cannot persist data.

## 4. Technical requests and storage

Loading the website involves ordinary browser/server requests for pages and assets. Request information is distinct from the email and password values checked locally. The application serves its DM Sans font from a local website asset.

The inspected authentication components do not implement analytics, marketing tracking or authentication cookies. This is not a claim that every browser, development server or future hosting configuration is free of cookies, storage or logs.

## 5. Planned operational V1 information

The following describes intended functionality, not current customer-data collection:

| Information and source | Intended purpose |
| --- | --- |
| Tailor email and protected credential data supplied through future account flows | Account access and recovery. Plaintext password logging or persistent storage is not part of the design. |
| Client name, phone and optional email supplied by a tailor | Maintain business-owned customer records. These are not extra tailor-signup fields. |
| Client invitation, verification and session information | Verify email control and authorize each business relationship without client password registration. |
| Measurements, garment descriptions, fabric/style pictures and agreement versions supplied through authorized workflows | Present and preserve what the tailor and client agreed for each clothes item. |
| Fitting, adjustment, delivery and tailor-entered manual payment records | Track work, delivery commitments and payments made directly to the tailor. StitchTrack does not receive or verify those payments. |
| Delivery-reminder intents, email attempts/failures and in-app notification records | Provide the PRD's planned tailor reminders and record their delivery/read state. |

The planned purposes above do not include marketing, AI training or runtime AI features.

## 6. Responsibilities, purposes and privacy choices

For the planned company-operated service, account-related processing and business-managed customer records have different responsibilities. The company is expected to determine purposes and means for its own account processing. A tailoring business may determine the purposes of its customer records while the service handles them on that business's instructions. Responsibilities depend on the particular activity, not simply on who holds a platform account.

The current form purpose is local validation and feedback. The planned operational purposes are those listed above. Accepting platform Terms does not by itself establish a lawful basis for every purpose or for every client's information. A tailor's service contract with StitchTrack does not automatically provide a basis for all processing about that tailor's customers.

Reading a Privacy Policy is not blanket consent. Where processing relies on consent, it must be specific to that purpose and subject to the applicable withdrawal rights.

## 7. Access boundaries

Planned customer records are restricted to the authorized tailoring business and securely linked clients. A shared email address or phone number does not authorize access. No customer portal or operational business-isolation workflow is currently available.

## 8. Retention, corrections and deletion

The authentication interface does not create an account record or a durable acknowledgement record to retain. This does not determine retention of browser-managed information, technical logs or the separate assessment records.

Operational V1 is designed to preserve submitted agreement versions and exact historical references rather than overwrite them. That principle is subject to applicable privacy rights and controlled retention; it is not permission for indefinite storage.

Customer images are intended to use private or access-controlled storage. Eligible image deletion will be governed by a reviewed retention policy, with notice and lawful dispute/retention exceptions, while keeping the minimum necessary non-image agreement history and showing when original images are no longer available. The PRD's proposed image timetable is not an active deletion schedule or a fixed promise in this candidate.

The current application does not implement customer image uploads, account deletion, record export or automated customer-data deletion. No immediate deletion or permanent image-storage guarantee is made.

## 9. Rights and security

Depending on the processing and applicable law, individuals have rights to information, access, correction, restriction, objection, erasure and portability, and to withdraw consent where consent is the basis. These rights can have legal conditions and limits. They do not depend on the existence of a self-service account screen.

An individual may complain to the [Nigeria Data Protection Commission](https://ndpc.gov.ng/). Contacting platform support is not a condition of exercising that right and does not waive other legal remedies.

The current forms do not establish real authenticated access. Operational V1 requires server-side authorization, business/client isolation and protection of private records. These are requirements to verify before customer use, not a claim that the current interface supplies them or that any system is immune from incidents.

## 10. Policy versions and acceptance

This candidate has not been published at /privacy and has not been substituted for the v0.2 text in the assessment preview. Its version label is not an effective date or legal approval.

Platform Terms acceptance, receipt of privacy information and consent for a particular processing purpose are different actions. A local assessment acknowledgement is not acceptance of a later policy or evidence that an account was created.
