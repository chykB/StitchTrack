import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { convertTokens } from '../scripts/build-tokens.mjs';

const sourceUrl = new URL('../evidence/06-tokens-complete.json', import.meta.url);
const outputUrl = new URL('../assets/stitchtrack-tokens.css', import.meta.url);
const sourceBytes = await readFile(sourceUrl);
const source = JSON.parse(sourceBytes.toString('utf8'));
const { css, counts } = convertTokens(source);
const declarations = new Map([...css.matchAll(/^  (--[a-z0-9-]+): (.+);$/gm)]
  .map(([, name, value]) => [name, value]));
const normalize = value => value.replaceAll(' ', '-');
const groups = [
  ['stitchtrack primitives', 'primitive'],
  ['stitchtrack functional primitives', 'functional-primitive'],
  ['stitchtrack color roles', 'color'],
];

function cssName(exportPath) {
  const [root, ...parts] = exportPath.split('.');
  const group = groups.find(([key]) => key === root);
  assert.ok(group, `Reference must target a custom collection: ${exportPath}`);
  if (group[1] === 'color') assert.equal(parts.shift(), 'roles');
  return `--stitchtrack-${group[1]}-${parts.map(normalize).join('-')}`;
}

function resolveCss(name, visiting = new Set()) {
  assert.ok(!visiting.has(name), `Circular CSS reference: ${name}`);
  assert.ok(declarations.has(name), `Missing CSS variable: ${name}`);
  const value = declarations.get(name);
  const alias = value.match(/^var\((--[a-z0-9-]+)\)$/);
  return alias ? resolveCss(alias[1], new Set([...visiting, name])) : value;
}

