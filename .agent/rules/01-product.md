# StitchTrack Product Rules

Source of truth: `docs/PRD.md`.

## 1. Users and Access

- V1 has two user types: Tailor and Client.
- Tailors manage records belonging to their own business.
- Clients access their portal using passwordless email verification.
- A client must have a verified link to a business-owned customer record before accessing its orders.
- Matching email addresses or phone numbers alone must not grant access.
- One client identity may access authorized orders from multiple tailoring businesses.
- Clients must not access another client's records.
- Tailors must not access another business's records.

## 2. Orders and Clothes Items

- An order belongs to one business and one client.
- An order may contain multiple individual clothes items.
- Each clothes item has its own agreement, price, and approved delivery date.
- Do not combine separate physical clothes items into one record.

## 3. Measurements, Fabric, and Style

- Preserve measurement versions.
- Every submitted agreement must reference the exact measurement version used, where applicable.
- Every clothes item requires one fabric picture and one style picture before agreement submission.
- Show both pictures to the client during agreement review and on the order details screen.
- Preserve the exact picture references included in each submitted agreement.
- Do not replace approved pictures without a controlled change.
- Follow the PRD's image storage and retention requirements. Do not treat proposed retention periods as approved deletion instructions.

## 4. Agreements and Changes

- Only the verified, authorized client can approve or reject an agreement.
- Tailors cannot approve agreements on behalf of clients.
- Submitted agreements must remain immutable.
- Preserve approval, rejection, and withdrawal history.
- A client may request changes through their portal.
- Requested changes do not automatically modify approved terms.
- Changes to approved fabric, style, measurements, price, or delivery date require a new client-approved agreement version.
- Rejected changes must not alter the current approved agreement.
- Never delete historical agreement versions to simplify implementation.

## 5. Payments

- Clients pay tailors directly outside StitchTrack.
- Tailors manually record payments they receive.
- StitchTrack does not independently verify these payments.
- Display recorded payments and outstanding balances using approved prices.
- Do not display an incomplete order total as a final amount.
- Preserve payment history. Use recorded corrections instead of silently overwriting receipts.
- Flutterwave is reserved for potential future payments from tailors to StitchTrack, not customer-to-tailor payments.
- Do not implement payment gateway processing or subscriptions in V1.

## 6. Delivery and Notifications

- Each clothes item has its own delivery progress.
- Derive the effective delivery date from the current approved agreement.
- Pending changes must not alter the effective delivery date.
- Clients can view approved dates and delivery progress.
- Tailors receive email and in-app delivery reminders.
- Stop future reminders for delivered or cancelled items.
- Follow the approved reminder schedule. Do not invent one when configuration is unresolved.

## 7. Product Boundaries

- The initial pilot is free.
- Do not add subscription tiers, marketplace features, inventory management, or full accounting.
- Do not introduce AI-generated application answers or vector search without an approved product requirement.
- Do not introduce additional user types or permissions.
- Do not implement functionality outside the approved milestone.
- Refer to the PRD for full requirements and acceptance criteria.
- Stop and report conflicts between the PRD and requested implementation.