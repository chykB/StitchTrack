# StitchTrack Typography System

## 1. Typography Direction

StitchTrack is designed for tailoring businesses that need to manage orders, garment details, delivery dates, payments, and client agreements.

Users need to scan information quickly, particularly on mobile devices. The typography should therefore feel clear, organized, and approachable without making the interface unnecessarily decorative.

I compared DM Sans, Manrope, and Plus Jakarta Sans using sample content relevant to garment orders and dashboard information.

I selected **DM Sans** because its letterforms worked well for the compact labels, numbers, headings, and order details in StitchTrack. The choice prioritizes readability and information hierarchy over a distinctive editorial appearance.

This differs from the Material Design default typeface, Roboto. The decision is intentional, not a claim that DM Sans is universally more readable.

## 2. Complete Type Scale

The system contains **15 text styles**, organized into five roles with three sizes each.

All styles use DM Sans. Sizes, line heights, and letter spacing are recorded below in pixels.

| Style | Weight | Size | Line height | Letter spacing |
|---|---|---:|---:|---:|
| Display / Large | SemiBold (600) | 52 | 72.8 | -0.52 |
| Display / Medium | SemiBold (600) | 44 | 61.6 | -0.22 |
| Display / Small | SemiBold (600) | 36 | 50.4 | -0.18 |
| Headline / Large | SemiBold (600) | 32 | 44.8 | 0 |
| Headline / Medium | SemiBold (600) | 28 | 39.2 | 0 |
| Headline / Small | SemiBold (600) | 24 | 33.6 | 0 |
| Title / Large | SemiBold (600) | 22 | 30.8 | 0 |
| Title / Medium | SemiBold (600) | 20 | 28 | 0 |
| Title / Small | SemiBold (600) | 18 | 25.2 | 0 |
| Body / Large | Regular (400) | 18 | 27 | 0 |
| Body / Medium | Regular (400) | 16 | 24 | 0 |
| Body / Small | Regular (400) | 14 | 21 | 0 |
| Label / Large | Medium (500) | 16 | 24 | 0 |
| Label / Medium | Medium (500) | 14 | 21 | 0 |
| Label / Small | Medium (500) | 12 | 18 | 0 |

The Figma export contains the complete styles under `font`, with corresponding dimensional tokens under `typography`.

## 3. Line-Height Decisions

The system uses two line-height multipliers.

| Role | Multiplier | Reason |
|---|---|---|
| Display | 1.4 | Keeps large headings visually connected across lines |
| Headline | 1.4 | Maintains compact hierarchy for page headings |
| Title | 1.4 | Keeps card and section titles grouped |
| Body | 1.5 | Gives longer descriptions and instructions more breathing room |
| Label | 1.5 | Supports readability in small interface labels |

For example:

- Display Large: 52 × 1.4 = 72.8px
- Headline Large: 32 × 1.4 = 44.8px
- Body Medium: 16 × 1.5 = 24px
- Label Small: 12 × 1.5 = 18px

I used 1.4 for heading-related roles because those elements are usually shorter and should feel visually grouped. Body text and labels use 1.5 because their content often needs more vertical separation.

I did not use 1.6 in this scale. It may be useful for longer reading content, but the current interface primarily contains concise operational information.

## 4. Letter-Spacing Experiment

I compared **Display Large at the default 0% letter spacing** with the same 52px DM Sans style at **-1% letter spacing**.

The sample text measured approximately 533px at the default spacing and 523px at the chosen spacing, reducing its width by around 10px without changing the font size.

The tighter setting made the large heading more compact and visually cohesive. This matters when space is limited, although it does not mean tighter spacing improves readability in every context.

I therefore selected:

- Display Large: -1% (-0.52px)
- Display Medium: -0.5% (-0.22px)
- Display Small: -0.5% (-0.18px)
- All other styles: 0%

I kept body and label letter spacing at zero to avoid making already-small information unnecessarily dense.

**Comparison evidence:**

- `evidence/03-spacing-default.png`
- `evidence/04-spacing-chosen.png`

These screenshots should show the same Display Large sample with only the letter spacing changed.

## 5. Typography Applied to the Dashboard

The order-overview screen demonstrates how the defined styles are consumed.

| Interface element | Applied style |
|---|---|
| Order overview heading, desktop | Headline / Large |
| Order overview heading, ≤420px | Headline / Medium |
| StitchTrack wordmark | Title / Large |
| Summary figures | Headline / Large |
| Orders section title | Title / Small |
| Default compact dashboard text | Body / Small |
| Customer name on mobile | Label / Large |
| Supporting interface labels | Label styles |

The styles are consumed through CSS variables generated from the complete token export.

For example, the desktop page heading uses the Headline Large font family, size, weight, line height, and letter-spacing variables.

This was independently questioned during the agent verification exercise, and the agent identified the desktop and mobile typography styles along with their CSS selector and source tokens.

The response is preserved in `evidence/08-agent-typography-answer.txt`.

## 6. Trade-offs and Limitations

The typography choices are specific to StitchTrack's current operational dashboard.

**DM Sans:** Its straightforward appearance suits structured information, but it may be less appropriate if the product later needs a highly expressive fashion-editorial presentation.

**Tighter display spacing:** It helps large text occupy less horizontal space, but may be less suitable for unfamiliar words, long headings, or situations where extra letter separation improves recognition.

**Compact dashboard text:** Body Small at 14px works for the current information-dense preview, but should not automatically become the default for long forms, instructions, or reading-heavy interfaces. Body Medium at 16px is a better starting point for those contexts.

**Small labels:** Label Small at 12px should be used sparingly for secondary information, not critical instructions or actions.

Typography alone does not guarantee accessibility. Browser zoom, responsive wrapping, user font settings, and actual-device testing remain important.

## 7. Implementation and Source of Truth

The styles were created in Figma and exported in `evidence/06-tokens-complete.json`.

The JavaScript conversion script at `scripts/build-tokens.mjs` produces the corresponding CSS custom properties in `assets/stitchtrack-tokens.css`.

The dashboard consumes those variables in `preview/styles.css`.

The approved values should be changed at the design-token source and regenerated, rather than independently adjusted across components.

This preserves consistency between the Figma design system and the implementation.