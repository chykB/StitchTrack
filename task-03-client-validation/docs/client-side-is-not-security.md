# Client-side validation is not a security boundary

I used StitchTrack's actual Signup, Login, Reset and email-code validation for Step 8. I did not add real registration. The assessment PDF was unavailable, so this investigation follows the owner's supplied Step 8 instructions.

## What I attacked

The current rules are in [credential validation](../../lib/auth/validation.ts) and [code validation](../../lib/auth/email-code.ts). The existing [validation inventory](validation-rules.md) explains their product trade-offs.

I ran 70 synthetic cases through those actual functions: empty and single-character values, whitespace-only passwords, email shape and whitespace, 11/12/13-code-point password boundaries, meaningful spaces, control characters, Unicode, 129- and 4096-character passwords, and malformed or leading-zero codes. I then exercised 26 selected cases in real Chrome using actual input insertion and button clicks.

[Evidence 15](../evidence/15-form-attack-results.txt) contains the observed results, not predictions:

- Function tests: 43 blocked, 27 format-valid only; all 70 tests passed.
- Browser cases: 11 blocked, 15 reached the existing unavailable-action feedback. Node reports 27 passing tests including the parent test.
- The browser run observed 26 intentional document loads and no local non-GET/HEAD request. It did not create an account or verify a code.

Passing a local syntax check is not authentication. Signup still says “Account creation is not available yet.” Login, Reset and verification retain their equivalent truthful messages.

### Results worth explaining

| Input or boundary | Actual result | Meaning |
| --- | --- | --- |
| Signup email `a@b` plus a one-space password | Blocked by functions and the browser | This is the fixed direct-request baseline. |
| `a@b.c`, plus addressing | Coarse email shape passed | No delivery, ownership or account-existence check occurred. |
| 300-character email local part; Unicode local part | Function-level shape check passed | Current client validation has no email maximum. Backend/provider compatibility needs review. |
| Signup 11 versus 12 code points | 11 blocked; 12 passed | No compulsory uppercase/number/symbol mix. |
| Signup whitespace-only password | Blocked | Ordinary passphrase spaces and meaningful edge spaces remain allowed. |
| Signup 129 and 4096 characters | Passed the tested local checks | There is no current maximum; these finite tests do not establish safe unbounded processing. |
| Login one-character or one-space password | Reached unavailable feedback | Login deliberately does not reapply the Signup enrollment policy. No credential was authenticated. |
| `004281` and `000000` | Format-valid; `004281` preserved | Six ASCII digits do not prove an issued, current or correct OTP. |
| `4280`, padded, seven-digit or non-ASCII digit codes | Blocked | Codes remain strings with an exact six-ASCII-digit rule. |

Browser input handling is a separate layer. The three padded-email trials and the Signup/verification newline trials did not preserve the raw requested sample in the DOM and reached unavailable feedback. I therefore cannot use those browser trials to claim that the validator accepted raw newlines. The direct validator tests rejected the raw newline samples. Evidence 15 records the preservation flags and observed lengths without attributing an unmeasured transformation to application code.

The remaining 44 matrix cases have function-level evidence, not browser evidence. This task did not test Narrator, autofill, SMTP, real account lookup, OTP expiry, rate limits or arbitrary input sizes.

## Why I added a temporary fixture

Inspection found no registration API. The [existing enquiry API](../../app/api/assessment/enquiries/route.ts) is the separate Task Two persistence experiment and is not a suitable target. A POST returning 405 from an authentication page would only demonstrate method handling, not acceptance of malformed registration data.

I added [a temporary route](../../app/api/assessment/form-bypass/route.ts) backed by [an isolated handler](../../lib/assessment/form-bypass.ts). It is an assessment fixture, not an authentication endpoint. The form never calls it.

It is available only with all of these conditions:

- `NODE_ENV=development`;
- `ENABLE_FORM_BYPASS_EXPERIMENT=true`;
- an HTTP loopback URL and a matching canonical loopback Host header.

Run the local server bound to `127.0.0.1`; Host validation is not proof of a remote socket's identity or a substitute for that binding. Production and flag-off requests return 404 before payload handling. The fixture does not trust forwarded headers to enable access.

