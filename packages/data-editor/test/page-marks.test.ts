import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Table } from '@open-artifact/data-core';
import { EMPTY_VALUE_PATTERN, matchesPossiblyScaledNumber, parseDisplayedNumbers, truncateRawText } from '../src/page/numbers.ts';
import {
  encodeWhereAddress,
  findSourceMarkIssue,
  getMarkedSourceIds,
  getSourceTable,
  getUnderlyingSources,
  resolveNamespacedColumn,
  type SourceCalculationState,
} from '../src/page/sources.ts';

const table: Table = {
  columns: ['region', 'revenue'],
  rows: [
    { region: 'North', revenue: 1234.5 },
    { region: 'South', revenue: 980000 },
  ],
};
const tables = new Map<string, Table | null>([
  ['sales', table],
  ['pending', null],
]);
const calcs = new Map<string, SourceCalculationState>([
  ['total', { inputs: ['sales'], status: 'ok', value: 2 }],
  ['share', { inputs: ['total', 'costs'], status: 'loading', value: undefined }],
]);

describe('source marks', () => {
  it('reads the distinct valid ids a mark names', () => {
    assert.deepEqual(getMarkedSourceIds({ getAttribute: () => ' sales  costs sales ' }), ['sales', 'costs']);
    assert.deepEqual(getMarkedSourceIds({ getAttribute: () => null }), []);
  });

  it('finds the datasets under a calculation through other calculations', () => {
    assert.deepEqual(getUnderlyingSources('share', calcs)?.sort(), ['costs', 'sales']);
    assert.equal(getUnderlyingSources('sales', calcs), undefined);
  });

  it('gives a source table: a dataset table, null while loading, undefined for a calc that is no table', () => {
    assert.equal(getSourceTable('sales', tables, calcs), table);
    assert.equal(getSourceTable('pending', tables, calcs), null);
    assert.equal(getSourceTable('share', tables, calcs), null);
    assert.equal(getSourceTable('total', tables, calcs), undefined);
  });

  it('accepts a shown number that rounds from the value', () => {
    const address = { source: 'sales', field: 'revenue', where: [{ column: 'region', value: 'North' }] };
    assert.equal(findSourceMarkIssue(address, '1,234.5', tables, calcs), null);
    assert.equal(findSourceMarkIssue(address, '1.2K', tables, calcs), null);
    assert.deepEqual(findSourceMarkIssue(address, '1,300', tables, calcs), {
      source: 'sales',
      field: 'revenue',
      where: 'region=North',
      shown: '1,300',
      inData: '1234.5',
    });
  });

  it('allows scaled numbers only on derived marks', () => {
    const address = { source: 'sales', field: 'revenue', row: 1 };
    assert.notEqual(findSourceMarkIssue(address, '980', tables, calcs), null);
    assert.equal(findSourceMarkIssue(address, '980', tables, calcs, true), null);
  });

  it('reports an address that does not resolve, unless it shows an empty value for a missing row', () => {
    const missing = { source: 'sales', field: 'revenue', where: [{ column: 'region', value: 'East' }] };
    assert.equal(findSourceMarkIssue(missing, '—', tables, calcs), null);
    assert.ok(findSourceMarkIssue(missing, '12', tables, calcs) !== null);
    assert.ok(findSourceMarkIssue({ source: 'nope', field: 'x' }, '1', tables, calcs) !== null);
  });

  it('checks a calculation value', () => {
    assert.equal(findSourceMarkIssue({ source: 'total' }, '2', tables, calcs), null);
    assert.ok(findSourceMarkIssue({ source: 'total' }, '3', tables, calcs) !== null);
    assert.equal(findSourceMarkIssue({ source: 'share' }, '3', tables, calcs), null);
  });

  it('resolves namespaced columns and encodes row keys', () => {
    assert.equal(resolveNamespacedColumn('id', ['orders__id', 'name']), 'orders__id');
    assert.equal(resolveNamespacedColumn('id', ['a__id', 'b__id']), null);
    assert.equal(encodeWhereAddress(['a b', 'c'], ['x&y', '1']), 'a%20b=x%26y&c=1');
  });
});

describe('displayed numbers', () => {
  it('reads separators, suffixes, signs and percents', () => {
    const [plain] = parseDisplayedNumbers('$1,234.50');
    assert.equal(plain?.value, 1234.5);
    assert.equal(parseDisplayedNumbers('(12)')[0]?.value, -12);
    assert.equal(parseDisplayedNumbers('▼ 3%')[0]?.percent, true);
    assert.equal(parseDisplayedNumbers('2.5M')[0]?.value, 2_500_000);
    assert.deepEqual(parseDisplayedNumbers('hello'), []);
  });

  it('matches percents shown for fractions and needs the sign a display shows', () => {
    const [percent] = parseDisplayedNumbers('12%');
    assert.ok(percent !== undefined && matchesPossiblyScaledNumber(percent, 0.12));
    const [signed] = parseDisplayedNumbers('+5');
    assert.ok(signed !== undefined && !matchesPossiblyScaledNumber(signed, -5));
  });

  it('knows empty values and cuts long text', () => {
    for (const text of ['', '—', ' - ', 'n/a', 'NA', '…']) assert.ok(EMPTY_VALUE_PATTERN.test(text), text);
    assert.ok(!EMPTY_VALUE_PATTERN.test('0'));
    assert.equal(truncateRawText('abcdef', 4), 'abc…');
    assert.equal(truncateRawText('abc', 4), 'abc');
  });
});
