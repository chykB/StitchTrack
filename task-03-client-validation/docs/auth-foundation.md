# Task Three: separate authentication foundation

## Starting point and route count

I started from a clean working tree on main at commit `6803d2c2af119e9936285f615881b067283edc2c`, then created `feat/task-03-auth-foundation` with approval. Before this milestone there were **zero authentication page routes**. The existing pages were the homepage and assessment enquiry page. These authentication interfaces did not exist during Task Two.

This foundation adds **three separate authentication page routes**:

The source entries below are verified Git object references at foundation commit `cb31dc9`, not live working-tree paths. For example, inspect Signup with `git show 'cb31dc9:app/(auth)/signup/page.tsx'`.

| Route | Source at `cb31dc9` | Fields |
| --- | --- | --- |
| /signup | `cb31dc9:app/(auth)/signup/page.tsx` | Email address and password |
| /login | `cb31dc9:app/(auth)/login/page.tsx` | Email address and password |
| /forgot-password | `cb31dc9:app/(auth)/forgot-password/page.tsx` | Email address |

The later milestone will consolidate these into one route controlled by a URL query parameter. That work is **not implemented**. The genuine timeline is zero before this foundation, three afterward, and one only after the later consolidation is approved and verified.

## Implementation and boundaries

These are tailor-facing interfaces, linked to each other and home. Signup explains that clients use an invitation without creating a password. I have not introduced client password registration.

I reused the root layout's DM Sans loading, design-token import, brand and skip link. The [auth layout](../../app/%28auth%29/layout.tsx) provides a main landmark and labelled panel. [FormField](../../app/%28auth%29/_components/FormField.tsx) shares visible labels, input types and autocomplete attributes. [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) shares the disabled fieldset, local interaction and initially empty polite status region. Each route owns its fields, copy and navigation. Reusing these pieces prepares for consolidation without doing it now.

The [stylesheet](../../app/%28auth%29/auth.module.css) reuses semantic primary, surface, outline and text colours, Headline Large/Small, Label Large and Soft shadow tokens. Body text inherits Body Medium. Layout values follow the existing scaffold; the panel is capped at 32rem. Buttons use 0.75rem 1.5rem padding and a 0.5rem radius. Each route has a distinct title and inherits noindex, nofollow from the auth layout. No Task One files were changed.

Authentication remains unavailable. I removed the original permanent pink availability banners in the approved UI refinement; there is no replacement warning or visible placeholder. Only an attempted submission displays a short inline message: "Account creation is not available yet.", "Login is not available yet." or "Password reset is not available yet." There is no success state, session or backend request.

The empty status region exists before interaction so its later text can be announced. It uses role="status", aria-live="polite" and aria-atomic="true". After an attempt the form references it through aria-describedby. It has no warning-box background or border, and keyboard focus stays on the control that triggered submission.

I deferred consolidation, full validation, terms acceptance, password visibility controls, Better Auth, account APIs, password storage, email and migrations. Native validation popups are suppressed for this unavailable UI so its explanation remains consistent. These forms are not ready for real credentials. Only synthetic values should be used for foundation checks. Full accessibility and screen-reader assessment remain later work.

## Safe before and after hydration

The server-rendered fieldset is disabled, including submit. Its legend contains no controls, avoiding the disabled-fieldset legend exception. Controls remain disabled when JavaScript is unavailable. An effect enables them only after hydration installs the submit handler. That handler prevents native submission and changes only a boolean to display the unavailable message. It never reads, sends, stores or logs the field values.

The form explicitly uses POST instead of the browser's default GET and has no action endpoint. The disabled controls and local handler prevent submission; the method attribute alone is not the protection.

## Original foundation verification

These results describe the initial foundation before the banner refinement. Current refinement checks are recorded separately below.

I ran these commands in the existing WSL Node.js 24.22.1 environment:

```sh
npm run test:assessment
npm run typecheck
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
# In another terminal while the server is running:
node --test tests/auth-foundation/routes.test.mjs
```

- Assessment regression: **21 passed, 0 failed**, using mocked dependencies without database access.
- Typecheck: **passed**. Its existing precheck generated Prisma Client 7.10.1 without a database connection.
- Production build: **passed**, including existing offline client generation. Next.js 16.4.2 lists the three auth routes separately as prerendered pages.
- [Route tests](../../tests/auth-foundation/routes.test.mjs): **3 passed, 0 failed**. They GET the local pages and check HTTP 200, separate titles, headings, labels, autocomplete, navigation, noindex/nofollow, no Set-Cookie header and the disabled pre-hydration controls. All inputs and the submit button must be within the disabled fieldset; the legend must have no controls. The tests passed again after strengthening those assertions.
- Layout: all three routes checked at **375px, 768px and 1440px**. All nine cases had zero measured horizontal overflow. Panels measured approximately 343px at 375px and 512px at larger widths. Headings measured 24px, 31.36px and 32px respectively. Mobile screenshots were visually inspected; shorter screens can scroll vertically.
- Rendered styles: DM Sans; Label Large buttons at 16px/24px and weight 500. The primary background measured rgb(141, 73, 98), changing to rgb(255, 217, 227) under the pointer, with the Soft shadow. Login keyboard traversal reached email, password and submit in order with a visible 2px wine outline. The skip link focused main. Auth links and the logo-home link navigated correctly.
- Hydrated safety: synthetic values followed by button clicks and Enter on each route displayed only its unavailable message. URLs stayed unchanged, without email/password query parameters.
- Script-disabled safety: a temporary loopback proxy served the actual pages inside an iframe with `sandbox="allow-same-origin allow-forms"` and no allow-scripts permission. Native forms remained permitted. All input/submit controls stayed disabled on all three routes; a disabled signup field refused a click. This was a script-disabled browser document, not a change to the browser's global JavaScript setting.
- The fixture counted **31 GET/HEAD requests, 0 other methods and 0 blocked writes** across those safety checks. Framework asset/prefetch GETs occurred; no form POST occurred. It logged no bodies or credentials, blocked any write forwarding and was not added to the repository. The initial Windows-hosted fixture timed out from the browser; running it in WSL resolved that environment problem without an application change.
- The final normal application page's browser warning/error capture returned no entries. This is a smoke check, not a full browser compatibility or accessibility certification.

