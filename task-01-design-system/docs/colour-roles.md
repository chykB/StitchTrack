# StitchTrack Colour Roles and Contrast

## 1. Colour System Overview

StitchTrack uses a monochromatic Tailored Wine palette, warm neutral surfaces, and separate success, warning, and error palettes.

The primary brand role resolves to `#8D4962`, generated from the Tailored Wine colour direction. This gives the interface a consistent identity without using the same colour for every element.

The system separates colour into two levels:

- **Primitives** define actual palette values, such as `Primary/40`.
- **Semantic roles** describe a colour's purpose, such as `Primary`, `On Primary`, `Background`, or `On Surface`.

Components use semantic roles rather than referencing primitives or hardcoded hex values directly.

For example:

```css
--stitchtrack-color-primary:
  var(--stitchtrack-primitive-primary-40);
```

This allows a palette change to flow through the interface while preserving the intended role of each colour.


## 2. Role Definitions and Palette References

The complete Figma export contains 57 semantic colour roles. The mapping below groups roles that share the same primitive.

`P` means **StitchTrack Primitives** and `F` means **StitchTrack Functional Primitives**.

### Brand Roles

| Semantic role(s) | Primitive reference |
|---|---|
| Primary, Surface Tint | P / Primary / 40 |
| On Primary | P / Neutral / 100 |
| Primary Container, Primary Fixed | P / Primary / 90 |
| On Primary Container, On Primary Fixed Variant | P / Primary / 30 |
| On Primary Fixed | P / Primary / 10 |
| Primary Fixed Dim, Inverse Primary | P / Primary / 80 |
| Secondary | P / Secondary / 40 |
| On Secondary | P / Neutral / 100 |
| Secondary Container, Secondary Fixed | P / Secondary / 90 |
| On Secondary Container, On Secondary Fixed Variant | P / Secondary / 30 |
| On Secondary Fixed | P / Secondary / 10 |
| Secondary Fixed Dim | P / Secondary / 80 |
| Tertiary | P / Tertiary / 40 |
| On Tertiary | P / Neutral / 100 |
| Tertiary Container, Tertiary Fixed | P / Tertiary / 90 |
| On Tertiary Container, On Tertiary Fixed Variant | P / Tertiary / 30 |
| On Tertiary Fixed | P / Tertiary / 10 |
| Tertiary Fixed Dim | P / Tertiary / 80 |

### Surface and Utility Roles

| Semantic role(s) | Primitive reference |
|---|---|
| Background, Surface, Surface Bright | P / Neutral / 98 |
| On Background, On Surface | P / Neutral Variant / 10 |
| Surface Variant | P / Neutral Variant / 90 |
| On Surface Variant | P / Neutral Variant / 30 |
| Outline | P / Neutral Variant / 50 |
| Outline Variant | P / Neutral Variant / 80 |
| Shadow | P / Primary / 10 |
| Scrim | P / Neutral / 0 |
| Inverse Surface | P / Neutral / 20 |
| Inverse On Surface | P / Neutral / 95 |
| Surface Dim | P / Surface Scale / Dim |
| Surface Container Lowest | P / Neutral / 100 |
| Surface Container Low | P / Surface Scale / Container Low |
| Surface Container | P / Surface Scale / Container |
| Surface Container High | P / Surface Scale / Container High |
| Surface Container Highest | P / Surface Scale / Container Highest |

### Functional Roles

| Semantic role(s) | Primitive reference |
|---|---|
| Error | F / Error / 40 |
| On Error | P / Neutral / 100 |
| Error Container | F / Error / 90 |
| On Error Container | F / Error / 30 |
| Success | F / Success / 40 |
| On Success | P / Neutral / 100 |
| Success Container | F / Success / 90 |
| On Success Container | F / Success / 30 |
| Warning | F / Warning / 40 |
| On Warning | P / Neutral / 100 |
| Warning Container | F / Warning / 90 |
| On Warning Container | F / Warning / 30 |

The full export includes roles for future screens as well as those already used by the order dashboard. Roles are retained even when the current screen does not consume them.

## 3. How Roles Are Used in StitchTrack

The order-overview screen applies the roles according to their purpose.

