/** A number a mark shows, read from its text: its value, the size of its last shown digit, and how it was written. */
export interface DisplayedNumber {
  value: number;
  step: number;
  percent: boolean;
  signed: boolean;
}

/** Text a mark may show for a missing value: dashes, dots, `n/a`. */
export const EMPTY_VALUE_PATTERN = /^[\s–—−\-·.…]*$|^n\/?a$/i;
/** Longer shown text is not read as a number. */
export const MAX_MARK_NUMBER_CHARACTERS = 32;

const COMPACT_NUMBER_MULTIPLIERS: Readonly<Record<string, number>> = {
  K: 1000,
  k: 1000,
  M: 1e6,
  B: 1e9,
  bn: 1e9,
  T: 1e12,
};
const DERIVED_NUMBER_MULTIPLIERS = [1000, 1e6, 1e9, 0.01];
const CURRENCY_AFFIX_PATTERN = '(?:[A-Z]{0,3}[$€£¥₹]|[A-Z]{3})?';
const NUMBER_SIGN_PATTERN = '([+\\-−–]?)';
const PERCENT_CURRENCY_TAIL_PATTERN = new RegExp(`^%?${CURRENCY_AFFIX_PATTERN}$`);

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function createDisplayedNumberPattern(group: string, decimal: string): RegExp {
  return new RegExp(
    `^([▲▼↑↓]?)${NUMBER_SIGN_PATTERN}${CURRENCY_AFFIX_PATTERN}${NUMBER_SIGN_PATTERN}` +
      `(\\d{1,3}(?:${escapeRegex(group)}\\d{3})+|\\d*)(?:${escapeRegex(decimal)}(\\d+))?(\\D*)$`,
  );
}

function getLocaleNumberSeparator(type: 'group' | 'decimal', fallback: string): string {
  const parts = new Intl.NumberFormat(undefined).formatToParts(12345.6);
  return parts.find((part) => part.type === type)?.value.replace(/\s/g, '') ?? fallback;
}

const DISPLAYED_NUMBER_PATTERNS: readonly RegExp[] = [
  createDisplayedNumberPattern(',', '.'),
  createDisplayedNumberPattern('.', ','),
  createDisplayedNumberPattern(getLocaleNumberSeparator('group', ','), getLocaleNumberSeparator('decimal', '.')),
];

/** `text` cut to `max` characters, ending in an ellipsis when cut. */
export function truncateRawText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * What a shown text can be as a number: K / M / B / T suffixes, and, when `localeMultipliers` is given (the page
 * locale's compact suffixes), those too and the plain number. Each separator style (1,234.5 / 1.234,5 / the
 * browser's) is tried; an arrow, a sign before or after a currency, and a text in parentheses mark the sign.
 */
export function parseDisplayedNumbers(
  input: string,
  localeMultipliers?: Readonly<Record<string, number>>,
): DisplayedNumber[] {
  const text = input.replace(/\s/g, '');
  const parenthesized = /^\(.+\)$/.test(text);
  const parse = (multipliers: Readonly<Record<string, number>>): DisplayedNumber[] =>
    DISPLAYED_NUMBER_PATTERNS.flatMap((pattern): DisplayedNumber[] => {
      const [, arrow = '', sign = '', currencySign = '', whole = '', fraction = '', tail = ''] =
        pattern.exec(parenthesized ? text.slice(1, -1) : text) ?? [];
      const suffix = [...Object.keys(multipliers), ''].find(
        (key) => tail.startsWith(key) && PERCENT_CURRENCY_TAIL_PATTERN.test(tail.slice(key.length)),
      );
      if (whole + fraction === '' || suffix === undefined) return [];
      const multiplier = multipliers[suffix] ?? 1;
      const negative = parenthesized || /[▼↓\-−–]/.test(arrow + sign + currencySign);
      const magnitude = Number(`${whole.replace(/\D/g, '')}.${fraction}`) * multiplier;
      return [
        {
          value: negative ? -magnitude : magnitude,
          step: multiplier / 10 ** fraction.length,
          percent: tail.slice(suffix.length).startsWith('%'),
          signed: negative || arrow + sign + currencySign !== '',
        },
      ];
    });
  const base = parse(COMPACT_NUMBER_MULTIPLIERS);
  return localeMultipliers === undefined || base.length === 0 ? base : [...base, ...parse(localeMultipliers), ...parse({})];
}

/**
 * Whether a shown number can be the value: the value rounds to the shown digits (a shown percent may also be the value
 * times 100), or, with `allowScaling`, the value in thousands, millions, billions or percent does. A display with a
 * sign or an arrow needs the value's sign.
 */
export function matchesPossiblyScaledNumber(display: DisplayedNumber, value: number, allowScaling = false): boolean {
  if (display.signed && display.value * value < 0) return false;
  return (display.percent ? [value * 100, value] : [value]).some((candidate) =>
    (allowScaling ? [1, ...DERIVED_NUMBER_MULTIPLIERS] : [1]).some((multiplier) => {
      const step = display.step * multiplier;
      const shownSteps = Math.round(Math.abs(display.value * multiplier) / step);
      const valueSteps = Math.abs(candidate) / step;
      const tolerance = Math.min(valueSteps * 4e-15, 0.25);
      return valueSteps >= shownSteps - 0.5 - tolerance && valueSteps < shownSteps + 1 - tolerance;
    }),
  );
}

/** The compact-notation suffixes of a locale (for example "k", "Mio.", "万") and what each multiplies by. */
export function getLocaleCompactMultipliers(locale?: string): Record<string, number> {
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(locale, { notation: 'compact' });
  } catch {
    formatter = new Intl.NumberFormat(undefined, { notation: 'compact' });
  }
  const multipliers: Record<string, number> = {};
  for (let value = 1e15; value >= 1000; value /= 10) {
    const parts = formatter.formatToParts(value);
    const suffix = parts.find((part) => part.type === 'compact')?.value.replace(/\s/g, '') ?? '';
    const integer = Number(
      parts
        .filter((part) => part.type === 'integer')
        .map((part) => part.value)
        .join(''),
    );
    if (suffix !== '' && integer > 0) multipliers[suffix] = value / integer;
  }
  return multipliers;
}
