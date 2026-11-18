import type { Dynamic } from '../dynamic.ts';
export const RULE_WORD_REWRITES = [
  ['greater than or equal to', 'at least'],
  ['more than or equal to', 'at least'],
  ['less than or equal to', 'at most'],
  ['equal to', 'is'],
  ['equals', 'is'],
  ['exceeds', 'over'],
  ['exceed', 'over'],
  ['exceeding', 'over'],
  ['negative', 'under 0'],
  ['positive', 'over 0'],
  ['zero', '0'],
  ['missing', 'blank'],
  ['in the past', 'past'],
].map(([phrase, rewrite]: Dynamic) => [phrase.split(' '), rewrite]);
export const UNCHECKED_RULE_WORDS = new (Set as Dynamic)(['unchecked', 'unticked', 'false']);
