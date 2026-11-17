/**
 * Reading font stylesheets for exports that inline their fonts. Pictures
 * drawn from serialized markup cannot load fonts from the network, and an
 * exported page should open offline, so editors inline `@font-face` rules
 * with `data:` URLs. Stylesheets such as Google Fonts' are split by
 * `unicode-range`; these helpers find the blocks that cover the characters
 * a document uses. Pure.
 */

/** The `@font-face` blocks of a stylesheet. */
export function fontFaceBlocks(css: string): string[] {
  return css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
}

/** The `unicode-range` value of a `@font-face` block, if it has one. */
export function blockUnicodeRange(block: string): string | undefined {
  return /unicode-range\s*:\s*([^;}]+)/i.exec(block)?.[1];
}

/** A `unicode-range` as inclusive code point ranges (null: everything). */
export function parseUnicodeRange(value: string | undefined): [number, number][] | null {
  if (!value) return null;
  const ranges: [number, number][] = [];
  for (const part of value.split(',')) {
    const text = part.trim().replace(/^u\+/i, '');
    if (!text) continue;
    if (text.includes('?')) {
      ranges.push([parseInt(text.replace(/\?/g, '0'), 16), parseInt(text.replace(/\?/g, 'f'), 16)]);
    } else if (text.includes('-')) {
      const [from, to] = text.split('-');
      ranges.push([parseInt(from!, 16), parseInt(to!, 16)]);
    } else {
      const point = parseInt(text, 16);
      ranges.push([point, point]);
    }
  }
  return ranges.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}

/** True when any of the code points falls in the ranges (always, for null ranges). */
export function rangeCovers(ranges: [number, number][] | null, points: Iterable<number>): boolean {
  if (!ranges) return true;
  for (const point of points) for (const [from, to] of ranges) if (point >= from && point <= to) return true;
  return false;
}

/** Every `url(…)` in a CSS text: the whole match and the address. */
export function cssUrls(css: string): { match: string; url: string }[] {
  return Array.from(css.matchAll(/url\((['"]?)([^'")]+)\1\)/g), (match) => ({ match: match[0], url: match[2]! }));
}
