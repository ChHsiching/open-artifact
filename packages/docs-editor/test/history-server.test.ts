/** The version history against a running doc: its rows, comparing two versions, copying one to a tab, restoring. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type DiskDoc, docFromDisk } from '@open-artifact/docs-core';
import type { DocCallAnswer, DocHistoryResponse, DocSessionResponse, DocTabResponse, DocVersionResponse } from '@open-artifact/runtime/doc-api';
import { compareVersions, hasChanges } from '../src/history/compare.ts';
import { copyMembers, copyName, mintedTab } from '../src/history/copy.ts';
import { dayKey, foldVersions } from '../src/history/groups.ts';
import { type DocServer, startDocServer, texts } from './harness.ts';

describe('version history on a doc', () => {
  let server: DocServer;
  before(async () => {
    server = await startDocServer('# Plan\n\nShip on Friday.');
    for (const words of ['Second line.', 'Third line.']) {
      const wrote = await server.action('update', {
        call: { ref: { object: 'node', id: server.node }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: words } } }] } },
      });
      assert.equal(wrote.ok, true, JSON.stringify(wrote));
    }
  });
  after(() => server.stop());

  const history = () => server.post<DocHistoryResponse>('_api/doc/history', { tab: server.tab });
  const version = async (rev: number) => docFromDisk((await server.post<DocVersionResponse>('_api/doc/version', { tab: server.tab, rev })).doc as unknown as DiskDoc);

  it('lists the versions newest first, the newest as the current row', async () => {
    const { versions, rev } = await history();
    assert.ok(versions.length >= 3, JSON.stringify(versions));
    assert.equal(versions[0]!.rev, rev);
    const rows = foldVersions(versions, dayKey);
    assert.equal(rows[0]!.kind, 'current');
    // The agent's two calls are two versions; the older one folds with nothing else by the agent before it.
    assert.ok(rows.slice(1).some(row => row.versions.some(item => item.by === 'agent')));
  });

  it('compares a version with the one before it', async () => {
    const { versions } = await history();
    const newer = await version(versions[0]!.rev);
    const older = await version(versions[1]!.rev);
    const compared = compareVersions(older, newer);
    assert.equal(hasChanges(compared), true);
    const added = compared.blocks.filter(block => block.suggest?.op === 'ins').map(block => (block.inline ?? []).map(item => ('ch' in item ? item.ch : '')).join(''));
    assert.deepEqual(added, ['Third line.']);
  });

  it('makes a copy of a version as a new tab', async () => {
    const { versions } = await history();
    const older = await version(versions[1]!.rev);
    const page = await server.post<DocSessionResponse>('_api/doc/session', { client: 'copier' });
    assert.ok(page.sess);
    const name = copyName('Notes', versions[1]!.at);
    const answer = await server.post<DocCallAnswer>('_api/doc/call', { client: 'copier', sess: page.sess, opId: `${page.sess}.copy`, batch: copyMembers(name, older) });
    assert.equal(answer.verdict, 'allow', JSON.stringify(answer));
    const tab = mintedTab(answer as Record<string, unknown>);
    assert.ok(tab);
    const project = (await server.post<DocSessionResponse>('_api/doc/session', { client: 'copier' })).project;
    assert.equal(project.files.find(file => file.id === tab)?.name, name);
    const copied = await server.post<DocTabResponse>('_api/doc/read', { tab });
    assert.deepEqual(texts(copied.doc as unknown as DiskDoc), texts({ rev: older.rev, blocks: older.blocks } as unknown as DiskDoc));
  });

  it('restores a version, and the restore stands alone in the list', async () => {
    const { versions, rev } = await history();
    const target = versions[versions.length - 1]!;
    const restored = await server.post<{ restored: boolean; rev: number }>('_api/doc/restore', { tab: server.tab, rev: target.rev, ifRev: rev });
    assert.equal(restored.restored, true);
    const now = await history();
    assert.equal(now.versions[0]!.restoredFrom, target.rev);
    assert.deepEqual(await server.serverTexts(), texts((await server.post<DocVersionResponse>('_api/doc/version', { tab: server.tab, rev: target.rev })).doc as unknown as DiskDoc));
  });
});
