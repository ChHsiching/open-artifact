import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkRulePattern,
  fillCallArguments,
  fillDatasetParameters,
  findUnplainChar,
  getSourceRuleProblems,
  HIDDEN_CHAR_MARK,
  isRulePinned,
  isRuleReadable,
  matchesRulePattern,
  parseDataset,
  ruleAllows,
} from '../src/index.ts';
import type { Parameters } from '../src/index.ts';

const params = (record: Record<string, unknown>): Parameters => record as Parameters;
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

describe('rule patterns', () => {
  it('match the whole value and refuse lookaround', () => {
    assert.equal(checkRulePattern('[A-Z]{2}'), null);
    assert.equal(matchesRulePattern('[A-Z]{2}', 'US'), true);
    assert.equal(matchesRulePattern('[A-Z]{2}', 'USA'), false);
    assert.match(checkRulePattern('(?=a)a') ?? '', /lookaround/);
    assert.equal(matchesRulePattern('(?=a)a', 'a'), false);
  });
});

describe('rules', () => {
  it('tell which rules pin their values', () => {
    assert.equal(isRulePinned(undefined), false);
    assert.equal(isRulePinned({}), false);
    assert.equal(isRulePinned({ type: 'string', maxLength: 5 }), false);
    assert.equal(isRulePinned({ enum: ['a'] }), true);
    assert.equal(isRulePinned({ pattern: '[a-z]+' }), true);
    assert.equal(isRulePinned({ type: 'integer' }), true);
    assert.equal(isRulePinned({ minimum: 0 }), true);
    assert.equal(isRulePinned({ type: 'array', items: { enum: ['a'] } }), false);
    assert.equal(isRulePinned({ type: 'array', items: { enum: ['a'] }, minItems: 1 }), true);
  });

  it('check values, lists and their lengths', () => {
    assert.equal(ruleAllows({ enum: ['EU', 'US'] }, 'EU'), true);
    assert.equal(ruleAllows({ enum: ['EU', 'US'] }, 'APAC'), false);
    assert.equal(ruleAllows({ type: 'integer', minimum: 1, maximum: 10 }, 3), true);
    assert.equal(ruleAllows({ type: 'integer' }, 2.5), false);
    assert.equal(ruleAllows({ type: 'number' }, '3'), false);
    assert.equal(ruleAllows({ pattern: '[a-z]+' }, 'abc'), true);
    assert.equal(ruleAllows({ pattern: '[a-z]+' }, 'ab1'), false);
    assert.equal(ruleAllows({ maxLength: 2 }, 'abc'), false);
    const list = { type: 'array' as const, items: { enum: ['a', 'b'] }, minItems: 1, maxItems: 2 };
    assert.equal(ruleAllows(list, ['a']), true);
    assert.equal(ruleAllows(list, []), false);
    assert.equal(ruleAllows(list, ['a', 'b', 'a']), false);
    assert.equal(ruleAllows(list, ['c']), false);
    assert.equal(ruleAllows({ enum: ['a'] }, null), true);
  });

  it('call a rule with a refused pattern unreadable', () => {
    assert.equal(isRuleReadable({ pattern: '[a-z]+' }), true);
    assert.equal(isRuleReadable({ pattern: '(a)\\1' }), false);
    assert.equal(isRuleReadable({ type: 'array', items: { pattern: '(?!x)' } }), false);
  });

  it('find quotes, look-alikes and hidden characters', () => {
    assert.equal(findUnplainChar('plain text'), null);
    assert.equal(findUnplainChar("it's"), "'");
    assert.equal(findUnplainChar('say “hi”'), '“');
    assert.equal(findUnplainChar(`ab${ZERO_WIDTH_SPACE}c`), HIDDEN_CHAR_MARK);
    assert.equal(findUnplainChar(`tab\there`), HIDDEN_CHAR_MARK);
  });
});

describe('filling a call', () => {
  const template = JSON.stringify({ sql: 'select * from t where region = {{region}}', limit: '{{limit}}' });

  it('fills pinned text filters and whole-value filters', () => {
    const filled = fillCallArguments(
      template,
      params({ region: 'EU', limit: 5 }),
      { region: { enum: ['EU', 'US'] }, limit: { type: 'integer', minimum: 1 } },
      false,
    );
    assert.deepEqual(JSON.parse(filled.args), { sql: 'select * from t where region = EU', limit: 5 });
    assert.equal(filled.unfilled, undefined);
  });

  it('leaves a value the rule rules out unfilled, and says why', () => {
    const filled = fillCallArguments(template, params({ region: 'APAC', limit: 5 }), { region: { enum: ['EU', 'US'] }, limit: { type: 'integer' } }, false);
    assert.equal(filled.unfilledAs?.code, 'ruledOut');
    assert.equal(filled.unfilledAs?.filter, 'region');
    assert.equal(filled.unfilledAs?.valued, true);
    assert.match(JSON.parse(filled.args).sql, /\{\{region\}\}/);
  });

  it('asks for a value when a ruled filter is unset', () => {
    const filled = fillCallArguments(template, params({ limit: 5 }), { region: { enum: ['EU'] }, limit: { type: 'integer' } }, false);
    assert.equal(filled.unfilledAs?.code, 'ruledOutUnset');
    assert.equal(filled.unfilled, 'Pick a value for region.');
  });

  it('refuses quotes and hidden characters in an unpinned text filter', () => {
    const sqlOnly = JSON.stringify({ sql: 'select {{x}}' });
    assert.equal(fillCallArguments(sqlOnly, params({ x: "a'b" }), undefined, false).unfilledAs?.code, 'notPlain');
    assert.equal(fillCallArguments(sqlOnly, params({ x: "a'b" }), undefined, false).unfilledAs?.char, "'");
    const hidden = fillCallArguments(sqlOnly, params({ x: `ab${ZERO_WIDTH_SPACE}` }), undefined, false);
    assert.equal(hidden.unfilledAs?.code, 'hiddenChar');
    assert.equal(hidden.unfilled, 'A value for x has a hidden character. Retype it and try again.');
    assert.deepEqual(JSON.parse(fillCallArguments(sqlOnly, params({ x: 'abc' }), undefined, false).args), { sql: 'select abc' });
  });

  it('keeps every text filter unfilled when the rules are refused', () => {
    const filled = fillCallArguments(JSON.stringify({ sql: 'select {{x}}' }), params({ x: 'a' }), undefined, true);
    assert.equal(filled.unfilledAs?.code, 'unreadableRules');
  });

  it('fills a dataset from the filters and reports rule problems', () => {
    const dataset = parseDataset('sales', {
      title: 'Sales',
      source: { kind: 'call', connector: 'db', tool: 'run_sql', args: { sql: 'select {{x}}, {{y}}' }, rules: { y: { pattern: '(?=y)' } } },
    });
    assert.ok(dataset !== null && dataset.source.kind === 'query');
    assert.deepEqual(
      getSourceRuleProblems(dataset.source).map((problem) => [problem.filter, problem.what]),
      [
        ['x', 'filter_without_rule'],
        ['y', 'rule_unreadable'],
      ],
    );
    const filled = fillDatasetParameters(dataset, params({ x: 'a', y: 'b' }));
    assert.ok(filled.source.kind === 'query');
    assert.equal(filled.source.unfilledAs?.code, 'unreadableRules');
  });
});
