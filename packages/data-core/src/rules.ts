import type { ArgumentRule, FilledArguments } from './connector-types.ts';
import type { ParameterValue, UnfilledCode } from './types.ts';
import { checkRulePattern, matchesRulePattern } from './rule-pattern.ts';
import { parameterToText } from './sql.ts';

/** What a viewer reads when a `{{filter}}` can't be filled in. */
export const UNFILLED_MESSAGES: Readonly<Record<UnfilledCode, (filter: string, char?: string) => string>> = {
  quotedFilter: (filter) =>
    `This query has {{${filter}}} inside quotes, where it isn’t filled in. Write it outside them: a text value brings its own quotes.`,
  unreadableRules: (filter) => `The ${filter} filter can’t be used until an editor fixes this query.`,
  ruledOut: (filter) => `That value doesn’t work for ${filter} here. Try another.`,
  ruledOutUnset: (filter) => `Pick a value for ${filter}.`,
  noneChosen: (filter) => `Pick at least one value for ${filter}.`,
  notPlain: (filter, char = '') => `A value for ${filter} can’t contain “${char}” here. Try another.`,
  hiddenChar: (filter) => `A value for ${filter} has a hidden character. Retype it and try again.`,
  oneValue: (filter) => `Pick just one value for ${filter} here.`,
};

/** The codes that depend on the viewer's value (another value may work). */
export const VALUED_UNFILLED_CODES: ReadonlySet<UnfilledCode> = new Set<UnfilledCode>([
  'ruledOut',
  'ruledOutUnset',
  'noneChosen',
  'notPlain',
  'hiddenChar',
  'oneValue',
]);

/** Quotes, backslashes and their look-alikes (curly and modifier quotes, fullwidth forms, accents that combine with them). */
export const QUOTE_LOOKALIKE_PATTERN =
  /['"`\\\u2018-\u201f\u2032\u2033\u2035\u2036\u02b9\u02ba\u02bc\u02bb\u02c8\u02cb\u0300\u0301\u00b4\uff07\uff02\uff3c\ufe10\ufe50\ufe51\ua78b\ua78c\u07f4\u07f5\u055a\u05f3\u05f4\u00a5\u20a9]/;
export const COMBINING_MARK_PATTERN =
  /[\u00a8\u00af\u00b8\u02b0-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u1fbd-\u1fc1\u1fcd-\u1fcf\u1fdd-\u1fdf\u1fed-\u1fef\u1ffd\u1ffe\u20d0-\u20ff\ua700-\ua71f\ufe20-\ufe2f]/;
export const HIDDEN_CHAR_PATTERN = /[^\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}\u200c\u200d]|\ufffd/u;
/** What `findUnplainChar` returns for an invisible character. */
export const HIDDEN_CHAR_MARK = '\x00';

/** The pattern a rule checks: a list filter's is on its `items`. */
export function getRulePattern(rule: ArgumentRule | undefined): string | undefined {
  return (rule?.items ?? rule)?.pattern;
}

/** A rule for numbers ("number", or "integer"). */
export function isNumberRule(rule: ArgumentRule): boolean {
  return rule.type === 'number' || rule.type === 'integer';
}

/**
 * Whether a rule pins its values down enough to be written into query text: an `enum`, a `pattern`, a number or
 * boolean type, or bounds. A list filter is pinned when its items are and it says how many it takes at least.
 */
export function isRulePinned(rule: ArgumentRule | undefined): boolean {
  return (
    rule !== undefined &&
    ((isRulePinned(rule.items) && rule.minItems !== undefined) ||
      rule.enum !== undefined ||
      rule.pattern !== undefined ||
      isNumberRule(rule) ||
      rule.type === 'boolean' ||
      rule.minimum !== undefined ||
      rule.maximum !== undefined)
  );
}

/** Whether a rule's pattern (a list filter's: its items') can be used. */
export function isRuleReadable(rule: ArgumentRule | undefined): boolean {
  const pattern = getRulePattern(rule);
  return pattern === undefined || checkRulePattern(pattern) === null;
}

/**
 * Whether a value (or each item of a list) is one the rule allows. A list filter's rule (`items`) checks a
 * list: its length within `minItems`/`maxItems`, each value by `items`. An unset value (`null`) is allowed.
 */
