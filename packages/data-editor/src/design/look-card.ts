/** What the design-system card says and shows about a dashboard's look. Pure. */

import { isGenericFontFamily, type DashboardLook, type LookTheme, type LookTone } from '@open-artifact/data-core';

export const DESIGN_SYSTEM_HEADING = 'Design system';
export const CUSTOM_LOOK_LABEL = 'Custom look';
export const DEFAULT_LOOK_LABEL = 'Default look';
export const CHANGE_DESIGN_SYSTEM_TEXT = 'Change';
export const CHANGE_DESIGN_SYSTEM_LABEL = 'Change design system';
export const ADJUSTED_LOOK_LABEL = 'Adjusted';
/** The sample text on the card's stamp. */
export const LOOK_SAMPLE = 'Aa';

export const DESIGN_SYSTEM_REFERENCE_PATH = 'reference/design-system.md';
/** Sent to the agent when the person presses Change. */
export const DESIGN_SYSTEM_REQUEST = `Change the design system of this dashboard. Read ${DESIGN_SYSTEM_REFERENCE_PATH} first.`;
/** The selection sent with {@link DESIGN_SYSTEM_REQUEST}. */
export const DESIGN_SYSTEM_SELECTION = {
  label: CHANGE_DESIGN_SYSTEM_LABEL,
  chip: { about: 'system' },
  text: `From the dashboard’s Design page, to change its design system. See ${DESIGN_SYSTEM_REFERENCE_PATH}.`,
} as const;
/** How long Change stays busy when the agent does not start, ms. */
export const DESIGN_SYSTEM_ASK_MS = 8000;

/** The page's colors where the look sets none (the stamp and chips still show something). */
export const DEFAULT_TONES: Readonly<Record<LookTheme, { ground: string; text: string; charts: readonly string[] }>> = {
  light: { ground: '#ffffff', text: '#1f1f1f', charts: ['#2a78d6', '#e0763a', '#2b9f74', '#8a63d2'] },
  dark: { ground: '#1b1b1b', text: '#f2f2f2', charts: ['#5a9ef0', '#f0915a', '#4cc394', '#a888ec'] },
};

/** The card's name: the design system's, else "Custom look" for a look of its own, else "Default look". */
export function designCardName(system: string | null, own: boolean): string {
  return system ?? (own ? CUSTOM_LOOK_LABEL : DEFAULT_LOOK_LABEL);
}

/** The first named (not generic) font of a CSS font stack, unquoted. */
export function firstFontName(stack: string | undefined): string | undefined {
  return stack
    ?.split(',')
    .map((name) => name.replace(/["']/g, '').trim())
    .find((name) => name !== '' && !isGenericFontFamily(name));
}

/** The card's second line: "Adjusted", or the look's display font, else its text font. */
export function designCardDetail(look: DashboardLook | null, adjusted = false): string | undefined {
  if (adjusted) return ADJUSTED_LOOK_LABEL;
  return firstFontName(look?.fonts.display) ?? firstFontName(look?.fonts.text);
}

export type ToneSlot = 'ground' | 'text' | 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4';

function pick(tone: LookTone | undefined, slot: ToneSlot): string | undefined {
  if (tone === undefined) return undefined;
  if (slot === 'ground' || slot === 'text') return tone[slot];
  return tone.charts[Number(slot.slice(6)) - 1];
}

function fallback(theme: LookTheme, slot: ToneSlot): string {
  const tones = DEFAULT_TONES[theme];
  if (slot === 'ground' || slot === 'text') return tones[slot];
  return tones.charts[Number(slot.slice(6)) - 1] ?? tones.text;
}

/** The color a swatch shows for `slot` in `theme`: the look's, else the default's. */
export function swatchColor(look: DashboardLook | null, theme: LookTheme, slot: ToneSlot): string {
  return pick(look?.tones[theme], slot) ?? fallback(theme, slot);
}
