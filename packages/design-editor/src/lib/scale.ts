/**
 * Scaling inline styles by a factor (the Scale tool, K): every absolute
 * length is multiplied; relative ones (em, %, unitless) scale on their own
 * once the lengths they depend on do.
 */

/** Properties never scaled. */
const NEVER = new Set([
  'font-family',
  'font-weight',
  'content',
  'animation',
  'animation-duration',
  'animation-delay',
  'transition',
  'transition-duration',
  'transition-delay',
  'grid-area',
  'grid-template-areas',
  'counter-reset',
  'counter-increment',
  'will-change',
  'container',
  'view-transition-name',
  'font-feature-settings',
  'font-variation-settings',
  'opacity',
  'z-index',
  'flex-grow',
  'flex-shrink',
  'order',
]);

/** Properties a selected (root) element keeps: where it sits, not how big it is. */
const ROOT_KEEPS = new Set([
  'left',
  'top',
  'right',
  'bottom',
  'inset',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'translate',
  'transform',
]);

/** Root sizes that scale even as percentages. */
const ROOT_PERCENT = new Set(['width', 'height', 'flex-basis']);

const ABSOLUTE = /(-?\d*\.?\d+(?:e-?\d+)?)(px|pt|pc|in|cm|mm|q|rem|vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh)\b/gi;

const round = (value: number, unit: string) => {
  const step = unit.toLowerCase() === 'px' ? 100 : 10000;
  return String(Math.round(value * step) / step);
};

/** Multiplies the absolute lengths of a value, leaving `url()`, strings and holes alone. */
export function scaleLengths(value: string, factor: number, percent = false): string {
  if (value.includes('{{')) return value;
  // Split out the parts that must not change.
  return value
    .split(/(url\([^)]*\)|"[^"]*"|'[^']*')/i)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      let out = part.replace(ABSOLUTE, (_m, n: string, unit: string) => `${round(Number(n) * factor, unit)}${unit}`);
      if (percent) out = out.replace(/(-?\d*\.?\d+)%/g, (_m, n: string) => `${round(Number(n) * factor, '%')}%`);
      return out;
    })
    .join('');
}

/**
 * The scaled declarations of a style: every declaration with an absolute
 * length, at this factor (so factor 1 gives the originals back). `root` is
 * true for a selected element: its position stays, its percent size scales.
 */
export function scaleStyle(style: Readonly<Record<string, string>>, factor: number, root: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [property, value] of Object.entries(style)) {
    if (NEVER.has(property) || property.startsWith('--')) continue;
    if (root && ROOT_KEEPS.has(property)) continue;
    const percent = root && ROOT_PERCENT.has(property);
    if (scaleLengths(value, 2, percent) === value) continue;
    out[property] = scaleLengths(value, factor, percent);
  }
  return out;
}

/**
 * Computed properties pinned inline on a scaled root when no inline style
 * sets them, so that sizes coming from classes or inheritance scale too.
 * Each maps to the inline properties (shorthands included) that already set it.
 */
export const PINNED: Readonly<Record<string, readonly string[]>> = {
  width: ['width'],
  height: ['height'],
  'font-size': ['font-size', 'font'],
  'line-height': ['line-height', 'font'],
  'letter-spacing': ['letter-spacing'],
  'padding-top': ['padding', 'padding-top', 'padding-block', 'padding-block-start'],
  'padding-right': ['padding', 'padding-right', 'padding-inline', 'padding-inline-end'],
  'padding-bottom': ['padding', 'padding-bottom', 'padding-block', 'padding-block-end'],
  'padding-left': ['padding', 'padding-left', 'padding-inline', 'padding-inline-start'],
  'border-top-width': ['border', 'border-width', 'border-top', 'border-top-width'],
  'border-right-width': ['border', 'border-width', 'border-right', 'border-right-width'],
  'border-bottom-width': ['border', 'border-width', 'border-bottom', 'border-bottom-width'],
  'border-left-width': ['border', 'border-width', 'border-left', 'border-left-width'],
  'border-top-left-radius': ['border-radius', 'border-top-left-radius'],
  'border-top-right-radius': ['border-radius', 'border-top-right-radius'],
  'border-bottom-right-radius': ['border-radius', 'border-bottom-right-radius'],
  'border-bottom-left-radius': ['border-radius', 'border-bottom-left-radius'],
  'row-gap': ['gap', 'row-gap'],
  'column-gap': ['gap', 'column-gap'],
};

/** The pinned declarations of a root, from its computed style (unscaled). */
export function pinnedStyle(inline: Readonly<Record<string, string>>, computed: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [property, setBy] of Object.entries(PINNED)) {
    if (setBy.some((name) => name in inline)) continue;
    const value = computed[property];
    if (!value || !/^-?\d*\.?\d+px$/.test(value) || parseFloat(value) === 0) continue;
    out[property] = value;
  }
  return out;
}

/** Parses a scale input: `150%`, `%150`, `1.5x`, `1.5×`, `150`; `320px` is a target width. */
export function parseScaleInput(text: string, width: number): number | null {
  const value = text.trim().replace(/\s+/g, '');
  let factor: number | null = null;
  let match: RegExpExecArray | null;
  if ((match = /^(\d*\.?\d+)%$/.exec(value)) || (match = /^%(\d*\.?\d+)$/.exec(value))) factor = Number(match[1]) / 100;
  else if ((match = /^(\d*\.?\d+)[x×]$/i.exec(value))) factor = Number(match[1]);
  else if ((match = /^(\d*\.?\d+)px$/i.exec(value))) factor = width > 0 ? Number(match[1]) / width : null;
  else if ((match = /^(\d*\.?\d+)$/.exec(value))) factor = Number(match[1]) / 100;
  if (factor === null || !Number.isFinite(factor) || factor <= 0) return null;
  return Math.min(100, Math.max(0.01, factor));
}
