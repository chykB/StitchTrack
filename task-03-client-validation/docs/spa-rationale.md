# Task Three, Step 1: authentication consolidation

## What I built and corrected

I consolidated the tailor authentication interface into one Next.js page. This is UI work only: account creation, login, password-reset email delivery, Better Auth, full form validation and terms acceptance remain unimplemented.

Manual testing exposed a mistake in my first consolidation: unsupported mode parameters silently displayed login. The final contract removes mode entirely and rejects invalid states instead of hiding malformed links.

| Public URL | Result |
| --- | --- |
| /auth | Login by default |
| /auth?login | Login |
| /auth?signup | Signup |
| /auth?reset | Password-reset request |

Public state keys are exact, case-sensitive and key-only. Unknown keys, any mode parameter, duplicate/conflicting keys and values return HTTP 404. Even /auth?login= is rejected because it is not the agreed key-only syntax. There is no fallback for unsupported query states.

## Actual route counts and previous experience

The committed foundation is cb31dc972461e3d1f0624a964ba4c96b034419d1 on feat/task-03-auth-foundation. Its inventory was saved before route files were changed.

| Source page-route count | Before consolidation | After consolidation |
| --- | --- | --- |
| All application pages | 5 | 3 |
| Authentication pages | 3 | 1 |

These counts include the homepage and assessment enquiry page, even though the assessment is disabled by default. They exclude API handlers, layouts, icons and framework-generated not-found routes. Three form states are one page route. See the [before inventory](../evidence/01-page-count-before.txt) and [final inventory](../evidence/02-page-count-after.txt).

My relevant previous experience is the real StitchTrack foundation. I navigated between /signup, /login and /forgot-password, with repeated page wrappers and similar fields. Reset needed only email; signup/login needed email and password. The old pages already used Next.js Link, so consolidation did not introduce client navigation and I have not measured a speed improvement against the old implementation.

The concrete benefit is keeping related copy, fields and navigation in one place. A tailor can change their intended action without replacing the document through hydrated client navigation. This is useful on mobile connections, but it does not mean there are no network requests: Next.js can fetch React Server Component (RSC) data.

The timeline remains zero auth pages in the Task Two scaffold, three in the Task Three foundation, then one after consolidation. The [historical foundation record](auth-foundation.md), [original route evidence](../evidence/00-foundation-route-count.txt) and all 00-foundation screenshots remain unchanged. The old source paths in that record describe the foundation revision, not current routes. The superseded /signup, /login and /forgot-password paths now return standard 404 responses.

## Shared policy and why the proxy/configuration are needed

[lib/auth/state.ts](../../lib/auth/state.ts) defines the state allow-list. The server validates public queries before rendering. The [single page](../../app/%28auth%29/auth/page.tsx) uses that policy again on the server-provided state and defensively calls notFound() if it is missing or invalid. [AuthScreen](../../app/%28auth%29/auth/AuthScreen.tsx) conditionally renders one form and uses only the final key-only links.

The application [proxy.ts](../../proxy.ts) is narrowly matched to /auth. It rejects invalid requests before streaming can commit a 200 response, rewriting them to Next.js's built-in not-found route with status 404. Valid requests receive an internal state header; the proxy always overwrites any caller-supplied version. This header is a navigation hint, not authentication or permission evidence.

[next.config.ts](../../next.config.ts) enables skipProxyUrlNormalize so the gate sees the raw public query. URL normalization can otherwise turn a key-only query into an empty assignment, losing the distinction this contract deliberately enforces. The flag is global configuration for proxy URL normalization, but this application has only one proxy and its matcher is /auth; it does not add gating for the homepage, assessment or unrelated missing routes. Actual route regression checks are listed below.

Next's internal RSC transport can serialize an empty state value and append _rsc. The shared policy handles that transport representation only for RSC requests, applying the same three-state allow-list and rejecting conflicts, duplicates, unknown keys and nonempty state values. A public document request with _rsc is rejected. The browser-visible links remain /auth?login, /auth?signup and /auth?reset. These transport rules do not implement account security.

