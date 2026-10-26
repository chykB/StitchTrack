# StitchTrack Privacy Policy - working draft

**v0.1 | 26 October 2026 | NOT APPROVED | NOT A PUBLIC POLICY**

This is a review artifact for an intended service, not a claim that production processing, legal approval or privacy compliance has already been established. See the [source/review note](terms-note.md). No effective date is set.

## 1. Responsible organization and roles

StitchTrack is the project/product name, not a verified registered entity in this document.

**OWNER/LEGAL REVIEW:** Supply the operator's identity, address and monitored privacy contact. Decide roles for each activity. Account administration may involve the platform determining purposes; business-owned customer records may involve different controller/processor arrangements. No role allocation or processing agreement is assumed.

## 2. Current interface versus planned processing

Today, the authentication forms accept local UI interaction only. The submit handler does not read, send, save or log email/password values, create accounts/sessions or send reset emails. No terms checkbox has been added. Network access to a website can still involve technical request data; the actual hosting/log/cookie inventory has not been completed here.

The following categories come from the [PRD](../../docs/PRD.md). They are intended V1 data uses, not a statement that these features currently collect data:

| Category and source | Intended service purpose | Required review |
| --- | --- | --- |
| Tailor email and protected authentication credentials, supplied through future account flows | Identify and authenticate a tailor and support account recovery. | Authentication design; never persist/log plaintext passwords. |
| Client name, phone and optional email supplied by a tailor; invitation/verification data supplied through client access | Maintain customer records and establish authorized client access. | Notices for data obtained through a business, authorization and role allocation. These are not extra tailor-signup fields. |
| Measurements, garment descriptions, fabric/style pictures and versioned agreements | Display and preserve the exact terms for authorized participants. | Necessity, picture permissions, sensitivity and access controls. |
| Tailor-entered payment records, delivery/fitting events and communication preferences | Record business progress and approved reminders. | No claim that StitchTrack receives or verifies tailoring payments. |
| Future session/security information and technical request logs | Operate and protect the implemented service. | Minimize fields; confirm actual logging, recipients, cookies and retention before publication. |

The PRD excludes runtime AI features. This draft does not authorize using customer data for AI training or introduce new analytics or marketing purposes.

## 3. Purpose, legal basis and information given to people

The [Nigeria Data Protection Act 2023](https://ncc.gov.ng/media/1084/view), sections 24-27, is a source for reviewing minimization, purpose and privacy information.

**OWNER/LEGAL REVIEW:** Map each actual purpose to a documented lawful basis; assess whether contract, another basis or specific consent is appropriate. Do not label all processing as consent or infer a basis solely from a platform-terms checkbox. The official [GAID 2025](https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf) indexed material on lawful bases/consent was consulted with the access limitation recorded in the source note.

Required privacy information must be supplied at the appropriate collection points, including an appropriate approach for customer information supplied by tailors. A future public Privacy Policy and any separate consent controls have not yet been implemented.

## 4. Who can receive data and where it is handled

The intended product restricts access to authorized businesses and linked clients. Actual service providers, locations and disclosures must be confirmed.

**OWNER/LEGAL REVIEW:** Inventory hosting, PostgreSQL hosting, SMTP, image handling, subprocessors and destinations. Prisma and Nodemailer are software tools, not proof that a particular provider receives data. Cloudinary is a PRD proposal, not a confirmed processor in this draft. Do not publish a processor list or promise Nigeria-only storage without evidence.

Any international-transfer arrangement needs the applicable safeguards review; no transfer mechanism or provider contract has been approved here.

## 5. Retention, corrections and deletion

**OWNER/LEGAL REVIEW:** Approve a category-by-category retention and deletion plan, including backups, disputes and legal obligations. No retention duration is promised by this draft. The PRD's proposed image lifecycle still requires review and is not silently adopted.

The product intends to preserve agreement versions rather than overwrite history. That does not remove privacy rights: determine how lawful corrections, restrictions, erasure requests and evidence obligations will be reconciled. No automatic data deletion or export feature is represented as available.

## 6. Rights and requests

A future notice should explain applicable access, correction, objection, restriction, erasure, portability and consent-withdrawal rights, including relevant limits. The [NDPC's public rights guidance](https://ndpc.gov.ng/) and the Act are review references.

**OWNER/LEGAL REVIEW:** Confirm a usable request channel, identity checks, responsibilities between platform and tailoring businesses, and lawful response procedures. Do not publish a fictional support address or a service deadline. The [NDPC](https://ndpc.gov.ng/) is the regulatory reference for privacy complaints; using platform support must not be presented as a waiver of legal remedies.

## 7. Security, incidents, cookies and vulnerable users

The PRD calls for private access, server-side authorization and protection of credentials and agreement history. These are engineering requirements, not a claim of complete security or a guarantee against incidents.

**OWNER/LEGAL REVIEW:** Approve incident handling, required notices and responsible contacts; inventory cookies/session storage and any optional tracking before making customer claims. No claim that the site uses no cookies has been verified here. Separately assess children/capacity and any sensitive-data handling; do not invent an age threshold or assume all tailoring pictures are biometric data.

## 8. Publication and changes

**OWNER/LEGAL REVIEW:** Resolve all marked items, check the complete current law/guidance and actual implementation, approve an effective version and decide how material changes will be communicated. Platform contract acceptance, receipt of privacy information and consent for a particular purpose remain separate concepts.

This document is not linked from signup or served at /privacy. No real customer should be asked to accept an unfinished policy as if it had passed legal review.
