import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rulePatternMatches, rulePatternProblem } from '../src/index.ts';

describe('rule patterns', () => {
  it('matches whole values with JavaScript classes', () => {
    assert.equal(rulePatternMatches('[A-Z]{2}', 'US'), true);
    assert.equal(rulePatternMatches('[A-Z]{2}', 'USA'), false);
    assert.equal(rulePatternMatches('\\d+', '٢٠'), false);
    assert.equal(rulePatternMatches('a.b', 'a\rb'), false);
  });

  it('refuses syntax that cannot run in linear time', () => {
    assert.match(rulePatternProblem('(a)\\1') ?? '', /backreference/);
    assert.equal(rulePatternMatches('(?=a)a', 'a'), null);
    assert.equal(rulePatternProblem('^[a-z]+$'), null);
  });

  it('does not backtrack', () => {
    const started = performance.now();
    assert.equal(rulePatternMatches('(a+)+', `${'a'.repeat(20000)}!`), false);
    assert.ok(performance.now() - started < 500);
  });
});