The enabled fixture accepts only POST, a same-origin request when Origin is supplied, the explicit assessment marker, JSON up to 1,024 bytes, and the exact fixed synthetic pair below. Missing markers, cross-site requests, malformed/oversized bodies, extra fields and other payloads are rejected. The stream limit also works without Content-Length. Responses are not cached.

These are real server checks. I am **not** claiming the fixture has no server validation: it deliberately recognizes one known-invalid synthetic example instead of applying Signup rules. It neither echoes nor logs the email, password or any code.

## The actual direct HTTP request

The version-controlled [payload file](../fixtures/form-bypass-payload.json) is exactly:

```json
{"email":"a@b","password":" "}
```

The password contains one ASCII space. Both values are synthetic. I checked the local draft acknowledgement during the matching browser case to isolate the email/password rejection; the HTTP fixture does not accept or record Terms.

On 27 October 2026 I ran real WSL curl against an isolated current-source server on `127.0.0.1:3104`. [Evidence 16](../evidence/16-direct-request-command-and-response.txt) preserves the exact arguments, actual response headers/body, timestamp and curl exit code. The request returned **HTTP 200**, with outcome `fixed_synthetic_payload_observed`. Its static response explicitly stated:

```json
{"accountCreated":false,"sessionCreated":false,"persisted":false,"emailSent":false}
```

That is an excerpt of the actual larger response, not a registration receipt. The response lists its performed checks and says it did not check Signup email format, password policy, accounts, Terms acceptance or registration. It set no session cookie.

curl did not execute the browser's validation or interact with the disabled/aria-disabled form controls. That is the bypass: the same malformed email and whitespace-only password can reach an HTTP handler without browser validation running.

This deliberately limited demonstration does **not** establish that real StitchTrack registration is insecure. There is no real registration implementation to attack yet, and the fixture creates nothing. A handler's 200 means only what that handler actually did; page navigation and status alone do not prove persistence or authentication. Server-side validation is required even when client validation already exists. [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)

## Owner reproduction and evidence capture

The two official text evidence files now contain genuine agent-run results. They are not an independent owner transcript. The owner's existing server was left running; the automated checks used isolated temporary source copies without copying .env files. All data was synthetic and persistence was disabled.

To reproduce in WSL, first stop only your own current development server with Ctrl+C if it occupies port 3000. In a terminal:

```bash
cd /home/bmalik/stitchtrack
source ~/.nvm/nvm.sh
nvm use 24.22.1
ENABLE_FORM_BYPASS_EXPERIMENT=true \
ENABLE_CODE_INPUT_EXPERIMENT=true \
ENABLE_AUTH_TERMS_PREVIEW=true \
ENABLE_PERSISTENCE_EXPERIMENT=false \
npm run dev -- --hostname 127.0.0.1
```

The code and draft-preview flags enable the existing local form views for comparison; the fixture itself needs only its own flag and the development/loopback checks. Do not add database credentials.

For an owner browser comparison, open `http://127.0.0.1:3000/auth?signup`, use the fixed pair above, check only the unapproved draft acknowledgement, and attempt submission. Record the actual inline errors and Network results; do not describe that checkbox as legal acceptance. Other synthetic cases are enumerated in [the reproducible matrix](../../tests/form-attack/cases.mjs).

In another WSL terminal, run:

```bash
cd /home/bmalik/stitchtrack
curl --silent --show-error --include \
  --request POST http://127.0.0.1:3000/api/assessment/form-bypass \
  --header 'Content-Type: application/json' \
  --header 'X-StitchTrack-Assessment: form-bypass-v1' \
  --data-binary @task-03-client-validation/fixtures/form-bypass-payload.json \
  --write-out '\nHTTP_STATUS=%{http_code}\n'
```

Save the command, actual status, headers and body if collecting your own run. Preserve the current evidence files; use a clearly named supplemental file such as `16-direct-request-owner-run.txt` rather than replacing the agent-run record. A 404 means the fixture is unavailable; investigate activation instead of reporting a bypass. A 200 must still be interpreted using the response's explicit fixture limitations.

After capture, stop that opt-in server and restart without `ENABLE_FORM_BYPASS_EXPERIMENT`; a repeat request must return 404. Do not send real credentials.

