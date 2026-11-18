import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BIGQUERY_POLL_TOOL,
  createLoaderResultReaders,
  DATABRICKS_POLL_TOOL,
  formatScannedBytes,
  parseBigQueryResult,
  parseGovernedQueryXml,
  readBigQueryResult,
  readDatabricksResult,
  readSnowflakeResult,
  ResultReaderError,
} from '../src/index.ts';
import type { PollAnswer, PollClock, ReaderContext, UnknownRecord } from '../src/index.ts';

const plain = (rows: object[]): object[] => rows.map((row) => ({ ...row }));

function fakeClock(): PollClock {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    random: () => 0.5,
  };
}

function context(answers: PollAnswer[], calls: [string, UnknownRecord][] = []): ReaderContext {
  return {
    args: {},
    stale: () => false,
    clock: fakeClock(),
    call: async (tool, args) => {
      calls.push([tool, args]);
      return answers.shift() ?? { error: 'no more answers' };
    },
  };
}

describe('BigQuery', () => {
  const done = {
    jobComplete: true,
    jobReference: { projectId: 'p', location: 'EU', jobId: 'j1' },
    schema: { fields: [{ name: 'n', type: 'INTEGER' }, { name: 'ok', type: 'BOOLEAN' }, { name: 'name', type: 'STRING' }] },
    rows: [{ f: [{ v: '5' }, { v: 'true' }, { v: 'a' }] }, { f: [{ v: '6' }, { v: 'false' }, { v: null }] }],
    totalRows: '3',
  };

  it('reads rows with their types and marks a cut answer', () => {
    const result = parseBigQueryResult(done);
    assert.ok(result !== null && 'table' in result);
    assert.deepEqual(result.table.columns, ['n', 'ok', 'name']);
    assert.deepEqual(plain(result.table.rows), [
      { n: 5, ok: true, name: 'a' },
      { n: 6, ok: false, name: null },
    ]);
    assert.equal(result.table.cut, 'rows');
    assert.deepEqual(result.table.meta, [{ label: 'Job', value: 'p:EU.j1', type: 'text' }]);
  });

  it('polls a running job until it completes', async () => {
    const calls: [string, UnknownRecord][] = [];
    const answer = await readBigQueryResult(
      { jobComplete: false, jobReference: { jobId: 'j1', location: 'EU' } },
      context([{ value: { jobComplete: false, jobReference: { jobId: 'j1' } } }, { value: { ...done, totalRows: '2' } }], calls),
    );
    assert.ok(answer !== null && 'table' in answer);
    assert.equal(answer.table.rows.length, 2);
    assert.equal(answer.table.cut, undefined);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.[0], BIGQUERY_POLL_TOOL);
    assert.equal(calls[0]?.[1].jobId, 'j1');
  });

  it('passes on an error the answer carries', async () => {
    const answer = await readBigQueryResult({ error: { message: 'Syntax error' } }, context([]));
    assert.ok(answer !== null && 'error' in answer);
    assert.equal(answer.error, 'Syntax error');
  });
});

describe('Snowflake', () => {
  it('reads a result set', () => {
    const answer = readSnowflakeResult(
      {
        query_id: 'q1',
        result_set: {
          resultSetMetaData: { numRows: 3, rowType: [{ name: 'N', type: 'fixed' }, { name: 'S', type: 'text' }] },
          data: [
            ['1', 'a'],
            ['2', 'b'],
          ],
        },
      },
      context([]),
    );
    assert.ok(answer !== null && !(answer instanceof Promise) && 'table' in answer);
    assert.deepEqual(plain(answer.table.rows), [
      { N: 1, S: 'a' },
      { N: 2, S: 'b' },
    ]);
    assert.equal(answer.table.cut, 'rows');
    assert.equal(answer.table.meta?.[0]?.value, 'q1');
  });

  it('is not read from another shape', () => {
    assert.equal(readSnowflakeResult({ rows: [] }, context([])), null);
  });
});

describe('Databricks', () => {
  const succeeded = {
    statement_id: 's1',
    status: { state: 'SUCCEEDED' },
    manifest: { schema: { columns: [{ name: 'x', type_name: 'INT' }, { name: 'y', type_name: 'STRING' }] }, total_row_count: 1 },
    result: { data_array: [['7', 'seven']] },
  };

  it('polls a pending statement and reads its rows', async () => {
    const calls: [string, UnknownRecord][] = [];
    const answer = await readDatabricksResult({ statement_id: 's1', status: { state: 'PENDING' } }, context([{ value: succeeded }], calls));
    assert.ok(answer !== null && 'table' in answer);
    assert.deepEqual(plain(answer.table.rows), [{ x: 7, y: 'seven' }]);
    assert.deepEqual(calls, [[DATABRICKS_POLL_TOOL, { statement_id: 's1' }]]);
  });

  it('reports a failed statement in its own words', async () => {
    const answer = await readDatabricksResult(
      { statement_id: 's1', status: { state: 'FAILED', error: { message: 'Table not found' } } },
      context([]),
    );
    assert.ok(answer !== null && 'error' in answer);
    assert.match(answer.error, /Table not found/);
  });
});

describe('governed XML', () => {
  it('reads columns and rows', () => {
    const answer = parseGovernedQueryXml(
      '<query_result><results total_rows="1"><column name="n" type="INTEGER"/><column name="s" type="STRING"/>' +
        '<row><field name="n">4</field><field name="s">a &amp; b</field></row></results></query_result>',
    );
    assert.ok(answer !== null && 'table' in answer);
    assert.deepEqual(plain(answer.table.rows), [{ n: 4, s: 'a & b' }]);
  });

  it('reads an error, busy when retryable', () => {
    const answer = parseGovernedQueryXml('<query_result retryable="true"><error>Too many queries</error></query_result>');
    assert.ok(answer !== null && 'error' in answer);
    assert.equal(answer.error, 'Too many queries');
    assert.equal(answer.busy, true);
  });

  it('formats scanned bytes', () => {
    assert.equal(formatScannedBytes('512'), '512 bytes');
    assert.equal(formatScannedBytes('1572864'), '1.5 MB');
  });
});

describe('loader readers', () => {
  it('give rows to a loader, and throw a reader failure', async () => {
    const readers = createLoaderResultReaders(context([]));
    const rows = await readers.snowflake({
      result_set: { resultSetMetaData: { numRows: 1, rowType: [{ name: 'a', type: 'text' }] }, data: [['x']] },
    });
    assert.deepEqual(rows.columns, ['a']);
    assert.equal(rows.truncated, false);
    await assert.rejects(
      readers.databricks({ statement_id: 's', status: { state: 'FAILED', error: { message: 'nope' } } }),
      ResultReaderError,
    );
    await assert.rejects(readers.snowflake({ other: true }));
  });
});
