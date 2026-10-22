# StitchTrack Shadow System

## Shadow Design

StitchTrack uses three elevation styles: Soft, Medium, and Hard. They were created in Figma using the Tailored Wine primary colour (`#8D4962`) instead of black.

| Shadow | X | Y | Blur | Spread | Opacity |
|---|---:|---:|---:|---:|---:|
| Soft | 0px | 2px | 8px | 0px | 10.2% |
| Medium | 0px | 6px | 16px | -2px | 16.1% |
| Hard | 0px | 12px | 28px | -4px | 22.0% |

These values are taken from the complete Figma export. The percentages are rounded from the exported alpha-channel values.

## Why Brand-Coloured Shadows?

A shadow based on Tailored Wine creates a softer, warmer visual impression that blends with StitchTrack's pink-neutral surfaces. A black shadow would appear more neutral and potentially harsher against the same background, making the interface feel less connected to the brand.

## Application in the Dashboard

- **Soft:** Summary cards, where elevation should remain subtle.
- **Medium:** The order-management panel, separating it from the page background.
- **Hard:** The outstanding-balance card, providing stronger visual emphasis.

The Hard shadow works for the current demonstration but may be excessive for an ordinary dashboard card. In a production interface, I would review whether the Medium shadow provides sufficient emphasis without making the financial card appear unusually elevated.

## Export and Implementation

The shadows were exported from Figma in `evidence/06-tokens-complete.json` and converted into CSS variables:

```css
--stitchtrack-shadow-soft:
  0px 2px 8px 0px #8d49621a;

--stitchtrack-shadow-medium:
  0px 6px 16px -2px #8d496229;

--stitchtrack-shadow-hard:
  0px 12px 28px -4px #8d496238;
```

The dashboard consumes these through `var(--stitchtrack-shadow-soft)`, `var(--stitchtrack-shadow-medium)`, and `var(--stitchtrack-shadow-hard)`.

**Limitation:** Although these shadows were designed from the primary colour, their exported CSS currently contains literal RGBA hex values. Changing the Primary colour token alone will not recolour the shadows; the shadow definitions must also be updated and re-exported.

**Source:** `evidence/06-tokens-complete.json`  
**Implementation:** `assets/stitchtrack-tokens.css` and `preview/styles.css`