export function ruleAllows(rule: ArgumentRule, value: ParameterValue): boolean {
  if (value === null) return true;
  if (rule.items !== undefined) {
    const itemRule = rule.items;
    const { minItems = 0, maxItems = Infinity } = rule;
    return (
      typeof value === 'object' &&
      value.length >= minItems &&
      value.length <= maxItems &&
      value.every((item) => ruleAllows(itemRule, item))
    );
  }
  if (typeof value === 'object') return value.every((item) => ruleAllows(rule, item));
  const lengthRule = (rule.minLength ?? 0) > 0 || rule.maxLength !== undefined;
  const numberRule = rule.minimum !== undefined || rule.maximum !== undefined;
  if (typeof value === 'string') {
    if ((rule.type !== undefined && rule.type !== 'string') || numberRule) return false;
    const length = [...value].length;
    if (length < (rule.minLength ?? 0) || (rule.maxLength !== undefined && length > rule.maxLength)) return false;
    if (rule.pattern !== undefined && !matchesRulePattern(rule.pattern, value)) return false;
  } else if (typeof value === 'number') {
    if (
      (rule.type !== undefined && !isNumberRule(rule)) ||
      (rule.type === 'integer' && !Number.isInteger(value)) ||
      rule.pattern !== undefined ||
      lengthRule
    )
      return false;
    if ((rule.minimum !== undefined && value < rule.minimum) || (rule.maximum !== undefined && value > rule.maximum))
      return false;
  } else if ((rule.type !== undefined && rule.type !== 'boolean') || rule.pattern !== undefined || lengthRule || numberRule)
    return false;
  return rule.enum === undefined || rule.enum.some((member) => member === value);
}

/** Why a value cannot be written into text under a rule ("ruledOut", or "oneValue" when a list can't be joined), else `null`. */
export function getTextRuleVerdict(rule: ArgumentRule, value: ParameterValue): 'ruledOut' | 'oneValue' | null {
  if (rule.items !== undefined) return value !== null && ruleAllows(rule, value) ? null : 'ruledOut';
  if (typeof value !== 'object' || value === null) return ruleAllows(rule, value) ? null : 'ruledOut';
  if (rule.pattern !== undefined) return ruleAllows(rule, parameterToText(value)) ? null : 'ruledOut';
  const joinable =
    !isNumberRule(rule) &&
    rule.type !== 'boolean' &&
    rule.minimum === undefined &&
    rule.maximum === undefined &&
    (rule.enum ?? []).every((member) => typeof member === 'string');
  if (!joinable) return 'oneValue';
  return ruleAllows(rule, value) ? null : 'ruledOut';
}

/** The unfilled text for a `{{filter}}` and, for the viewer's language, why. */
export function makeUnfilledProblem(
  code: UnfilledCode,
  filter: string,
  char?: string,
): Required<Pick<FilledArguments, 'unfilled' | 'unfilledAs'>> {
  return {
    unfilled: UNFILLED_MESSAGES[code](filter, char),
    unfilledAs: {
      code,
      filter,
      ...(char === undefined ? {} : { char }),
      ...(VALUED_UNFILLED_CODES.has(code) ? { valued: true as const } : {}),
    },
  };
}

/** The first character of a text value that must not be written into a query as plain text, `HIDDEN_CHAR_MARK` for an invisible one; else `null`. */
export function findUnplainChar(text: string): string | null {
  if (HIDDEN_CHAR_PATTERN.test(text) || COMBINING_MARK_PATTERN.test(text)) return HIDDEN_CHAR_MARK;
  const found = QUOTE_LOOKALIKE_PATTERN.exec(text);
  if (found !== null) return found[0];
  if (!QUOTE_LOOKALIKE_PATTERN.test(text.normalize('NFKC'))) return null;
  return [...text].find((char) => QUOTE_LOOKALIKE_PATTERN.test(char.normalize('NFKC'))) ?? HIDDEN_CHAR_MARK;
}

/** `findUnplainChar` over a value, or each text of a list. */
export function findUnplainCharIn(value: ParameterValue): string | null {
  if (typeof value === 'string') return findUnplainChar(value);
  if (typeof value !== 'object' || value === null) return null;
  return value.reduce<string | null>((found, item) => found ?? findUnplainCharIn(item), null);
}
