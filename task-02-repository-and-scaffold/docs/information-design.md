# Task Two, Step 10: Information Design

Implemented and verified on `feat/information-design` on 24 October 2026. This change is limited to presentation, route metadata and static brand assets.

## Decisions and scope

- Homepage H1: **Keep tailoring orders and agreements clear**.
- Supporting tagline: **Order and agreement management for Nigerian tailoring studios** (eight words).
- Removed the homepage eyebrow, which repeated the heading's subject, and replaced the longer supporting paragraph with the approved tagline.
- Retained the existing enquiry form's single **Save test enquiry** action. There was no competing action to remove. Clearer copy may reduce reading effort for new visitors, but this task does not demonstrate a reduction in choices or measured user growth. No extra buttons were introduced.
- Reused the existing Task One CSS import, local DM Sans font, semantic colours and Soft shadow. No tokens, generator, font files or Task One files changed.
- Kept the existing layout, assessment fields, submission component, endpoint, validation, security gates and persistence code.
- The PRD, rules, dependencies, schema, migration and historical assessment evidence are unchanged. No database operations or form submissions were performed.

## Genuine before and after

The optional `information-design-baseline.png` records the original one-word homepage heading at 1440 ? 900.

Next, only the approved longer H1 copy was introduced while the original heading styles, eyebrow and paragraph remained. At 1000 ? 800, the original 52px heading occupied an 838px content width and wrapped as:

> Keep tailoring orders and agreements\
> clear

The isolated final word was a genuine observed wrapping problem. Screenshot 18 captures that intermediate application state. No artificial width restriction or deliberate broken styling was introduced.

The corrected heading uses `max-inline-size: 18ch` and `text-wrap: balance`. At the same 1000 ? 800 viewport it occupies approximately 642.09px and wraps as:

> Keep tailoring orders\
> and agreements clear

Screenshot 19 captures this result using the same H1 copy and viewport. The approved 18ch maximum was retained because browser inspection showed balanced wrapping. The eyebrow and supporting paragraph were also simplified in the final page.

## Typography and responsive measurements

Homepage selector: `.title` in `app/page.module.css`.

- Family and weight: Display Small DM Sans, 600.
- Size: `clamp(var(--stitchtrack-type-display-small-font-size), calc(1.25rem + 4vw), var(--stitchtrack-type-display-large-font-size))`, bounded by the exported 36px and 52px values.
- Line height: the exported Display Small ratio, 50.4 / 36 = 1.4, so leading scales with the fluid size.
- Letter spacing: Display Small ?0.18px below 760px; Display Large ?0.52px from 760px.
- Maximum inline size: 18ch; available panel width can constrain it further.

Assessment selector: `.title` in `app/assessment/enquiry/enquiry.module.css`.

- DM Sans 600; Headline Small/Large bounds of 24px and 32px.
- Preferred size: `calc(1rem + 2vw)`.
- Line height: exported Headline Large ratio, 44.8 / 32 = 1.4.
- Existing Headline Large letter-spacing token retained; maximum inline size 18ch.

Actual Chrome measurements, with the default 16px root size:

| Viewport | Homepage size / leading | Homepage heading width | Assessment size / leading | Horizontal overflow |
| --- | --- | --- | --- | --- |
| 375px | 36px / 50.4px | 293px | 24px / 33.6px | None on either route |
| 768px | 50.72px / 71.008px | 606px | 31.36px / 43.904px | None on either route |
| 1440px | 52px / 72.8px | 642.09px | 32px / 44.8px | None on either route |

At 375px the homepage has three readable lines: ?Keep tailoring? / ?orders and? / ?agreements clear?. At 768px and 1440px it has the two balanced lines shown above.

## Buttons, hover and keyboard interaction

The existing `.submit` button keeps Task One Label Large family, weight, size, line-height and letter-spacing tokens. Computed values: DM Sans, 500, 16px / 24px, zero tracking (reported as `normal` by Chrome).

Padding is now `0.75rem 1.5rem` and radius `0.5rem`, computing to 12px 24px and 8px at the default root size.

- Default: primary / on-primary, computed background `rgb(141, 73, 98)` and white text.
- Enabled hover: primary-container / on-primary-container, computed background `rgb(255, 217, 227)` and text `rgb(113, 49, 74)`.
- Button and links have pointer cursors. The existing disabled wait cursor remains.
- Brand and skip links gain underlines on hover. The logo's existing `href="/"` was verified by clicking it from the assessment route: navigation returned to the homepage and updated the title.
- Keyboard Tab reached the visible skip link, logo, name input, enquiry textarea and submit button in order. Each matched `:focus-visible` with the existing 2px primary outline and 4px offset.
- No submit click, Enter submission or persistence request was used for these checks.

