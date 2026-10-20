# StitchTrack design tokens

The converter reads only `evidence/06-tokens-complete.json`. The incomplete
assessment export is never read or modified. Node.js 20+ is sufficient; no
packages need to be installed.

From the repository root:

```sh
node task-01-design-system/scripts/build-tokens.mjs
node --test task-01-design-system/tests/build-tokens.test.mjs
```

The script resolves its paths relative to its own file, so it also works when
invoked from another working directory. It writes UTF-8 CSS with LF line endings,
a final newline, and no timestamps. Regenerating produces identical bytes.

## Sources and counts

| Source | Exported tokens / styles | CSS custom properties |
| --- | ---: | ---: |
| StitchTrack Primitives | 95 | 95 |
| StitchTrack Functional Primitives | 54 | 54 |
| StitchTrack Color Roles | 57 | 57 |
| Font styles | 15 | 165 |
| Shadows | 3 | 3 |
| Total | 224 | 374 |

The custom colour-variable collections are authoritative. The older
Material-generated `color.stitchtrack` styles are excluded. For example, custom
primary tone 40 is `#8d4962ff`. Collection metadata is checked, and missing or
circular references and normalized-name collisions cause the build to fail.

The export repeats the same 15 styles under `font` (composites) and `typography`
(expanded fields). The converter uses `font` once; tests verify the two
representations agree.

## Naming and usage

All declarations are scoped to `:root` in `assets/stitchtrack-tokens.css`.

| Category | Example |
| --- | --- |
| Primitive | `--stitchtrack-primitive-primary-40` |
| Functional primitive | `--stitchtrack-functional-primitive-success-40` |
| Semantic colour | `--stitchtrack-color-primary` |
| Typography field | `--stitchtrack-type-display-large-font-size` |
| Shadow | `--stitchtrack-shadow-soft` |

Spaces in exported names become hyphens. Semantic aliases remain CSS references,
for example:

```css
--stitchtrack-color-primary: var(--stitchtrack-primitive-primary-40);
```

Import the stylesheet and consume variables in your own styles:

```css
@import './assets/stitchtrack-tokens.css';

.example {
  color: var(--stitchtrack-color-primary);
  font-family: var(--stitchtrack-type-body-medium-font-family);
  font-size: var(--stitchtrack-type-body-medium-font-size);
  font-weight: var(--stitchtrack-type-body-medium-font-weight);
  line-height: var(--stitchtrack-type-body-medium-line-height);
  letter-spacing: var(--stitchtrack-type-body-medium-letter-spacing);
  box-shadow: var(--stitchtrack-shadow-soft);
}
```

## Conversion details

- Each typography style emits all 11 fields. DM Sans is quoted, weights stay
  numeric, and exported dimensions become pixels, including line heights,
  negative letter spacing, and zero values. The font itself must be loaded by
  the consuming project.
- `paragraphIndent` becomes `text-indent`, and `textCase` becomes
  `text-transform`. `paragraphSpacing` remains a reusable
  `paragraph-spacing` custom property: CSS has no direct paragraph-spacing
  property, so consumers can use it as a paragraph margin.
- Colours retain CSS-supported `#RRGGBBAA` notation. Shadow alpha bytes
  `1a`, `29`, and `38` are preserved exactly rather than rounded to opacity
  percentages. Shadow geometry becomes `offset-x offset-y blur spread colour`,
  including negative spread values.
- No source values require correction. The tests cover counts, every primitive
  and semantic reference, typography values, shadows, invalid references and
  values, and repeatable output. Neither JSON export is modified.