The final whitespace check (git diff --check) passed, and all eight local links in this record resolved. The tracked-file scope is the new auth implementation, route tests, this record and the README status/link update. Typecheck/build also regenerated ignored next-env.d.ts and tsconfig.tsbuildinfo files. Temporary verification servers were stopped after checking.

No package installation, database operation, migration, email, staging, commit or push was performed. PRD, rules, Task One artifacts, Task Two evidence, the enquiry implementation and dependencies remain unchanged.

## Availability-banner refinement verification

I made a focused follow-up on the same branch: removed the permanent banner and its unused CSS, shortened the three unavailable-action messages, and changed the shared form's accessible description to reference feedback only after an attempt. Route count stays at three. Fields, buttons, navigation, other layout rules and tokens are unchanged. The route tests now require an initially empty polite, atomic status region and no old availability-banner element or initial aria-describedby reference.

I reran the database-free assessment regression tests (**21 passed**), TypeScript check (**passed**) and production build (**passed**, including existing offline Prisma Client generation). The updated route tests also passed (**3 passed, 0 failed**). An existing server occupied port 3000, so I verified the built application on port 3100 without stopping that existing server:

```sh
npm run test:assessment
npm run typecheck
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
# Separate terminal while the server is running:
AUTH_TEST_BASE_URL=http://127.0.0.1:3100 node --test tests/auth-foundation/routes.test.mjs
```

In the browser, all three routes initially had an empty feedback region, no banner and no form paragraphs. Both Enter from a filled field and button activation after a fresh load inserted only the short unavailable message. Each status had role="status", aria-live="polite" and aria-atomic="true"; the form then referenced auth-feedback. The status text appeared in the accessibility tree, and Enter kept focus on the input. I also checked Enter on the focused login and signup buttons. This verifies the live-region semantics and exposed content; I have not claimed a spoken screen-reader test.

A temporary loopback proxy counted 43 GET/HEAD requests (including framework requests), **zero non-GET/HEAD requests, zero credential-bearing query detections and zero blocked writes** across the synthetic-input and script-disabled checks. It forwarded no write operations and logged no request bodies or query values. Page URLs did not change when attempting submission. All inputs and submit controls remained disabled in each script-disabled document, with native forms still permitted by the iframe sandbox. The SSR route checks separately verified the disabled pre-hydration fieldset.

I checked all three routes at 375px, 768px and 1440px before and after feedback appeared: all 18 states fit horizontally, and the nine after-attempt measurements found no overflowing fields, buttons, headings, paragraphs or links. Panel widths, responsive heading sizes and Label Large button typography matched the original foundation. The feedback paragraph had a transparent background. Mobile screenshots showed no replacement warning box. Keyboard focus retained its visible wine outline, navigation between the three routes worked, and normal-page browser warning/error capture returned no entries.

The temporary fixture and port-3100 verification server were stopped after checking. A fresh review screenshot is outside the repository; original screenshots and Task Two evidence were not changed. Full screen-reader testing, authentication behaviour and consolidation remain outside this refinement.

## Manual evidence still required before consolidation

A review screenshot was taken outside the repository during browser verification. It does not replace the assessment evidence that I still need to capture and retain before consolidation:

1. Terminal branch/revision and the three auth page files. Preserve the zero-route starting observation above; do not reconstruct a Task Two screenshot containing these pages.
2. Each real route with the browser address bar visible and field labels, initially without an availability banner: /signup, /login and /forgot-password, including a mobile view.
3. Navigation between these separate pages and home, to compare with the future query-controlled route.
4. Button/Enter interaction and the truthful unavailable message, with a cleared Network panel showing no credential submission. Also disable JavaScript on the real route and capture disabled controls. Use synthetic values only.
5. Route-test, regression, typecheck and build results. Capture consolidation, validation, terms, screen-reader and direct-request security evidence only when those later milestones are actually implemented and tested.

For local review, run `npm run dev` and open [signup](http://127.0.0.1:3000/signup), [login](http://127.0.0.1:3000/login) or [password reset request](http://127.0.0.1:3000/forgot-password). These pages require neither PostgreSQL nor assessment credentials.

Assumptions: none
