# StitchTrack Design Rules

Source of truth: `docs/PRD.md` and the approved Task One design-system files.

## 1. Design System

- Reuse the existing Tailored Wine design system.
- Use DM Sans for typography.
- Use existing semantic tokens for colours, typography, spacing, borders, and shadows.
- Do not hardcode values already defined by design tokens.
- Do not introduce new colours, fonts, or design conventions without approval.
- Inspect the existing token files before implementing UI components.
- Preserve existing Task One design decisions.

## 2. Layout and Responsiveness

- Design for mobile screens first.
- Support responsive layouts for larger screens.
- Keep navigation and primary actions clear.
- Prioritize order details, agreement review, and delivery information.
- Keep forms simple and suitable for mobile devices.
- Account for slower network connections.
- Do not introduce unnecessary interface complexity.

## 3. Fabric and Style Pictures

- Each clothes item requires one fabric picture and one style picture before agreement submission.
- Display fabric and style pictures as separate, clearly labelled references.
- Show both pictures on the tailor's order details screen.
- Show both pictures on the client's order details and agreement review screens.
- Display "Not added" when a required picture is missing.
- Prevent agreement submission until both required pictures exist.
- Preserve the exact picture references associated with each submitted agreement.
- Do not silently replace approved pictures.
- Optimize image delivery without materially changing fabric colours or hiding design details.
- Apply authorization before accessing private customer images.
- Follow the PRD's approved upload and retention requirements.

## 4. Agreements and Status Display

- Show the clothes description, fabric picture, style picture, price, and delivery date during agreement review.
- Clearly distinguish pending, approved, rejected, and withdrawn agreements.
- Make the exact agreement version being reviewed identifiable.
- Do not present pending changes as approved terms.
- Display the effective approved delivery date.
- Make approval and rejection actions explicit.
- Do not rely on colour alone to communicate status.

## 5. Tailor Dashboard

- Display upcoming deliveries, overdue items, pending approvals, and orders in progress.
- Display recorded outstanding balances only when the approved pricing is complete.
- Provide access to delivery reminders.
- Make individual clothes items accessible from their parent order.
- Show fabric and style pictures when viewing an item.

## 6. Client Dashboard

- Support passwordless email-verified access.
- Display only the client's authorized orders.
- Show the tailoring business associated with each order.
- Display fabric and style pictures, agreement status, approved price, delivery date, and progress.
- Show payments recorded by the tailor with the PRD's verification disclaimer.
- Provide access to agreement approval, rejection, and change requests.
- Do not allow clients to directly edit approved agreements.

## 7. Forms and Interface States

- Provide visible labels and field-level validation messages.
- Display loading, empty, error, and success states where applicable.
- Preserve entered form data when a recoverable error occurs.
- Provide clear feedback after successful or failed actions.
- Do not display incomplete order totals as final balances.
- Do not expose private customer information through error messages.
- Use existing design-system components and patterns when available.

## 8. Implementation Boundaries

- Do not redesign the product during feature implementation.
- Do not add UI libraries or dependencies without approval.
- Do not invent screens or features outside the approved milestone.
- Verify UI changes against the PRD and existing design-system files.
- Report missing tokens or unspecified design decisions instead of inventing replacements.