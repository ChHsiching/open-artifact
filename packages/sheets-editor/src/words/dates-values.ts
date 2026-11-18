import type { Dynamic } from '../dynamic.ts';
import { phrasesMeaning } from './tokens.ts';
export const MONTH_NAMES = 'january february march april may june july august september october november december'.split(' ');
export const RELATIVE_DAY_WORDS = new (Map as Dynamic)([
  ['yesterday', -1],
  ['today', 0],
  ['tomorrow', 1],
]);
export const RELATIVE_PERIOD_WORDS = new (Map as Dynamic)([
  ['last', -1],
  ['previous', -1],
  ['this', 0],
  ['next', 1],
]);
export const OVERDUE_PHRASES = phrasesMeaning(true, 'overdue, late, past due');
export const PAST_PHRASES = [...OVERDUE_PHRASES, ...phrasesMeaning(true, 'past, before today')];
export const DATE_COMPARISON_PHRASES = [
  ...phrasesMeaning(['lessThan', false], 'before, earlier than, <'),
  ...phrasesMeaning(['greaterThan', true], 'after, later than, >'),
  ...phrasesMeaning(['greaterThanOrEqualTo', false], 'since, from, starting, on or after, >=, ≥'),
  ...phrasesMeaning(['lessThanOrEqualTo', true], 'by, until, till, through, up to, on or before, <=, ≤'),
];
export const DATE_TRAILING_COMPARISON_PHRASES = [
  ...phrasesMeaning(['greaterThanOrEqualTo', false], 'or later, or after, and later, and after, onward, onwards'),
  ...phrasesMeaning(['lessThanOrEqualTo', true], 'or earlier, or before, and earlier, and before'),
];
export const MONTHS_IN_PERIOD = new (Map as Dynamic)([
  ['month', 1],
  ['quarter', 3],
  ['year', 12],
]);
export const DAYS_IN_UNIT = new (Map as Dynamic)([
  ['day', 1],
  ['days', 1],
  ['week', 7],
  ['weeks', 7],
]);
export const AGE_COMPARISON_PHRASES = [
  ...phrasesMeaning('before', 'more than, over, longer than'),
  ...phrasesMeaning('byThen', 'at least'),
  ...phrasesMeaning('since', 'less than, under, within'),
];