## Automated verification actually completed

| Check | Actual result |
| --- | --- |
| Synthetic function matrix | 70 passed |
| Fixture unit/security tests | 8 passed |
| Existing authentication/validation unit and rendering tests | 79 passed |
| Existing database-free assessment regression tests (mock persistence) | 21 passed |
| Default-off development fixture HTTP tests | 4 passed; POST 404 |
| Enabled development fixture/auth/verification HTTP and RSC tests | 62 passed |
| Production HTTP/RSC tests, even with experiment flags true | 62 passed; fixture and unfinished verification 404 |
| Real-Chrome attack matrix | 27 tests passed, including 26 case checks |
| Existing document/verification Chrome regressions | 15 passed; keyboard, focus, history, 375/768/1440px, no-JavaScript safety |
| TypeScript check and production build | Passed; Prisma generation was offline |

The [new tests](../../tests/form-attack/) cover transport gates, bounded bodies, no input echoes/logging, no session cookie, local-only activation and the actual browser attacks. Existing auth URL rejection, homepage, legal-view guards and the disabled assessment route continued to pass. No application authentication source or historical evidence was edited. Hash comparison against the start-of-task baseline confirmed all 170 pre-existing non-cache files were unchanged; typechecking regenerated the ignored tsconfig.tsbuildinfo cache.

Reproducible database-free commands:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/form-attack/inputs.test.mjs tests/form-attack/fixture.test.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/auth-validation/*.test.mjs tests/auth-foundation/state.test.mjs tests/email-verification/availability.test.mjs tests/email-verification/components.test.mjs tests/email-verification/validation.test.mjs
npm run test:assessment
npm run typecheck
npm run build
```

The HTTP tests require the corresponding running server, explicit base URL and expectation flags; the browser tests require an isolated Chrome debugging session. These are not database integration tests.

Full-repository `git diff --check` still reports the pre-existing owner-controlled PRD whitespace at lines 39–50. The PRD was left unchanged. Checks excluding that read-only file, local links and new-file whitespace passed.

## What Task Four must enforce

I will keep the same synthetic payload file as a comparison baseline, but the future real endpoint must be tested separately under Task Four approval. The fixture's receipt cannot substitute for that test.

The server must enforce:

1. Typed, bounded input and the approved email/password rules independently of browser controls, using the project's approved server validation stack. Agree compatible password processing limits, Unicode handling and email-provider constraints; never silently truncate or normalize passwords.
2. Actual email ownership and approved recovery behavior, with generic Login/Reset responses that do not reveal account existence. A format check is not proof of ownership.
3. Secure credential handling through the approved authentication library, safe errors and redacted logs; no raw passwords/codes in responses, URLs or storage intended for debugging.
4. The PRD's six-digit string OTP, expiry, invalid-attempt limits, resend cooldown and account/IP rate limits. Enforce challenge identity, purpose, single use and the relevant verified invitation. Client validation or obscure helper text provides none of these protections.
5. Approved, versioned Terms acceptance at the real registration boundary; the current draft acknowledgement is not acceptance. Record it only as part of the separately approved backend design.
6. Correct sessions, business/client authorization and controlled persistence. Do not return a creation receipt before the real write/verification succeeds.

For the comparison, preserve the payload bytes but account for the future endpoint's actual schema. If missing approved Terms or another prerequisite causes rejection first, that result alone does not prove both malformed credential fields were checked. Add isolated tests for each rule. No real endpoint path, response status or database result is claimed in advance.

## Temporary lifecycle

The fixture is not a product feature and must not be wired into Signup. It should be removed after its evidence purpose is complete, in a separately reviewed cleanup, while preserving the payload and historical investigation records. The temporary runtime files are the API route and its isolated handler; fixture-only tests can be retired with them. The attack matrix can remain as a regression baseline against the real validation policy.

Step 9 rollback is complete. The [rollback record](rollback.md) and [evidence 17](../evidence/17-commit-list-and-rollback.txt) show temporary commit `3009fe1` reversed by `c019741`, preserving checkpoint `bcd1b37`; documentation commit `c1e6180` records the exercise. This does not change the synthetic HTTP fixture's scope or prove real registration security. Task Four integrations have not started.
