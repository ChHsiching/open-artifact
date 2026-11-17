/**
 * Pure edits of `tokens.json`'s `type` family: type sets (groups), styles,
 * family stacks and font files, plus reading a font file's family, weight
 * and style from its name and telling hosted (Google) families from files
 * and system fonts.
 */

import type { RawTokens } from '@open-artifact/design-system-core';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `type` node, with its three parts present. */
function typeNode(raw: RawTokens): { fonts: unknown[]; families: Json; groups: unknown[]; rest: Json } {
  const type = isObject(raw.type) ? raw.type : {};
  return {
    fonts: Array.isArray(type.fonts) ? type.fonts : [],
    families: isObject(type.families) ? type.families : {},
    groups: Array.isArray(type.groups) ? type.groups : [],
    rest: type,
  };
}

function withType(raw: RawTokens, patch: Json): RawTokens {
  const node = typeNode(raw);
  return { ...raw, type: { ...node.rest, fonts: node.fonts, families: node.families, groups: node.groups, ...patch } };
}

/** Every style name in use. */
export function styleNames(raw: RawTokens): Set<string> {
  const names = new Set<string>();
  for (const group of typeNode(raw).groups) {
    if (!isObject(group) || !Array.isArray(group.styles)) continue;
    for (const style of group.styles) if (isObject(style) && typeof style.name === 'string') names.add(style.name);
  }
  return names;
}

/** A clean style or key name from what the viewer typed. */
export function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^[^a-z0-9]+|-+$/g, '')
    .slice(0, 48);
}

/** A style name not yet used, built from `stem`. */
export function freeStyleName(raw: RawTokens, stem: string): string {
  const taken = styleNames(raw);
  const base = slug(stem) || 'style';
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    if (!taken.has(name)) return name;
  }
}

/** Adds a type set (group). A taken name gets a number. */
export function addTypeGroup(raw: RawTokens, name: string, family?: string): { raw: RawTokens; name: string } {
  const node = typeNode(raw);
  const taken = new Set(node.groups.filter(isObject).map((group) => group.name));
  const base = name.trim() || 'Styles';
  let free = base;
  for (let n = 2; taken.has(free); n++) free = `${base} ${n}`;
  const group: Json = { name: free, ...(family ? { family } : {}), styles: [] };
  return { raw: withType(raw, { groups: [...node.groups, group] }), name: free };
}

/** Renames a type set or sets its family (`null` removes the family). */
export function updateTypeGroup(raw: RawTokens, name: string, fields: { name?: string; family?: string | null }): RawTokens {
  const node = typeNode(raw);
  const groups = node.groups.map((group) => {
    if (!isObject(group) || group.name !== name) return group;
    const next: Json = { ...group };
    if (fields.name !== undefined && fields.name.trim()) next.name = fields.name.trim();
    if (fields.family === null) delete next.family;
    else if (fields.family !== undefined) next.family = fields.family;
    return next;
  });
  return withType(raw, { groups });
}

/** Removes a type set and its styles. */
export function removeTypeGroup(raw: RawTokens, name: string): RawTokens {
  return withType(raw, { groups: typeNode(raw).groups.filter((group) => !(isObject(group) && group.name === name)) });
}

/**
 * Adds a style to a type set (made when missing), after the set's last
 * style, copying that style's values so the new one starts close.
 */
export function addTypeStyle(raw: RawTokens, groupName: string, stem = 'text'): { raw: RawTokens; name: string } {
  const name = freeStyleName(raw, stem);
  let next = raw;
  if (!typeNode(next).groups.some((group) => isObject(group) && group.name === groupName)) next = addTypeGroup(next, groupName).raw;
  const groups = typeNode(next).groups.map((group) => {
    if (!isObject(group) || group.name !== groupName) return group;
    const styles = Array.isArray(group.styles) ? group.styles : [];
    const last = [...styles].reverse().find(isObject);
    const style: Json = { name, fontSize: last?.fontSize ?? 16 };
    for (const key of ['lineHeight', 'fontWeight', 'letterSpacing', 'family'] as const) if (last && last[key] !== undefined) style[key] = last[key];
    return { ...group, styles: [...styles, style] };
  });
  return { raw: withType(next, { groups }), name };
}

/** Removes a style. */
export function removeTypeStyle(raw: RawTokens, name: string): RawTokens {
  const groups = typeNode(raw).groups.map((group) =>
    isObject(group) && Array.isArray(group.styles) ? { ...group, styles: group.styles.filter((style) => !(isObject(style) && style.name === name)) } : group,
  );
  return withType(raw, { groups });
}

/** Sets a family stack (`null` removes it). */
export function setFamilyStack(raw: RawTokens, key: string, stack: string | null): RawTokens {
  const families = { ...typeNode(raw).families };
  if (stack === null) delete families[key];
  else families[key] = stack;
  return withType(raw, { families });
}