Links retain Next.js client navigation, scroll=false and prefetch=false. The URL is the state source, so direct URLs, refresh and history are intended to select the same form. A mode key remounts AuthForm to clear old input and unavailable feedback. That avoids carrying a password into another form, but switching also loses unfinished input; no storage was added to preserve it. Heading focus, labels, autocomplete, semantic tokens, DM Sans and existing responsive styling remain in place.

Before hydration and without JavaScript, the fieldset and submit controls stay disabled. After hydration the handler prevents native submission and displays only an accessible unavailable-action message. It does not read, send, save or log credentials. No session or authentication backend has been added.

## Trade-offs and a case for separate pages

One route reduces duplicated wrappers, but requires deliberate URL validation, metadata, history, focus and state-reset testing. Query state is not an authorization mechanism; future account operations must enforce their own server-side controls.

A genuine StitchTrack case for separate pages is the client's invitation and passwordless email-verification journey versus the tailor's password login. The PRD gives those users different credentials and access rules. I would keep that different journey separate rather than force client password registration into this tailor interface. That client workflow is still unimplemented.

## Final screenshot evidence

The project owner manually supplied [signup](../evidence/03-auth-signup.png), [login](../evidence/03-auth-login.png) and [reset](../evidence/03-auth-reset.png) screenshots. I inspected each image: the real address bars show localhost:3000/auth?signup, localhost:3000/auth?login and localhost:3000/auth?reset, with the matching forms.

[03-url-states.png](../evidence/03-url-states.png) now arranges those complete screenshots vertically at native pixel size. Their address bars were retained without cropping, resizing or reconstruction. The original files remain unchanged; their hashes are recorded in the refreshed log. These are viewport captures, not a claim that every page was captured at full scroll height. No old mode= capture is reused as final-URL evidence.

## Verification actually run on 26 October 2026

I ran the built Next.js 16.4.2 application at 127.0.0.1:3100 with NODE_ENV=production and ENABLE_PERSISTENCE_EXPERIMENT=false. These are independent agent HTTP checks; the supplied screenshots show the owner's local development browser at localhost:3000.

- Query-policy tests: **2 passed, 0 failed**.
- Existing assessment regression: **21 passed, 0 failed**, with mocked dependencies and no database access.
- [Route tests](../../tests/auth-foundation/routes.test.mjs): **38 passed, 0 failed**. They cover valid states, 26 invalid public queries, RSC rejection, spoofed state-header protection and ordinary missing routes.
- Homepage: /, /?signup and /?mode=unknown returned **200** with the marketing heading. The auth query gate did not turn them into login or 404 pages.
- Assessment: /assessment/enquiry and its ?login variant returned **404** in production, as required by its existing disabled gate. GET /api/assessment/enquiries retained **405**, because that route defines POST only. I did not submit an enquiry or enable database persistence. Existing mock regression tests cover the endpoint's security and persistence gates.
- TypeScript check and production build: **passed**. Existing precheck/prebuild generated Prisma Client 7.10.1 offline. The Prisma update notice was informational; no dependency was upgraded.
- git diff --check: **passed**. All 15 local rationale links resolved. Hash comparison found no change to protected files or any of the three owner-supplied screenshot originals.
- A separate evidence probe completed **23 checks across 26 actual HTTP requests**, with zero Set-Cookie response headers. See [04-form-switch-logs.txt](../evidence/04-form-switch-logs.txt).

The HTTP log distinguishes direct HTML requests from scripted RSC protocol probes. The initial recorder expected an immediate 200 for a synthetic RSC cache key and received 307; it was corrected to record same-origin framework cache-key redirect hops and their final responses. No application change was needed for that recorder correction. Such a redirect is not, by itself, evidence of a browser document reload.

Browser automation could not start: the Windows sandbox helper failed twice, including after a runtime reset. I therefore have **not** claimed fresh final-URL browser clicks, Back/Forward results, document-identity continuity, responsive measurements or session-storage observations. The fresh log contains genuine Node HTTP checks, not relabelled browser events or old mode= measurements.

