# StitchTrack Design System Divergences

StitchTrack uses Material Design as a starting point, but I made two deliberate typography decisions to better suit a tailoring order-management platform.

## 1. DM Sans Instead of Roboto

**Starting point:** Material Design commonly uses Roboto as its default typeface.

**My decision:** I selected DM Sans after comparing it with Manrope and Plus Jakarta Sans using StitchTrack interface content.

**Why:** StitchTrack presents order numbers, delivery dates, customer details, payment balances, and short status labels. I preferred how DM Sans presented this information in a compact dashboard while keeping the interface approachable and professional.

**When this decision could be wrong:** DM Sans may be less appropriate for a product that needs to closely follow native Material Design conventions or support scripts and languages not adequately covered by the selected font files. The choice should be revisited if usability testing reveals readability problems.

## 2. Customized Display Typography

**Starting point:** An unmodified Material typography scale would use its predefined display sizes, line heights, and spacing.

**My decision:** I created a custom scale with Display Large at 52px, a 72.8px line height, and -1% letter spacing. Display Medium and Small use -0.5% letter spacing.

**Why:** In Figma, I compared the same Display Large text at 0% and -1% letter spacing. Its measured width decreased from approximately 533px to 523px, making the heading more compact without reducing font size.

I also adopted a 1.4 line-height multiplier for headings and 1.5 for body text and labels to distinguish short interface headings from reading content.

**When this decision could be wrong:** Tighter letter spacing may reduce readability for some users, particularly with unfamiliar words or long headings. The generous 1.4 line height could also waste space in dense interfaces. Both choices should be tested at different viewport widths and browser zoom levels.

## Conclusion

These decisions were made for StitchTrack's current operational context, not because the Material defaults are inherently unsuitable.

The goal was to create a consistent system that supports everyday tailoring workflows while leaving room to refine it through actual user testing.

**Supporting evidence:** `03-spacing-default.png`, `04-spacing-chosen.png`, and `06-tokens-complete.json`.

**Additional documentation:** `docs/type-scale.md`.