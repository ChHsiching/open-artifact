/**
 * Pure readers of computed CSS values, for exports that rebuild what the
 * browser drew as native objects (PPTX): colors, shadows, linear gradients,
 * radii, object positions and font families.
 *
 * Inputs are what `getComputedStyle` returns (`rgb(…)`, `rgba(…)`,
 * `color(srgb …)`, px lengths), plus the model's own spellings (`#hex`) where
 * an export reads the model directly.
 */

/** An opaque color and its alpha (0–1). */
export interface CssColor {
  /** `RRGGBB`, upper case. */
  hex: string;
  alpha: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const hex2 = (value: number): string => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0').toUpperCase();

/** Splits on commas (or spaces) outside parentheses. */
export function splitTop(value: string, separator: ',' | ' ' = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (separator === ',' ? char === ',' : /\s/.test(char!))) {
      const part = value.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }
  const last = value.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

/** A channel of `rgb()`: a number 0–255 or a percentage. */
function channel(text: string): number {
  return text.endsWith('%') ? (parseFloat(text) / 100) * 255 : parseFloat(text);
}

/** An alpha value: a number 0–1 or a percentage. */
function alphaOf(text: string | undefined): number {
  if (text === undefined || text === '') return 1;
  const value = text.endsWith('%') ? parseFloat(text) / 100 : parseFloat(text);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}

/** A few names the model may spell (computed values are always numeric). */
const NAMED: Record<string, string> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  gray: '808080',
  grey: '808080',
  yellow: 'FFFF00',
  orange: 'FFA500',
  purple: '800080',
};

/**
 * Reads a CSS color. Returns null for what it cannot read (`currentcolor`,
 * `color-mix()`, wide-gamut spaces): callers resolve those through the DOM.
 */
export function parseColor(value: string | undefined | null): CssColor | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (text === 'transparent' || text === 'none') return { hex: '000000', alpha: 0 };
  if (NAMED[text]) return { hex: NAMED[text]!, alpha: 1 };
  if (text.startsWith('#')) {
    const digits = text.slice(1);
    if (!/^[0-9a-f]+$/.test(digits)) return null;
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = digits.split('').map((d) => parseInt(d + d, 16));
      return { hex: hex2(r!) + hex2(g!) + hex2(b!), alpha: a === undefined ? 1 : a / 255 };
    }
    if (digits.length === 6 || digits.length === 8) {
      return { hex: digits.slice(0, 6).toUpperCase(), alpha: digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1 };
    }
    return null;
  }
  let match = /^rgba?\((.*)\)$/.exec(text);
  if (match) {
    const body = match[1]!;
    let parts: string[];
    let alpha: string | undefined;
    if (body.includes(',')) {
      parts = body.split(',').map((p) => p.trim());
      alpha = parts[3];
    } else {
      const [channels, a] = body.split('/');
      parts = channels!.trim().split(/\s+/);
      alpha = a?.trim();
    }
    if (parts.length < 3 || parts.slice(0, 3).some((p) => !Number.isFinite(parseFloat(p)))) return null;
    return { hex: hex2(channel(parts[0]!)) + hex2(channel(parts[1]!)) + hex2(channel(parts[2]!)), alpha: alphaOf(alpha) };
  }
  match = /^color\(srgb\s+([^/)]+?)(?:\s*\/\s*([^)]+))?\)$/.exec(text);
  if (match) {
    const parts = match[1]!.trim().split(/\s+/).map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
    if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return null;
    return { hex: parts.map((p) => hex2(p * 255)).join(''), alpha: alphaOf(match[2]?.trim()) };
  }
  return null;
}

/** A color with its alpha multiplied by `opacity`. */
export function withOpacity(color: CssColor, opacity: number): CssColor {
  return { hex: color.hex, alpha: clamp(color.alpha * opacity, 0, 1) };
}

/** A px length (`12px`, `0`), or `fallback`. */
export function px(value: string | undefined | null, fallback = 0): number {
  if (!value) return fallback;
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

/* -------------------------------------------------------------------------- */
/* Shadows                                                                     */
/* -------------------------------------------------------------------------- */

/** One outer shadow. */
export interface CssShadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: CssColor;
}

/** The first outer layer of a `box-shadow` value, or null. */
export function parseBoxShadow(value: string | undefined | null): CssShadow | null {
  if (!value || value === 'none') return null;
  for (const layer of splitTop(value)) {
    const tokens = splitTop(layer, ' ');
    if (tokens.includes('inset')) continue;
    const lengths: number[] = [];
    let color: CssColor | null = null;
    for (const token of tokens) {
      if (/^-?[\d.]+(px)?$/.test(token)) lengths.push(parseFloat(token));
      else color = parseColor(token) ?? color;
    }
    if (lengths.length < 2) continue;
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
    const shadow = { x, y, blur, spread, color: color ?? { hex: '000000', alpha: 0.3 } };
    if (shadow.color.alpha === 0) continue;
    return shadow;
  }
  return null;
}

