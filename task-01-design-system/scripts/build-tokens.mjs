import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceUrl = new URL('../evidence/06-tokens-complete.json', import.meta.url);
const outputUrl = new URL('../assets/stitchtrack-tokens.css', import.meta.url);
const extensionKey = 'org.lukasoppermann.figmaDesignTokens';
const collections = [
  ['stitchtrack primitives', 'StitchTrack Primitives', 'primitive'],
  ['stitchtrack functional primitives', 'StitchTrack Functional Primitives', 'functional-primitive'],
  ['stitchtrack color roles', 'StitchTrack Color Roles', 'color'],
];
const typographyFields = {
  fontSize: ['font-size', 'px'],
  textDecoration: ['text-decoration', 'keyword'],
  fontFamily: ['font-family', 'family'],
  fontWeight: ['font-weight', 'number'],
  fontStyle: ['font-style', 'keyword'],
  fontStretch: ['font-stretch', 'keyword'],
  letterSpacing: ['letter-spacing', 'px'],
  lineHeight: ['line-height', 'px'],
  paragraphIndent: ['text-indent', 'px'],
  paragraphSpacing: ['paragraph-spacing', 'px'],
  textCase: ['text-transform', 'keyword'],
};

function kebab(value) {
  const result = value.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!result) throw new Error(`Invalid token name: ${value}`);
  return result;
}

function entries(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length === 0) {
    throw new Error(`Missing or invalid token group: ${label}`);
  }
  return Object.entries(value);
}

function leaves(group, path = []) {
  return entries(group, path.join('.')).flatMap(([key, value]) => {
    const next = [...path, key];
    return value && typeof value === 'object' && 'type' in value
      ? [{ path: next, token: value }]
      : leaves(value, next);
  });
}

function number(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected finite numeric value, got ${value}`);
  }
  return String(value);
}

function color(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{8}$/i.test(value)) {
    throw new Error(`Expected exported #RRGGBBAA colour, got ${value}`);
  }
  // CSS supports #RRGGBBAA directly, preserving all eight alpha bits.
  return value.toLowerCase();
}

function typographyValue(value, kind) {
  if (kind === 'px') return `${number(value)}px`;
  if (kind === 'number') return number(value);
  if (typeof value !== 'string' || !value) throw new Error('Expected typography string');
  if (kind === 'family') return JSON.stringify(value);
  if (!/^[a-z-]+$/.test(value)) throw new Error(`Unsupported typography keyword: ${value}`);
  return value;
}

/** Convert the complete export without mutating it or reading any other export. */
export function convertTokens(data) {
  const sections = [];
  const names = new Set();
  const counts = { primitives: 0, functionalPrimitives: 0, semanticColors: 0,
    typographyStyles: 0, typographyProperties: 0, shadows: 0, customProperties: 0 };
  function add(section, name, value) {
    if (names.has(name)) throw new Error(`Duplicate CSS custom property: ${name}`);
    names.add(name);
    section.push(`  ${name}: ${value};`);
    counts.customProperties++;
  }

  // Explicit allowlist: data.color contains older Material-generated styles.
  const colors = new Map();
  for (const [key, collection, prefix] of collections) {
    const section = [];
    sections.push([collection, section]);
    for (const { path, token } of leaves(data[key], [key])) {
      const metadata = token.extensions?.[extensionKey];
      if (token.type !== 'color' || metadata?.collection !== collection
          || metadata?.exportKey !== 'variables') {
        throw new Error(`Expected custom colour variable at ${path.join('.')}`);
      }
      const localPath = prefix === 'color' ? path.slice(2) : path.slice(1);
      if (prefix === 'color' && path[1] !== 'roles') throw new Error('Expected roles group');
      const name = `--stitchtrack-${prefix}-${localPath.map(kebab).join('-')}`;
      colors.set(path.join('.'), { name, value: token.value, section });
      counts[prefix === 'color' ? 'semanticColors'
        : prefix === 'primitive' ? 'primitives' : 'functionalPrimitives']++;
    }
  }

  const resolved = new Set();
  function validateReference(key, visiting = new Set()) {
    if (visiting.has(key)) throw new Error(`Circular colour reference: ${key}`);
    const token = colors.get(key);
    if (!token) throw new Error(`Unresolved colour reference: ${key}`);
    if (resolved.has(key)) return;
    const reference = typeof token.value === 'string' && token.value.match(/^\{([^{}]+)\}$/);
    if (reference) validateReference(reference[1], new Set([...visiting, key]));
    else color(token.value);
    resolved.add(key);
  }
  for (const [key, token] of colors) {
    validateReference(key);
    const reference = token.value.match(/^\{([^{}]+)\}$/);
    add(token.section, token.name, reference
      ? `var(${colors.get(reference[1]).name})` : color(token.value));
  }

  // `typography` mirrors these 15 composite font styles; do not emit it twice.
  const typeSection = [];
  sections.push(['Typography (exported dimensions in px)', typeSection]);
  for (const { path, token } of leaves(data.font)) {
    if (token.type !== 'custom-fontStyle') throw new Error(`Unsupported font token: ${path}`);
    const values = entries(token.value, path.join('.'));
    if (values.length !== Object.keys(typographyFields).length) {
      throw new Error(`Unexpected typography fields: ${path.join('.')}`);
    }
    for (const [field, [suffix, kind]] of Object.entries(typographyFields)) {
      const name = `--stitchtrack-type-${path.map(kebab).join('-')}-${suffix}`;
      add(typeSection, name, typographyValue(token.value[field], kind));
      counts.typographyProperties++;
    }
    counts.typographyStyles++;
  }

  const shadowSection = [];
  sections.push(['Shadows (exported #RRGGBBAA preserves opacity)', shadowSection]);
  for (const { path, token } of leaves(data.effect.shadow)) {
    if (token.type !== 'custom-shadow' || token.value?.shadowType !== 'dropShadow') {
      throw new Error(`Unsupported shadow: ${path.join('.')}`);
    }
    const { offsetX, offsetY, radius, spread, color: shadowColor } = token.value;
    if (radius < 0) throw new Error('Shadow blur radius cannot be negative');
    const dimensions = [offsetX, offsetY, radius, spread].map(value => `${number(value)}px`);
    add(shadowSection, `--stitchtrack-shadow-${path.map(kebab).join('-')}`,
      `${dimensions.join(' ')} ${color(shadowColor)}`);
    counts.shadows++;
  }

  const css = [
    '/* Generated from evidence/06-tokens-complete.json. Do not edit directly.',
    ' * Regenerate: node task-01-design-system/scripts/build-tokens.mjs',
    ' */',
    ':root {',
    sections.map(([label, lines]) => `  /* ${label} */\n${lines.join('\n')}`).join('\n\n'),
    '}',
    '',
  ].join('\n');
  return { css, counts };
}

export async function buildTokens() {
  const data = JSON.parse(await readFile(sourceUrl, 'utf8'));
  const result = convertTokens(data);
  await mkdir(new URL('../assets/', import.meta.url), { recursive: true });
  await writeFile(outputUrl, result.css, 'utf8');
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { counts } = await buildTokens();
    console.log('Generated assets/stitchtrack-tokens.css');
    console.log(JSON.stringify(counts, null, 2));
  } catch (error) {
    console.error(`Token build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