test('counts every source category and emits 374 unique valid custom properties', () => {
  assert.deepEqual(counts, {
    primitives: 95, functionalPrimitives: 54, semanticColors: 57,
    typographyStyles: 15, typographyProperties: 165, shadows: 3, customProperties: 374,
  });
  assert.equal(declarations.size, 374);
  assert.equal([...css.matchAll(/^  --/gm)].length, 374);
  for (const [prefix, count] of [['primitive', 95], ['functional-primitive', 54],
    ['color', 57], ['type', 165], ['shadow', 3]]) {
    assert.equal([...declarations.keys()].filter(name =>
      name.startsWith(`--stitchtrack-${prefix}-`)).length, count);
  }
  assert.ok(css.startsWith('/* Generated from evidence/06-tokens-complete.json.'));
  assert.match(css, /\n:root \{\n/);
  assert.ok(css.endsWith('}\n'));
  assert.doesNotMatch(css, /\r|\{stitchtrack/);
});

test('all 149 primitives preserve exported colour bytes and custom collections win', () => {
  let checked = 0;
  for (const [root] of groups.slice(0, 2)) {
    for (const [palette, tones] of Object.entries(source[root])) {
      for (const [tone, token] of Object.entries(tones)) {
        const value = declarations.get(cssName(`${root}.${palette}.${tone}`));
        assert.equal(value, token.value);
        assert.match(value, /^#[0-9a-f]{8}$/);
        checked++;
      }
    }
  }
  assert.equal(checked, 149);
  assert.equal(declarations.get('--stitchtrack-primitive-primary-40'), '#8d4962ff');
  const customOnly = structuredClone(source);
  Object.defineProperty(customOnly, 'color', { get() { throw new Error('Legacy styles read'); } });
  assert.equal(convertTokens(customOnly).css, css);
});

test('all 57 semantic roles retain their exact references and resolve to exported primitives', () => {
  let checked = 0;
  for (const [role, token] of Object.entries(source['stitchtrack color roles'].roles)) {
    const reference = token.value.match(/^\{([^{}]+)\}$/);
    assert.ok(reference, `Expected alias for ${role}`);
    const name = `--stitchtrack-color-${normalize(role)}`;
    const target = cssName(reference[1]);
    assert.equal(declarations.get(name), `var(${target})`);
    const exported = reference[1].split('.').reduce((node, key) => node[key], source);
    assert.equal(resolveCss(name), exported.value);
    checked++;
  }
  assert.equal(checked, 57);
  assert.equal(declarations.get('--stitchtrack-color-success'),
    'var(--stitchtrack-functional-primitive-success-40)');
  assert.equal(declarations.get('--stitchtrack-color-surface-container-high'),
    'var(--stitchtrack-primitive-surface-scale-container-high)');
});

test('alias chains remain references rather than being flattened', () => {
  const changed = structuredClone(source);
  changed['stitchtrack color roles'].roles.primary.value =
    '{stitchtrack color roles.roles.surface tint}';
  assert.match(convertTokens(changed).css,
    /--stitchtrack-color-primary: var\(--stitchtrack-color-surface-tint\);/);
});

test('missing, legacy and circular reference targets fail clearly', () => {
  for (const target of ['stitchtrack primitives.primary.999', 'color.stitchtrack.white']) {
    const changed = structuredClone(source);
    changed['stitchtrack color roles'].roles.primary.value = `{${target}}`;
    assert.throws(() => convertTokens(changed), /Unresolved colour reference/);
  }
  const circular = structuredClone(source);
  circular['stitchtrack color roles'].roles.primary.value =
    '{stitchtrack color roles.roles.surface tint}';
  circular['stitchtrack color roles'].roles['surface tint'].value =
    '{stitchtrack color roles.roles.primary}';
  assert.throws(() => convertTokens(circular), /Circular colour reference/);
});

test('normalization collisions are rejected rather than overwriting variables', () => {
  const changed = structuredClone(source);
  changed['stitchtrack color roles'].roles['surface-tint'] =
    structuredClone(changed['stitchtrack color roles'].roles['surface tint']);
  assert.throws(() => convertTokens(changed), /Duplicate CSS custom property/);
});

test('all 15 typography styles retain all 11 exported fields with CSS units', () => {
  const dimensions = {
    fontSize: 'font-size', letterSpacing: 'letter-spacing', lineHeight: 'line-height',
    paragraphIndent: 'text-indent', paragraphSpacing: 'paragraph-spacing',
  };
  const strings = {
    textDecoration: 'text-decoration', fontStyle: 'font-style',
    fontStretch: 'font-stretch', textCase: 'text-transform',
  };
  let styles = 0;
  for (const [group, sizes] of Object.entries(source.typography)) {
    for (const [size, fields] of Object.entries(sizes)) {
      const prefix = `--stitchtrack-type-${group}-${size}`;
      // The expanded and composite representations must describe the same style.
      assert.deepEqual(Object.fromEntries(Object.entries(fields).map(([key, t]) =>
        [key, t.value])), source.font[group][size].value);
      assert.equal(fields.fontFamily.value, 'DM Sans');
      assert.equal(declarations.get(`${prefix}-font-family`), '"DM Sans"');
      assert.equal(declarations.get(`${prefix}-font-weight`), String(fields.fontWeight.value));
      for (const [field, suffix] of Object.entries(dimensions)) {
        assert.equal(declarations.get(`${prefix}-${suffix}`), `${fields[field].value}px`);
      }
      for (const [field, suffix] of Object.entries(strings)) {
        assert.equal(declarations.get(`${prefix}-${suffix}`), fields[field].value);
      }
      styles++;
    }
  }
  assert.equal(styles, 15);
  assert.equal(declarations.get('--stitchtrack-type-display-large-font-size'), '52px');
  assert.equal(declarations.get('--stitchtrack-type-display-large-line-height'), '72.8px');
  assert.equal(declarations.get('--stitchtrack-type-display-large-letter-spacing'), '-0.52px');
  assert.equal(declarations.get('--stitchtrack-type-display-medium-letter-spacing'), '-0.22px');
  assert.equal(declarations.get('--stitchtrack-type-display-small-letter-spacing'), '-0.18px');
  assert.equal(declarations.get('--stitchtrack-type-body-medium-line-height'), '24px');
});

test('all three shadows preserve geometry, negative spread, colour and exact alpha bytes', () => {
  const expected = {
    soft: '0px 2px 8px 0px #8d49621a',
    medium: '0px 6px 16px -2px #8d496229',
    hard: '0px 12px 28px -4px #8d496238',
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(declarations.get(`--stitchtrack-shadow-${name}`), value);
    const shadow = source.effect.shadow[name].value;
    assert.equal(value, [shadow.offsetX, shadow.offsetY, shadow.radius, shadow.spread]
      .map(value => `${value}px`).join(' ') + ` ${shadow.color}`);
  }
});

test('invalid values and missing custom collections fail instead of generating invalid CSS', () => {
  const cases = [
    [data => { data['stitchtrack primitives'].primary['40'].value = '#zzzzzzff'; },
      /Expected exported #RRGGBBAA/],
    [data => { data.font.display.large.value.lineHeight = NaN; }, /Expected finite numeric/],
    [data => { data.effect.shadow.soft.value.radius = -1; }, /blur radius/],
    [data => { delete data['stitchtrack functional primitives']; }, /Missing or invalid token group/],
  ];
  for (const [change, error] of cases) {
    const changed = structuredClone(source);
    change(changed);
    assert.throws(() => convertTokens(changed), error);
  }
});

test('conversion is repeatable and does not mutate its input', () => {
  const before = JSON.stringify(source);
  assert.deepEqual(convertTokens(source), convertTokens(source));
  assert.equal(JSON.stringify(source), before);
});

test('generated artifact matches conversion and two CLI runs from another cwd are byte-identical', async () => {
  assert.equal(await readFile(outputUrl, 'utf8'), css);
  const script = fileURLToPath(new URL('../scripts/build-tokens.mjs', import.meta.url));
  const options = { cwd: dirname(script), encoding: 'utf8' };
  const firstLog = execFileSync(process.execPath, [script], options);
  const first = await readFile(outputUrl);
  const secondLog = execFileSync(process.execPath, [script], options);
  const second = await readFile(outputUrl);
  assert.equal(firstLog, secondLog);
  assert.deepEqual(first, second);
  assert.equal(second.toString('utf8'), css);
  assert.deepEqual(await readFile(sourceUrl), sourceBytes);
});

