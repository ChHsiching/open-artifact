import { rulePatternMatches, rulePatternProblem } from '@open-artifact/wasm-data-rules';

/**
 * Why a rule's `pattern` can't be used, or `null` when it can. Patterns are read with the JavaScript
 * `u`-flag meaning and matched in linear time (no lookaround or backreferences).
 */
export function checkRulePattern(pattern: string): string | null {
  return rulePatternProblem(pattern);
}

/** Whether the whole value matches a rule's `pattern`; `false` when the pattern can't be used. */
export function matchesRulePattern(pattern: string, value: string): boolean {
  return rulePatternMatches(pattern, value) === true;
}