/** A family key not yet used, built from a family name. */
export function freeFamilyKey(raw: RawTokens, name: string): string {
  const families = typeNode(raw).families;
  const base = slug(name) || 'font';
  for (let n = 1; ; n++) {
    const key = n === 1 ? base : `${base}-${n}`;
    if (!(key in families)) return key;
  }
}

/** A font file entry of `type.fonts`. */
export interface FontFileEntry {
  family: string;
  file: string;
  weight: string;
  style: 'normal' | 'italic';
}

/** Adds font files (one per file, weight and style; existing ones are kept). */
export function addFontFiles(raw: RawTokens, entries: readonly FontFileEntry[]): RawTokens {
  const node = typeNode(raw);
  const key = (font: { file?: unknown; weight?: unknown; style?: unknown }): string => `${String(font.file)}|${String(font.weight ?? '400')}|${String(font.style ?? 'normal')}`;
  const seen = new Set(node.fonts.filter(isObject).map(key));
  const added = entries.filter((entry) => !seen.has(key(entry)));
  return withType(raw, { fonts: [...node.fonts, ...added] });
}

/** Removes the font file entries of a path. */
export function removeFontFile(raw: RawTokens, file: string): RawTokens {
  return withType(raw, { fonts: typeNode(raw).fonts.filter((font) => !(isObject(font) && font.file === file)) });
}

const WEIGHTS: [RegExp, number][] = [
  [/(hairline|thin)/, 100],
  [/(extra|ultra)-?light/, 200],
  [/light/, 300],
  [/(regular|normal|book|roman)/, 400],
  [/medium/, 500],
  [/(semi|demi)-?bold/, 600],
  [/(extra|ultra)-?bold/, 800],
  [/(black|heavy)/, 900],
  [/bold/, 700],
];

/**
 * Reads a font's family, weight and style from its file name:
 * `Inter-SemiBoldItalic.woff2` → Inter, 600, italic; a variable file
 * (`Inter[wght].ttf`, `InterVariable.woff2`) gets the range `100 900`.
 */
export function guessFontFace(fileName: string): { family: string; weight: string; style: 'normal' | 'italic' } {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.(woff2?|ttf|otf)$/i, '');
  const variable = /\[[^\]]*wght[^\]]*\]|variable|-vf\b|_vf\b/i.test(base);
  const italic = /italic|oblique|\bit\b/i.test(base.replace(/[-_]/g, ' '));
  // The family is what comes before the first separator that starts the style part.
  const [head, ...tail] = base.replace(/\[[^\]]*\]/g, '').split(/[-_ ]+/);
  let family = head ?? base;
  let style = tail.join('-').toLowerCase();
  if (!tail.length) {
    // `InterBold`, `InterVariable`: split a trailing style word off the camel case.
    const match = /^(.+?)(Variable|VF|Thin|Hairline|ExtraLight|UltraLight|Light|Regular|Book|Medium|SemiBold|DemiBold|ExtraBold|UltraBold|Bold|Black|Heavy|Italic)+$/.exec(base.replace(/\[[^\]]*\]/g, ''));
    if (match) {
      family = match[1]!;
      style = base.slice(match[1]!.length).toLowerCase();
    }
  }
  family = family.replace(/(Variable|VF)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'Font';
  let weight = 400;
  for (const [pattern, value] of WEIGHTS) {
    if (pattern.test(style)) {
      weight = value;
      break;
    }
  }
  return { family, weight: variable ? '100 900' : String(weight), style: italic ? 'italic' : 'normal' };
}

/** The first family of a CSS stack, unquoted. */
export function firstFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim() ?? '';
  return first.replace(/^(["'])(.*)\1$/, '$2').trim();
}

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', 'inherit', 'initial']);

/**
 * Families that may be hosted (Google): the first family of each stack
 * that no font file provides and that is neither generic nor in
 * `systemFonts`.
 */
export function hostedCandidates(stacks: readonly string[], fileFamilies: readonly string[], systemFonts: readonly string[]): string[] {
  const files = new Set(fileFamilies.map((family) => family.toLowerCase()));
  const system = new Set(systemFonts.map((family) => family.toLowerCase()));
  const out = new Set<string>();
  for (const stack of stacks) {
    const family = firstFamily(stack);
    const key = family.toLowerCase();
    if (!family || family.startsWith('var(') || files.has(key) || system.has(key) || GENERIC.has(key) || key.startsWith('-apple') || key.startsWith('blinkmac')) continue;
    out.add(family);
  }
  return [...out].sort();
}

/**
 * The `families` key for a picked family: the key whose stack starts with
 * it, else a new key holding `css` (the picker's stack with a fallback).
 */
export function ensureFamily(raw: RawTokens, family: string, css: string): { raw: RawTokens; key: string } {
  const wanted = family.trim().toLowerCase();
  for (const [key, stack] of Object.entries(typeNode(raw).families)) {
    if (typeof stack === 'string' && firstFamily(stack).toLowerCase() === wanted) return { raw, key };
  }
  const key = freeFamilyKey(raw, family);
  return { raw: setFamilyStack(raw, key, css), key };
}
