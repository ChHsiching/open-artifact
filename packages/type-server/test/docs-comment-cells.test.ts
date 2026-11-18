/**
 * A doc comment on several table cells, through the server: `comments.json` keeps the page's anchor as it was given,
 * the page gets it back as is, and the agent reads the thread's label as `where` and the table and its cells in
 * `location`.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { CommentStore, agentView } from '@open-artifact/server-sdk/comments';
import { pageThread } from '../src/db-host.ts';

describe('a doc comment on table cells', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oa-cells-'));
  after(() => rm(dir, { recursive: true, force: true }));

  it('keeps its anchor, and shows the agent where it is', () => {
    const anchor = JSON.stringify({ tab: 't1', table: 's1.4', cells: ['s1.9', 's1.12'] });
    const location = { tab: 't1', block: 's1.4', cells: ['s1.9', 's1.12'] };
    const created = new CommentStore(dir).create({
      anchor,
      label: 'Table · Q1 column',
      detail: 'On the table’s “Q1” column:\nQ1\n10',
      location,
      text: 'Check these numbers',
      author: { kind: 'person', name: 'Ana' } as never,
    });
    const saved = new CommentStore(dir).threads({ all: true }).find(thread => thread.id === created.id)!;
    assert.equal(saved.anchor, anchor);

    const page = pageThread(saved);
    assert.equal(page.anchor, anchor);
    assert.equal(page.label, 'Table · Q1 column');
    assert.deepEqual(page.location, location);

    const view = agentView(saved);
    assert.equal(view.where, 'Table · Q1 column');
    assert.deepEqual(view.location, location);
    assert.ok(String(view.detail).startsWith('On the table’s “Q1” column'));
  });
});