/**
 * A shadow for an office shape of `size` (in the shadow's px). Office
 * shadows do not grow, so a positive spread is left out; a negative one
 * shrinks the shadow about the shape's centre, and past the middle of the
 * shape there is no shadow at all (null).
 */
export function officeShadow(shadow: CssShadow, size: { w: number; h: number }): { x: number; y: number; blur: number; scale?: { x: number; y: number } } | null {
  const own = { x: shadow.x, y: shadow.y, blur: shadow.blur };
  if (shadow.spread >= 0 || !(size.w > 0) || !(size.h > 0)) return own;
  const scale = { x: 1 + (2 * shadow.spread) / size.w, y: 1 + (2 * shadow.spread) / size.h };
  return scale.x > 0 && scale.y > 0 ? { ...own, scale } : null;
}

/* -------------------------------------------------------------------------- */
/* Gradients                                                                   */
/* -------------------------------------------------------------------------- */

/** A linear gradient: CSS angle (0deg points up, clockwise) and stops 0–1. */
export interface CssGradient {
  angle: number;
  stops: { pos: number; color: CssColor }[];
}

const SIDE_ANGLES: Record<string, number> = {
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270,
  'to top right': 45,
  'to right top': 45,
  'to bottom right': 135,
  'to right bottom': 135,
  'to bottom left': 225,
  'to left bottom': 225,
  'to top left': 315,
  'to left top': 315,
};

/** An angle in degrees from `deg`, `turn`, `rad` or `grad`. */
export function parseAngle(text: string): number | null {
  const match = /^(-?[\d.]+)(deg|turn|rad|grad)?$/.exec(text.trim());
  if (!match) return null;
  const value = parseFloat(match[1]!);
  switch (match[2]) {
    case 'turn':
      return value * 360;
    case 'rad':
      return (value * 180) / Math.PI;
    case 'grad':
      return value * 0.9;
    default:
      return value;
  }
}

/**
 * Reads a single `linear-gradient(…)` (the whole value must be one layer).
 * Returns null for anything else: radial, conic, repeating, several layers.
 */
