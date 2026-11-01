# Verification email copy and rendering

Status: renderer and offline tests implemented. On 29 October 2026 the owner reported Gmail SMTP acceptance and independently confirmed inbox arrival/rendering; [Evidence 17](../evidence/17-smtp-success.txt) preserves the supplied terminal transcription and [Evidence 23](../evidence/23-rendered-email.png) is the owner-supplied rendered-email screenshot. The agent did not rerun sending or independently audit the mail client. The owner reports the product registration/verification PostgreSQL harness completed with exit status 0. That result does not establish SMTP delivery. The [PRD](../../docs/PRD.md) remains authoritative/read-only.

## Current template

[verification-email.server.ts](../../lib/product-auth/verification-email.server.ts) implements tailor-verification-v1, matching the existing encrypted outbox template version. It consumes the existing canonical email/six-digit string and the linked issuance's expiry; it generates no code, session or account and changes no outbox payload.

Subject: **Verify your StitchTrack email address**.

The body identifies StitchTrack, displays the recipient and unchanged code, and says:

> Enter this code on the StitchTrack email verification screen. Do not share it with anyone.

> Valid for up to five minutes from issue. Expires at [actual issuance deadline in WAT]. Delivery delays do not extend its validity.

> If you did not request this code, ignore this email. No action is needed.

The bracketed deadline above describes a dynamic field, not literal delivered copy. No claim of completed verification, approved Terms, company identity or invented support/sender address is added.

## Design and accessibility

The renderer imports the existing Task One token source used by the CSS build and resolves the Tailored Wine semantic palette and DM Sans typography into inline email styles. Opaque colors become six-digit hex for older email clients; no token/evidence file changes. DM Sans has Arial/sans-serif fallbacks without loading a remote font or tracking asset.

HTML uses lang=en, one H1, paragraphs, presentation-only layout tables and a fluid width with a 560px maximum. The code is ordinary selectable text, not an image or six separate input cells. The plain-text alternative carries the same instructions, code and expiry. Dynamic text is HTML-escaped; malformed codes, noncanonical/multiple addresses and extra payload fields are rejected. SMTP recipient data is taken from validated output.

Offline checks establish content/escaping and structure, **not** actual email-client accessibility or visual compatibility. Before customer use, inspect real HTML and plain text on narrow/mobile and desktop mail clients, dark mode, zoom and screen-reader reading. Adjust only demonstrated rendering issues; do not fabricate an accessibility pass.

## Editorial and owner checks

- Confirm the actual sender identity/address and any monitored reply/support channel before live SMTP configuration. No policy/contact link is invented.
- Review whether the short instructions and WAT deadline are clear to pilot users. The lifetime starts at issue, not at delivery.
- Inspect actual subject/from display, selectable leading zeros, reading order and fallback typography in the received email.
- Keep synthetic codes/mailboxes in assessment evidence; never expose SMTP credentials or reusable production secrets.

The owner-supplied [Evidence 23 screenshot](../evidence/23-rendered-email.png) is present; the current image visibly redacts the sender/recipient addresses and synthetic code. The agent inspected it without changing its bytes. This visual check is not a metadata guarantee. The owner confirmed StitchTrack branding, the six-digit code, expiry information and instructions; this does not establish every mail-client/accessibility check above. Delivery configuration, worker requirements and Evidence 16-18 preparation are in [verification-design.md](verification-design.md).

Assumptions: none. Public registration and real email delivery remain inactive.
