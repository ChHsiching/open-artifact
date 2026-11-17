/**
 * Whether a font family renders on this computer: installed, or loaded by
 * the page. A family that does not render shows in a substitute face, so the
 * font picker leaves it out of "All fonts".
 */

/** CSS generic families and keywords, which always render. */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong']);

/** Family names worth measuring: letters, digits, spaces, dashes. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

/** Text whose width differs between most faces. */
const SAMPLE = 'mmmmmmmmmmlli';

/**
 * True when `name` measures differently from both the monospace and the serif
 * fallback: a missing family falls back to them and measures the same.
 * `measure(font)` returns the width of the sample in a CSS `font` shorthand.
 */
export function fontRenders(name: string, measure: (font: string) => number): boolean {
  const family = name.trim();
  if (GENERIC.has(family.toLowerCase())) return true;
  if (!NAME.test(family)) return false;
  return ['monospace', 'serif'].some((fallback) => measure(`100px "${family}", ${fallback}`) !== measure(`100px ${fallback}`));
}

const cache = new Map<string, boolean>();
let context: CanvasRenderingContext2D | null | undefined;

/** {@link fontRenders} measured on a canvas, cached per family. Outside a browser, false. */
export function isFontAvailable(name: string): boolean {
  const key = name.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (context === undefined) context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  const ctx = context;
  const available = ctx
    ? fontRenders(name, (font) => {
        ctx.font = font;
        return ctx.measureText(SAMPLE).width;
      })
    : GENERIC.has(key);
  cache.set(key, available);
  return available;
}