export function parseLinearGradient(value: string | undefined | null): CssGradient | null {
  if (!value) return null;
  const layers = splitTop(value.trim());
  if (layers.length !== 1) return null;
  const match = /^linear-gradient\((.*)\)$/s.exec(layers[0]!);
  if (!match) return null;
  const args = splitTop(match[1]!);
  let angle = 180;
  const first = args[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('to ')) {
    const side = SIDE_ANGLES[first.replace(/\s+/g, ' ')];
    if (side === undefined) return null;
    angle = side;
    args.shift();
  } else {
    const parsed = parseAngle(first);
    if (parsed !== null) {
      angle = parsed;
      args.shift();
    }
  }
  const stops: { pos?: number; color: CssColor }[] = [];
  for (const arg of args) {
    const tokens = splitTop(arg, ' ');
    const color = parseColor(tokens[0]);
    if (!color) return null;
    const positions = tokens.slice(1).map((t) => (t.endsWith('%') ? parseFloat(t) / 100 : NaN));
    if (positions.some((p) => !Number.isFinite(p))) return null;
    if (positions.length === 0) stops.push({ color });
    for (const pos of positions) stops.push({ pos, color });
  }
  if (stops.length < 2) return null;
  // Missing positions: first 0, last 1, the rest spread evenly between known ones.
  if (stops[0]!.pos === undefined) stops[0]!.pos = 0;
  if (stops[stops.length - 1]!.pos === undefined) stops[stops.length - 1]!.pos = 1;
  for (let i = 1; i < stops.length; i++) {
    if (stops[i]!.pos !== undefined) continue;
    let j = i;
    while (stops[j]!.pos === undefined) j++;
    const from = stops[i - 1]!.pos!;
    const to = stops[j]!.pos!;
    for (let k = i; k < j; k++) stops[k]!.pos = from + ((to - from) * (k - i + 1)) / (j - i + 1);
  }
  let last = 0;
  return {
    angle: ((angle % 360) + 360) % 360,
    stops: stops.map((stop) => {
      last = clamp(Math.max(last, stop.pos!), 0, 1);
      return { pos: last, color: stop.color };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Boxes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A corner radius in px for a box: `12px`, `50%` (of the shorter side), or
 * the first of two values (`12px 8px`).
 */
export function cornerRadius(value: string | undefined | null, width: number, height: number): number {
  if (!value) return 0;
  const first = value.trim().split(/\s+/)[0] ?? '';
  if (first.endsWith('%')) return (parseFloat(first) / 100) * Math.min(width, height);
  return px(first);
}

/** An `object-position` axis as a fraction (0–1) of the free space, or px. */
export function objectPosition(value: string | undefined | null): { x: { pct?: number; px?: number }; y: { pct?: number; px?: number } } {
  const words = (value || '50% 50%').trim().split(/\s+/);
  const keyword: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
  const read = (word: string | undefined): { pct?: number; px?: number } => {
    if (!word) return { pct: 0.5 };
    if (word in keyword) return { pct: keyword[word] };
    if (word.endsWith('%')) return { pct: parseFloat(word) / 100 };
    return { px: px(word) };
  };
  return { x: read(words[0]), y: read(words[1] ?? words[0]) };
}

/** A rectangle in px. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where an image's pixels land inside its element box for an `object-fit`
 * and `object-position`.
 */
export function objectContentRect(fit: string, position: string, box: Rect, natural: { w: number; h: number }): Rect {
  if (natural.w <= 0 || natural.h <= 0) return box;
  let w = box.w;
  let h = box.h;
  const ratio = natural.w / natural.h;
  const cover = (): void => {
    if (box.w / box.h > ratio) h = box.w / ratio;
    else w = box.h * ratio;
  };
  const contain = (): void => {
    if (box.w / box.h > ratio) w = box.h * ratio;
    else h = box.w / ratio;
  };
  switch (fit) {
    case 'cover':
      cover();
      break;
    case 'contain':
      contain();
      break;
    case 'none':
      w = natural.w;
      h = natural.h;
      break;
    case 'scale-down':
      if (natural.w > box.w || natural.h > box.h) contain();
      else {
        w = natural.w;
        h = natural.h;
      }
      break;
    default:
      break; // fill
  }
  const { x, y } = objectPosition(position);
  const offset = (axis: { pct?: number; px?: number }, free: number): number => (axis.px !== undefined ? axis.px : (axis.pct ?? 0.5) * free);
  return { x: box.x + offset(x, box.w - w), y: box.y + offset(y, box.h - h), w, h };
}

/** The overlap of two rectangles (zero size when they do not meet). */
export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

/* -------------------------------------------------------------------------- */
/* Fonts                                                                       */
/* -------------------------------------------------------------------------- */

/** How PPTX text names its fonts. */
export type FontChoice = 'current' | 'basic';

/** Generic and platform-only families no office app knows by name. */
const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace',
  'ui-rounded', 'math', 'emoji', 'fangsong', '-apple-system', 'blinkmacsystemfont',
]);

/** The families of a `font-family` value, unquoted. */
export function fontFamilies(value: string | undefined | null): string[] {
  if (!value) return [];
  return splitTop(value)
    .map((family) => family.trim().replace(/^(['"])(.*)\1$/, '$2').trim())
    .filter(Boolean);
}

/** The broad class of a font stack. */
export function fontClass(families: readonly string[]): 'serif' | 'mono' | 'sans' {
  for (const family of families) {
    const name = family.toLowerCase();
    if (name === 'monospace' || name === 'ui-monospace' || /\b(mono|courier|consol|code|menlo)\b|mono$/.test(name)) return 'mono';
    if (name === 'sans-serif' || name === 'system-ui' || /sans/.test(name)) return 'sans';
    if (name === 'serif' || name === 'ui-serif' || /serif|georgia|times|garamond|playfair|merriweather|lora|baskerville|didot|bodoni|caslon|crimson/.test(name)) return 'serif';
  }
  return 'sans';
}

/** The basic office font of a stack's class. */
export function basicFont(families: readonly string[]): string {
  const kind = fontClass(families);
  return kind === 'serif' ? 'Georgia' : kind === 'mono' ? 'Courier New' : 'Arial';
}

/**
 * The typeface a PPTX run names: the stack's first family (`current`), with
 * generic and platform-only families mapped to basic office fonts; or always
 * the basic font of its class (`basic`).
 */
export function pptxFont(stack: string | undefined | null, choice: FontChoice): string {
  const families = fontFamilies(stack);
  if (choice === 'basic') return basicFont(families);
  const first = families[0];
  if (!first || GENERIC.has(first.toLowerCase())) return basicFont(families);
  return first;
}
