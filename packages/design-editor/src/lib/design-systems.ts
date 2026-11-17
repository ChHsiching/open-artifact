/**
 * Installed design systems, as the editor offers them (pure: no stores, no
 * session). A canvas keeps a copy of each system it uses under
 * `project/ds/<folder>/` and lists it in `canvas.json` (`designSystems`);
 * see artifact-types/design/reference/design-systems.md. Both must be there
 * for the system to be offered.
 *
 * From each copy's `tokens.json` the editor takes:
 *
 * - its colors, as swatches. A swatch writes `var(--<token>, <literal>)`:
 *   the artboard follows the system when it links the system's
 *   `tokens.css`, and still renders the literal when it does not;
 * - its type styles, as text styles: plain declarations (size, line height,
 *   weight, letter spacing, family), never a token reference
 *   (`styleDeclarations`, `@open-artifact/design-system-core`);
 * - its font families, spacing and radius scales, for the Theme tab.
 */

import { styleDeclarations, styleTag, type NormalizedStyle, type NormalizedTokens } from '@open-artifact/design-system-core';
import { DS_FOLDER_PATTERN, type DesignSystemRecord } from '@open-artifact/design-core';

/** Where installed systems live, as an artifact path (`@open-artifact/editor-kit`). */
export { DS_DIR } from '@open-artifact/editor-kit';

/** Most systems a canvas offers (design-systems.md: four at most). */
export const MAX_SYSTEMS = 4;

/** A color token, resolved to a literal. */
export interface SystemColor {
  /** Token name, without `--`. */
  name: string;
  /** The literal of the first theme. */
  value: string;
  usage?: string;
}

/** A type style, as declarations in px. */
export interface SystemTextStyle {
  /** Menu key: `ds:<namespace>:<n>`. */
  id: string;
  name: string;
  group: string;
  /** The system's title. */
  system: string;
  /** The heading level the style reads as (`p` for body styles). */
  tag: 'h1' | 'h2' | 'h3' | 'p';
  declarations: Record<string, string>;
  sample?: string;
}

/** A plain scale entry (spacing, radius). */
export interface SystemScaleEntry {
  name: string;
  value: string;
}

/** One installed system, as read. */
export interface InstalledSystem {
  namespace: string;
  title: string;
  /** Where it was copied from (an artifact address), as recorded. */
  artifact: string;
  version: string | null;
  copiedAt: string;
  colors: SystemColor[];
  styles: SystemTextStyle[];
  /** Font stacks by family key. */
  families: { key: string; stack: string }[];
  spacing: SystemScaleEntry[];
  radius: SystemScaleEntry[];
}

/** Prefix of design-system text style ids. */
export const SYSTEM_STYLE_PREFIX = 'ds:';

/** A literal CSS color (no `var()`), or null. */
export function literalColor(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text || /var\(/i.test(text) || text.length > 120) return null;
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return text.toLowerCase();
  if (/^(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^()]*\)$/i.test(text)) return text;
  if (/^[a-z]{3,20}$/i.test(text) && !/^(inherit|initial|unset|revert|none|currentcolor|auto)$/i.test(text)) return text.toLowerCase();
  return null;
}

/** Converts one type style; null when its size is not a length. */
function convertStyle(tokens: NormalizedTokens, style: NormalizedStyle, id: string, system: string): SystemTextStyle | null {
  const declarations = styleDeclarations(tokens, style);
  if (!declarations) return null;
  return { id, name: style.name, group: style.group, system, tag: styleTag(style), declarations, ...(style.sample ? { sample: style.sample } : {}) };
}

/** Reads a normalized tokens file into what the editor offers. */
export function systemFromTokens(record: Pick<DesignSystemRecord, 'namespace' | 'title'> & Partial<DesignSystemRecord>, tokens: NormalizedTokens): InstalledSystem {
  const theme = tokens.themes[0]?.id;
  const colors: SystemColor[] = [];
  const seen = new Set<string>();
  for (const token of tokens.colors) {
    const raw = (theme ? token.resolved[theme] : undefined) ?? Object.values(token.resolved)[0];
    const value = literalColor(raw);
    if (!value || seen.has(token.name)) continue;
    seen.add(token.name);
    colors.push({ name: token.name, value, ...(token.usage ? { usage: token.usage } : {}) });
  }
  const title = record.title || tokens.name || record.namespace;
  const styles: SystemTextStyle[] = [];
  for (const group of tokens.groups) {
    for (const style of group.styles) {
      const converted = convertStyle(tokens, style, `${SYSTEM_STYLE_PREFIX}${record.namespace}:${styles.length}`, title);
      if (converted) styles.push(converted);
    }
  }
  return {
    namespace: record.namespace,
    title,
    artifact: typeof record.artifact === 'string' ? record.artifact : '',
    version: typeof record.version === 'string' ? record.version : null,
    copiedAt: typeof record.copiedAt === 'string' ? record.copiedAt : '',
    colors,
    styles,
    families: Object.entries(tokens.families)
      .filter(([, stack]) => !stack.includes('var('))
      .map(([key, stack]) => ({ key, stack })),
    spacing: tokens.spacing.map(({ name, value }) => ({ name, value })),
    radius: tokens.radius.map(({ name, value }) => ({ name, value })),
  };
}

/** The installed records the editor reads: a valid folder, once each, four at most. */
export function installedRecords(records: readonly DesignSystemRecord[] | undefined): DesignSystemRecord[] {
  const out: DesignSystemRecord[] = [];
  const seen = new Set<string>();
  for (const record of records ?? []) {
    if (!record || typeof record.namespace !== 'string' || !DS_FOLDER_PATTERN.test(record.namespace) || seen.has(record.namespace)) continue;
    seen.add(record.namespace);
    out.push(record);
    if (out.length >= MAX_SYSTEMS) break;
  }
  return out;
}

/** What a swatch writes: the token with its literal as fallback. */
export function swatchValue(color: SystemColor): string {
  return `var(--${color.name}, ${color.value})`;
}

/** The token a written color names (`var(--x)` or `var(--x, …)`), or null. */
export function tokenOfValue(value: string | undefined): string | null {
  const match = /^\s*var\(\s*--([A-Za-z0-9_-]+)\s*(?:,[^)]*)?\)\s*$/.exec(value ?? '');
  return match ? match[1]! : null;
}

/** Declarations compared when telling which style a text element has. */
const MATCHED = ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform'] as const;

/** The installed style whose declarations an element's inline style carries, if any. */
export function matchSystemStyle(systems: readonly InstalledSystem[], inline: Readonly<Record<string, string>>): SystemTextStyle | undefined {
  for (const system of systems) {
    for (const candidate of system.styles) {
      if (MATCHED.every((key) => (inline[key] ?? undefined) === candidate.declarations[key])) return candidate;
    }
  }
  return undefined;
}

/** The style patch that applies a system text style (clearing what it does not set). */
export function systemStylePatch(style: SystemTextStyle): Record<string, string | null> {
  const patch: Record<string, string | null> = { 'line-height': null, 'letter-spacing': null, 'font-weight': null, 'font-style': null, 'text-transform': null };
  return { ...patch, ...style.declarations };
}

/** Finds a style by its menu id. */
export function styleById(systems: readonly InstalledSystem[], id: string): SystemTextStyle | undefined {
  for (const system of systems) {
    const found = system.styles.find((style) => style.id === id);
    if (found) return found;
  }
  return undefined;
}