Commands actually used:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/auth-foundation/state.test.mjs
npm run test:assessment
npm run typecheck
npm run build
NODE_ENV=production ENABLE_PERSISTENCE_EXPERIMENT=false npm run start -- --hostname 127.0.0.1 --port 3100
# Separate terminal while the production server is running:
AUTH_TEST_BASE_URL=http://127.0.0.1:3100 node --test tests/auth-foundation/routes.test.mjs
```

## Remaining manual verification

The final screenshots and direct HTTP/RSC contract evidence are available. Live browser switching still needs a genuine check for the final URLs: open /auth?signup, enable Preserve log in DevTools Network, clear the log, and use the visible links through login and reset. Distinguish Document from Fetch/XHR requests, then test Back/Forward and refresh. Confirm focus, cleared input/feedback, responsive behaviour and no session creation without exposing credentials or cookie values. Record those results before claiming final-URL no-reload or browser-history verification passed.

The screenshots alone cannot prove that a document was not reloaded. Likewise, scripted RSC requests prove transport responses, not actual browser navigation. Formal screen-reader testing, full validation, terms acceptance, authentication and security experiments remain later milestones.

The temporary verification servers were stopped after checks. Build/typecheck regenerated the normal ignored next-env.d.ts file; no application routing source was changed in this follow-up. The only test-source change added homepage and disabled-assessment regression coverage.

No database operations, migrations, real email, package changes, Git staging, commits or pushes were performed. PRD, rules, Task One, Task Two, historical foundation documentation and 00-foundation evidence are preserved.

Assumptions: none

## Approved Step 4 extension: guarded verify screen

The preceding three-state contract and counts record Step 1's actual consolidation. The owner subsequently added Tailor Email Verification to the PRD and approved one additional key-only screen state, `/auth?verify`, for Step 4 Stage A. The existing default/login/signup/reset URLs keep their previous behaviour. This is still one authentication page route, not a new credential-form mode or a new client invitation flow.

`AuthState` includes verify, while `AuthMode` remains the three credential modes so password/Signup logic cannot accidentally treat verification as a password form. The [server page](../../app/%28auth%29/auth/page.tsx) selects [EmailVerificationForm](../../app/%28auth%29/_components/EmailVerificationForm.tsx) separately, with a distinct title and shared auth layout. Signup does not navigate there on a fake registration success. The verification view has a normal Next.js Back to login link.

For Stage A, the [existing auth proxy](../../proxy.ts) and page require explicit local-development opt-in with `ENABLE_CODE_INPUT_EXPERIMENT=true` and a canonical loopback Host. The proxy rejects before streaming so disabled verification gets real HTTP 404 for both documents and RSC navigation. Its matcher remains /auth; next.config.ts is unchanged. Production returns 404 even with the flag enabled. No numeric version is served as production verification.

The URL parser still rejects unknown keys, assignments, duplicates, conflicts, mode parameters and encoded aliases. New invalid examples include `?verify=`, `?verify=1`, `?verify&verify`, `?verify&login` and `?mode=verify`. Next's internal RSC serialization is handled only under the existing transport rules, not accepted as public query syntax.

At Stage A, source counts were four application page routes (home, auth, assessment enquiry and the retained code-input comparison) and one authentication page route. The increase came from the earlier standalone comparison, not this query-state extension. After the owner completed both Step 4 evidence groups, cleanup removed the comparison: current source counts are three application page routes and one auth page, with four URL-selected screens. Historical foundation and Step 1 route-count evidence is preserved rather than rewritten.

Automated verification passed: 81 combined unit/component/query-policy checks; 21 database-free assessment regressions; 60 HTTP checks per context across development off/on and production; typecheck and build. The verification browser suite passed direct loading, refresh, browser Back/Forward and no full-document reload while using Back to login/history. The existing Signup document/Login/Reset browser suite also passed: 14 Node tests including their two parents overall. These results do not constitute owner screenshots or spoken Narrator observations.

[The final numeric-input record](numeric-input.md#genuine-before-and-after-evidence) maps both completed evidence groups and gives current activation instructions. That handoff described the temporary native field. Stage B and the owner-approved cleanup are now complete: the text field remains, the standalone comparison returns 404, and the unchanged local-only guard now lives in lib/auth/verification-preview.ts. The final numeric-input record maps all six genuine PNGs and records the current tests. No authentication backend, email, database operation or session was added.
