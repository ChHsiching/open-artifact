/**
 * The Data type on the type server: the writes it refuses before the store
 * (a person's own document, ids and names the page ignores, page files
 * without text or over the store's size), and type detection of a dashboard
 * whose marker document was removed.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { dataWritesProblem } from '../src/data.ts';
import { detectType } from '../src/index.ts';

const none = (): unknown => undefined;

describe('data writes', () => {
  it('passes the writes the page reads', () => {
    assert.equal(
      dataWritesProblem(
        [
          { op: 'set', path: 'datasets/sales', data: { title: 'Sales' } },
          { op: 'set', collection: 'files', doc_id: 'index.html', data: { text: '<p></p>' } },
          { op: 'update', path: 'files/app.js', data: { edit: { via: 'agent', at: '2026-11-17T00:00:00Z' } } },
          { op: 'delete', path: 'datasets/bad.id' },
        ],
        (path) => (path === 'files/app.js' ? { text: 'x' } : undefined),
      ),
      null,
    );
  });

  it('refuses what the page would drop, naming the write', () => {
    assert.deepEqual(dataWritesProblem([{ op: 'set', path: 'dash/meta', data: {} }, { op: 'set', path: 'data/users/owner/check', data: {} }], none), {
      code: 'READ_ONLY_PATH',
      message: 'writes[1]: data/users/owner/check is written by the open page; you only read it.',
    });
    assert.equal(dataWritesProblem([{ op: 'set', path: 'datasets/a.b', data: {} }], none)?.code, 'REFUSED');
    assert.equal(dataWritesProblem([{ op: 'set', path: 'files/sub~x', data: { text: '' } }], none)?.code, 'REFUSED');
    assert.match(dataWritesProblem([{ op: 'set', path: 'files/x.js', data: { body: '' } }], none)?.message ?? '', /needs \{text\}/);
    assert.match(dataWritesProblem([{ op: 'update', path: 'files/x.js', data: { text: null } }], () => ({ text: 'x' }))?.message ?? '', /needs \{text\}/);
    const big = dataWritesProblem([{ op: 'update', path: 'files/x.js', data: { more: 'x'.repeat(200 * 1024) } }], () => ({ text: 'y'.repeat(100 * 1024) }));
    assert.equal(big?.code, 'TOO_LARGE');
    assert.match(big?.message ?? '', /Split it/);
  });
});

describe('data detection', () => {
  it('knows a dashboard by its marker, and by its dash collection once the marker is gone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'oa-data-'));
    try {
      await mkdir(join(root, 'db', 'dash'), { recursive: true });
      await writeFile(join(root, 'db', 'dash', 'meta.json'), '{"title":"T"}');
      assert.equal(await detectType(root), 'data');
      await rm(join(root, 'db', 'dash', 'meta.json'));
      await writeFile(join(root, 'db', 'dash', 'params.json'), '{}');
      assert.equal(await detectType(root), 'data');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