| Interface element | Roles used |
|---|---|
| Page background and text | Background / On Background |
| Header and order panel | Surface Container Lowest / On Surface |
| StitchTrack logo | Primary / On Primary |
| Order identifiers and eyebrow | Primary |
| Outstanding balance card | Primary Container / On Primary Container |
| Order-count badge | Secondary Container / On Secondary Container |
| Approved status | Success Container / On Success Container |
| Pending approval | Warning Container / On Warning Container |
| Changes required | Error Container / On Error Container |
| Supporting text | On Surface Variant |
| Panel and table separators | Outline Variant |

Status labels use both text and colour. For example, "Approved", "Pending approval", and "Changes required" communicate meaning even when someone cannot distinguish the colours.

## 4. Contrast Verification

Contrast was calculated from the resolved colours in `06-tokens-complete.json` using the WCAG relative-luminance contrast formula.

WCAG AA requires at least **4.5:1 for normal text** and **3:1 for large text**.

The following ratios cover the distinct text/background combinations used in the current order-overview screen.

| Foreground role | Background role | Ratio |
|---|---|---:|
| On Background | Background | 16.37:1 |
| On Background | Surface Container Lowest | 17.16:1 |
| On Surface | Surface Container Lowest | 17.16:1 |
| On Surface Variant | Background | 8.90:1 |
| On Surface Variant | Surface Container Lowest | 9.33:1 |
| On Surface Variant | Surface Container Low | 8.45:1 |
| Primary | Surface Container Lowest | 6.44:1 |
| Primary | Background | 6.14:1 |
| On Primary | Primary | 6.44:1 |
| On Primary Container | Primary Container | 7.27:1 |
| On Primary Container | Surface Container Lowest | 9.37:1 |
| On Secondary Container | Secondary Container | 7.27:1 |
| On Success Container | Success Container | 6.65:1 |
| On Warning Container | Warning Container | 6.15:1 |
| On Error Container | Error Container | 7.24:1 |
| Success | Surface Container Lowest | 5.67:1 |

All listed text combinations exceed the WCAG AA 4.5:1 threshold for normal text.

For clarity, the export resolves some key values as follows:

| Colour role | Hex value |
|---|---|
| Primary | `#8D4962` |
| Background | `#FFF8F8` |
| On Background | `#22191C` |
| On Surface Variant | `#4F4447` |
| Success | `#34734D` |
| Warning | `#956600` |
| Error | `#BA1A1A` |

## 5. Borders and Non-Text Contrast

Not every coloured element is text.

For example, `Outline Variant` resolves to `#D2C3C6`, producing approximately **1.70:1 contrast against the white Surface Container Lowest**.

This subtle border is currently used for panel and table separators. It is not suitable as the sole visual indicator of an interactive control boundary or essential state, where a stronger non-text contrast may be required.

Before reusing Outline Variant for form fields, controls, or critical indicators, I would check the applicable WCAG non-text contrast requirement, generally 3:1 for essential visual information.

Passing text contrast checks does not guarantee that the entire interface is accessible. Keyboard navigation, focus indicators, semantics, screen-reader support, and state communication require separate testing.

## 6. Design Decision

I chose semantic roles because StitchTrack will need to remain consistent across order management, garment agreements, payments, and client views.

Using a role such as `On Primary Container` is more reliable than choosing an individual dark wine hex value for every card. A future palette adjustment can be made centrally without requiring each component to be edited.

The deliberate regression experiment demonstrated the risk: when a semantic role was replaced with a raw hex value, that role stopped following changes to the source palette, leaving inconsistent colours in the interface.

**Source of truth:** `evidence/06-tokens-complete.json`  
**Generated implementation:** `assets/stitchtrack-tokens.css`  
**Example usage:** `preview/styles.css`

I changed the initial Material purple palette to StitchTrack's Tailored Wine direction using the custom Primary colour setting. The original brand input was #74344D, while the generated Primary/40 variable is #8D4962. I used that generated variable for the semantic Primary role. The before-and-after screenshots show the palette change, and 02a-primary-40-variable.png confirms the resulting tone. This documents the generated tone rather than claiming an exact manual pin of the source hex at Primary/40.