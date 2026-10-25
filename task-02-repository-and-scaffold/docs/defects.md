# Task Two defects and limitations

I reviewed the current scaffold, assessment route, configuration, persistence code, tests and Task Two evidence. This report records one open error-classification defect and one resolved presentation defect. I keep verification limits and unreproduced risks separate rather than treating every missing feature or simulated failure as a bug.

StitchTrack has not been deployed to production. I did not connect to a database, submit an enquiry, run a migration or implement a correction during this review. Line references describe the files as reviewed.

## 1. Database unavailability can be reported as an internal error

**Status: open.** The observed classification mismatch is confirmed. A classifier coverage gap is also confirmed by a database-free probe; the exact exception behind the historical request still requires verification.

**Locations:** [lib/assessment/enquiry.ts:39–53](../../lib/assessment/enquiry.ts#L39-L53), where `databaseUnavailable` classifies errors, and [lines 149–157](../../lib/assessment/enquiry.ts#L149-L157), where the handler chooses 503 or 500. The actual database adapter and identity query are in [lib/assessment/prisma.ts:19–33](../../lib/assessment/prisma.ts#L19-L33) and [lines 39–50](../../lib/assessment/prisma.ts#L39-L50). The API delegates to this logic through [app/api/assessment/enquiries/route.ts:7–18](../../app/api/assessment/enquiries/route.ts#L7-L18).

**What currently happens:** my unavailable-port experiment returned HTTP 500 with outcome `internal_error`. The [failed-request log:27–28](../evidence/13-write-failed-logs.txt#L27-L28) records that result. The earlier request at [lines 13–14](../evidence/13-write-failed-logs.txt#L13-L14) was a separate `configuration_rejected` failure. I must not confuse the two.

My [failure account:13–29](false-success.md#L13-L29) records the unused port, corrected configuration, matching request ID and unchanged five-record database. The interface displayed an error, not a false success. The [successful-request log:19–23](../evidence/11-write-succeeded-logs.txt#L19-L23) separately records two 201 responses with distinct IDs and timestamps; it does not prove the failure path is correctly classified.

**What should happen:** a recognized database transport-unavailability failure should return 503/`database_unavailable`, with a safe error and no success receipt, as specified in the [procedure:269–272](persistence-experiment.md#L269-L272). Missing configuration, authentication, schema, integrity and genuinely unknown errors should remain 500. I am not proposing that every database error become 503.

**Source investigation:** the classifier checks only string `code` values on the error and up to three further `cause` objects. It does not examine structured adapter `kind` values or metadata outside that chain. The installed adapter is pinned to 7.10.1 in [package.json:21–22](../../package.json#L21-L22).

I also read these installed dependency files; they are installation artifacts, not new project source:

- `node_modules/@prisma/adapter-pg/dist/index.js:581–601` maps socket failures to kinds including `DatabaseNotReachable`, `ConnectionClosed` and `SocketTimeout`.
- The same file at lines 700–702 wraps converted failures in `DriverAdapterError`.
- `node_modules/@prisma/driver-adapter-utils/dist/index.js:43–48` puts that structured payload in `cause`.

In an in-memory probe using the installed `DriverAdapterError` class, `databaseUnavailable({ code: "ECONNREFUSED" })` returned true. Constructed adapter errors with each of the three kinds above returned false. This demonstrates a real limitation in the helper. It does **not** establish the complete error wrapper that Prisma delivered during the saved HTTP request, or prove that this limitation was its only cause. The saved logs intentionally omit raw exceptions.

The existing [transport tests:208–218](../../tests/assessment/enquiry.test.ts#L208-L218) inject top-level codes. The [cause-chain test:268–272](../../tests/assessment/enquiry.test.ts#L268-L272) checks a nested code and a cycle, not these adapter-kind payloads. Passing those tests therefore does not resolve the observed discrepancy.

**Why it matters:** the user still receives honest failure feedback, but the generic classification makes a temporary outage harder to distinguish from a programming or configuration problem. That reduces the value of the assessment's logs and could complicate support in a future production system. I have not observed a production customer incident.

**Proposed correction, not implemented:** with separate authorization for the isolated test database, repeat the controlled failure and inspect only reviewed, sanitized error-type/code/kind structure. Do not log credentials, connection strings, raw messages, stacks or request bodies. Use the confirmed wrapper to add narrowly allowlisted, bounded and cycle-safe classification, plus database-free regression fixtures matching that structure. Preserve the 500 cases. Then have the developer verify actual 503 behavior, no new row, and recovery to 201.

## 2. The longer homepage heading left an isolated final word

**Status: resolved for the recorded Step 10 viewports.**

**Locations:** the heading is in [app/page.tsx:29–31](../../app/page.tsx#L29-L31). Its current width, balancing and responsive typography are in [app/page.module.css:17–34](../../app/page.module.css#L17-L34).

**What happened, and what currently happens:** after introducing the approved longer copy with the original layout, “clear” appeared alone on the final line at 1000 × 800. The current CSS uses an 18ch maximum, balanced wrapping and token-bounded `clamp()` sizing. The saved corrected screenshot shows “Keep tailoring orders” / “and agreements clear” at the same viewport.

**What should happen:** the heading should communicate the purpose clearly and wrap deliberately across the checked screen sizes.

**Evidence:** I inspected [18-heading-wrap-bad.png](../evidence/18-heading-wrap-bad.png) and [19-heading-wrap-good.png](../evidence/19-heading-wrap-good.png). The [information-design report:19–31](information-design.md#L19-L31) explains the genuine intermediate state and correction; [lines 50–58](information-design.md#L50-L58) record the 375px, 768px and 1440px checks.

**Why it matters:** an isolated word made the main message less balanced and harder to scan. The correction improves presentation; I have no measured conversion or user-growth result.

**Proposed correction:** already implemented in Step 10. Preserve this fix and recheck the same widths if heading copy or typography changes. I made no further CSS change or new live-browser measurement for this report.

## Verification limits, not additional confirmed application bugs

| Item and status | Current evidence, expected boundary and proposed follow-up |
| --- | --- |
| Public sharing metadata — requiring verification before deployment | [app/page.tsx:9–20](../../app/page.tsx#L9-L20) deliberately uses a loopback metadata base. The [information-design report:82–87](information-design.md#L82-L87) records local asset checks and no public preview test. This is correct for the approved local experiment. Before public release, obtain an approved public origin and verify crawler-accessible metadata/assets; do not invent a current public-preview incident. |
| Windows setup coverage — requiring verification | [readme-test.md:28–42](readme-test.md#L28-L42) records EPERM recovery, 177 installed packages, Prisma generation and a working homepage. [Lines 90–95](readme-test.md#L90-L95) keep the unaided retest, PowerShell and warning details outstanding. The assisted CMD recovery is established; the revised instructions still need an independent unaided walkthrough. The unspecified lifecycle warnings need review, not an invented severity or fix. |
| Performance target comparison — requiring verification | [04-first-load.txt:1–2](../evidence/04-first-load.txt#L1-L2) records HTTP 200 in 789ms. [performance-note.md:11–21](performance-note.md#L11-L21) compares that development response with the stated approximately 10ms assessment target and says the cause was not isolated. This is an observed assessment measurement limitation, not a confirmed production performance defect. Repeat comparable warm/cold and production measurements before choosing a correction. |

## Risks and candidates I did not reproduce as defects

- **Ambiguous writes and duplicate retries:** [EnquiryForm.tsx:19–20](../../app/assessment/enquiry/EnquiryForm.tsx#L19-L20) prevents simultaneous submission in that component, but [enquiry.ts:100](../../lib/assessment/enquiry.ts#L100) creates a new request ID for each HTTP request. The unique field in [schema.prisma:16](../../prisma/schema.prisma#L16) is not a client retry token. A lost response after a committed write could make a retry ambiguous, as the [procedure:315–318](persistence-experiment.md#L315-L318) already warns. I did not reproduce duplicate rows. Keep manual request-ID verification for this assessment; review idempotency separately before any production workflow.
- **A page loading is not proof of persistence:** the API awaits persistence and validates its receipt before 201 at [enquiry.ts:142–148](../../lib/assessment/enquiry.ts#L142-L148). The browser validates status and receipt at [EnquiryForm.tsx:32–35](../../app/assessment/enquiry/EnquiryForm.tsx#L32-L35). The saved failure did not show success. I found no evidence of the deliberately sought false-success incident.
- **404 and 500 can be intentional:** [config.ts:10–29](../../lib/assessment/config.ts#L10-L29) enforces the local-development gates. The [historical success log:15–20](../evidence/11-write-succeeded-logs.txt#L15-L20) shows a Host mismatch being rejected, followed by a matching-host 201. This is not evidence that the security gate should be weakened. Missing database configuration is also intentionally rejected.
- **Missing product workflows and simulated outages:** authentication, orders, payments and notifications are outside Task Two. The temporary model is explicitly isolated in [schema.prisma:12–21](../../prisma/schema.prisma#L12-L21). The unused-port setting in [config.ts:71–82](../../lib/assessment/config.ts#L71-L82) is a controlled experiment; the unexpected classification, rather than the deliberately unavailable connection itself, is the defect. No production deployment or production database outage is claimed.

## Checks I actually ran

- `npm run test:assessment`: **21 passed, 0 failed**. These tests inject persistence; they do not connect to PostgreSQL.
- An ephemeral Node.js probe importing `databaseUnavailable` and the installed `DriverAdapterError`: native refusal code recognized; the three constructed adapter-kind cases not recognized. No database client, pool or network connection was created by this probe, and no test file was added.
- Inspection of current source, configuration, tests, installed adapter conversion code, existing logs and the before/after heading images.
- File existence and cited line ranges checked; `git diff --check` passed.

I did not rerun database integration, browser, build, typecheck or security-audit checks. Earlier results remain historical evidence. Only this report was created; the PRD, application, migrations, tests, existing evidence and other documentation were preserved.

Assumptions: none
