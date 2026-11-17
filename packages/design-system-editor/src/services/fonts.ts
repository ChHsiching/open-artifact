/**
 * Hosted (Google) families of the system: a family no font file provides
 * and that is not a system font is looked up in the Google Fonts catalog;
 * found ones get a stylesheet, linked into this page (for the samples) and
 * into every component preview.
 */

import type { NormalizedTokens } from '@open-artifact/design-system-core';
import { COMMON_SYSTEM_FONTS, googleFontStylesheetUrl, lookupGoogleFont } from '@open-artifact/ui';
import { create } from 'zustand';
import { hostedCandidates } from '../lib/type-edit.ts';

interface HostedFontsState {
  /** Family → stylesheet URL. */
  urls: Record<string, string>;
}

export const useHostedFonts = create<HostedFontsState>()(() => ({ urls: {} }));

/** Families already looked up (found or not). */
const looked = new Set<string>();

/** Every family stack the tokens use. */
function stacks(tokens: NormalizedTokens): string[] {
  const out = Object.values(tokens.families);
  for (const group of tokens.groups) for (const style of group.styles) if (style.family && !style.family.startsWith('var(')) out.push(style.family);
  return out;
}

/** Looks up new hosted families and links their stylesheets. */
export function syncHostedFonts(tokens: NormalizedTokens): void {
  const families = hostedCandidates(
    stacks(tokens),
    tokens.fonts.map((font) => font.family),
    COMMON_SYSTEM_FONTS,
  ).filter((family) => !looked.has(family));
  for (const family of families.slice(0, 12)) {
    looked.add(family);
    lookupGoogleFont(family).then(
      (font) => {
        if (!font) return;
        const url = googleFontStylesheetUrl(font.family, { variable: true, italic: true, weights: [300, 400, 500, 600, 700, 800] }, font);
        useHostedFonts.setState((state) => ({ urls: { ...state.urls, [family]: url } }));
        linkStylesheet(url);
      },
      () => looked.delete(family),
    );
  }
}

/** Links a stylesheet into this page once. */
export function linkStylesheet(url: string): void {
  if (typeof document === 'undefined' || document.querySelector(`link[data-hosted-font="${CSS.escape(url)}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.dataset.hostedFont = url;
  document.head.append(link);
}