## Rendered head and brand assets

The root layout now supplies only the fallback title, so marketing metadata is scoped to the homepage.

| Route | Actual rendered title | Other verified metadata |
| --- | --- | --- |
| `/` | StitchTrack \| Tailoring orders and agreements | Existing marketing description; Open Graph website type, title, eight-word description, site name, local URL, image URL, dimensions and alt text |
| `/assessment/enquiry` | Assessment enquiry \| StitchTrack | `noindex, nofollow`; no marketing description or Open Graph tags |

The homepage's explicit metadata base is `http://127.0.0.1:3000`, solely for this local assessment. Its rendered OG URL is that local origin and its image URL is `http://127.0.0.1:3000/stitchtrack-og.png`. This is not a production origin or a deployable social-sharing claim. An approved public origin and external crawler verification would be required before public sharing.

- `app/icon.png`: 68 ? 68 PNG captured from the existing 34px ST badge at 2? resolution, preserving its existing colours, DM Sans and rounded shape. Next.js adds the favicon link to both routes.
- `public/stitchtrack-og.png`: 1200 ? 630 branded PNG, rendered in Chrome using the unchanged Task One tokens, local DM Sans, ST badge, approved heading and tagline.
- Browser GET checks returned HTTP 200 for both assets; decoded image dimensions matched the above.
- Metadata was inspected in the actual rendered DOM using Chrome's built-in Elements panel. No public social platform or external preview service was tested.

## Screenshot evidence

All images were captured from the actual local application with installed headless Chrome 155.0.8059.85. Existing evidence was preserved.

| File in `../evidence/` | Capture |
| --- | --- |
| `16-head-route-one.png` | Homepage rendered head in Chrome Elements: title, description, OG tags and favicon |
| `17-head-route-two.png` | Assessment rendered head: distinct title, robots restriction and favicon |
| `18-heading-wrap-bad.png` | Genuine longer-heading intermediate state at 1000 ? 800, before responsive corrections |
| `19-heading-wrap-good.png` | Corrected same heading at 1000 ? 800 |
| `20-responsive-three-widths.png` | One browser comparison containing live homepage frames with verified 375px, 768px and 1440px viewports |
| `information-design-baseline.png` | Additional original homepage baseline at 1440 ? 900 |

Screenshot 20 uses a temporary browser-only comparison document around three live, unmodified application frames. Its width labels are evidence annotations, not application UI. No comparison route or dependency was added.

The connected browser automation runtime failed to initialize; verification used the installed Chrome DevTools Protocol instead. Metadata screenshots show the genuine built-in Elements inspector, not a reconstructed head report.

## Checks actually run

- `npm run test:assessment`: **21 passed, 0 failed**, using the existing database-free tests.
- `npm run typecheck`: **passed**. Its existing pre-step generated Prisma Client 7.10.1 without a database connection.
- `npm run build`: **passed**, including Next.js production compilation, TypeScript and static generation. The existing pre-build Prisma generation also succeeded.
- Production server GET verification, with `ENABLE_PERSISTENCE_EXPERIMENT=true`: homepage **200**, assessment page **404**, favicon **200**, OG image **200**. The production restriction remains effective even with the local experiment flag set.
- Browser checks covered route titles, metadata separation, image responses/dimensions, wrapping, both headings at three widths, button typography and hover, keyboard focus, and logo navigation.
- Browser verification requests were GET/HEAD only. No database integration tests ran.
- A SHA-256 comparison of 80 pre-existing files found changes only in the six intended application presentation/metadata files. It confirmed preservation of the PRD, rules, design system, persistence code, schema, migration, packages, tests and original evidence.
- `git diff --check`: **passed**, with no whitespace errors.

For local reinspection, run `npm run dev -- --hostname 127.0.0.1 --port 3000`. To view the gated assessment form, set `ENABLE_PERSISTENCE_EXPERIMENT=true` for that development process only. Do not submit the form unless separately authorized to perform database operations.

## Limitations and lifecycle

This is an information-design assessment, not a new production workflow. The assessment remains disabled by default and unavailable in production. No new authentication, persistence or business behavior was introduced. Public social-sharing behavior, user-growth effects and fresh database writes were not tested in this task.

No packages were installed and no Git changes were staged, committed or pushed. Temporary verification servers and the verification browser were stopped after the checks.

Assumptions: none
