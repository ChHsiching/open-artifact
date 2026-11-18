/** The tab list's calls against a running doc: new tab, copy, rename, move, delete, and the display record. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { DiskDoc } from '@open-artifact/docs-core';
import type { DocCallAnswer, DocFile, DocMember, DocSessionResponse, DocTabResponse } from '@open-artifact/runtime/doc-api';
import { displayMember } from '../src/page/display-member.ts';
import { deleteMembers, duplicateMembers, mintedTab, moveMember, newTabMembers, renameMember } from '../src/tabs/members.ts';
import { deletePlan, dropMove, movePatch, tabTree } from '../src/tabs/tree.ts';
import { type DocServer, startDocServer, texts } from './harness.ts';

describe('tab calls on a doc', () => {
  let server: DocServer;
  let sess = '';
  let calls = 0;
  before(async () => {
    server = await startDocServer('# Plan\n\nShip on Friday.');
    const page = await server.post<DocSessionResponse>('_api/doc/session', { client: 'tabs' });
    assert.ok(page.sess);
    sess = page.sess;
  });
  after(() => server.stop());

  const call = (members: DocMember[]) =>
    server.post<DocCallAnswer>('_api/doc/call', { client: 'tabs', sess, opId: `${sess}.tabs${++calls}`, ...(members.length === 1 ? { member: members[0] } : { batch: members }) });
  const project = async () => (await server.post<DocSessionResponse>('_api/doc/session', { client: 'tabs' })).project;
  const files = async (): Promise<DocFile[]> => (await project()).files;
  const shape = async () => {
    const all = await files();
    const name = (id: string) => all.find(file => file.id === id)?.name ?? id;
    const show = (nodes: ReturnType<typeof tabTree>): string => nodes.map(node => (node.children.length ? `${name(node.id)}(${show(node.children)})` : name(node.id))).join(' ');
    return show(tabTree(all));
  };
  const allowed = (answer: DocCallAnswer) => assert.equal(answer.verdict, 'allow', JSON.stringify(answer));

  let second = '';
  let sub = '';

  it('adds a tab, and a subtab under it', async () => {
    const made = newTabMembers(await files());
    assert.equal(made.name, 'Tab 2');
    const answer = await call(made.members);
    allowed(answer);
    second = mintedTab(answer as Record<string, unknown>) ?? '';
    assert.ok(second);
    const child = newTabMembers(await files(), second);
    const childAnswer = await call(child.members);
    allowed(childAnswer);
    sub = mintedTab(childAnswer as Record<string, unknown>) ?? '';
    assert.equal(await shape(), 'Tab 1 Tab 2(Tab 3)');
  });

  it('copies a tab with its content, right after it', async () => {
    const source = await server.post<DocTabResponse>('_api/doc/read', { tab: server.tab });
    const copy = duplicateMembers(await files(), server.tab, source.doc as unknown as DiskDoc);
    assert.ok(copy);
    assert.equal(copy.name, 'Tab 1 (copy)');
    const answer = await call(copy.members);
    allowed(answer);
    const id = mintedTab(answer as Record<string, unknown>);
    assert.ok(id);
    assert.equal(await shape(), 'Tab 1 Tab 1 (copy) Tab 2(Tab 3)');
    const copied = await server.post<DocTabResponse>('_api/doc/read', { tab: id });
    assert.deepEqual(texts(copied.doc as unknown as DiskDoc), texts(source.doc as unknown as DiskDoc));
  });

  it('renames a tab', async () => {
    allowed(await call([renameMember(second, 'Ideas')]));
    assert.equal(await shape(), 'Tab 1 Tab 1 (copy) Ideas(Tab 3)');
  });

  it('moves a tab into another and back out', async () => {
    const all = await files();
    const into = movePatch(all, server.tab, dropMove(tabTree(all), second, 'into')!);
    assert.ok(into);
    allowed(await call([moveMember(into)]));
    assert.equal(await shape(), 'Tab 1 (copy) Ideas(Tab 3 Tab 1)');
    const now = await files();
    const out = movePatch(now, server.tab, dropMove(tabTree(now), second, 'before')!);
    assert.ok(out);
    allowed(await call([moveMember(out)]));
    assert.equal(await shape(), 'Tab 1 (copy) Tab 1 Ideas(Tab 3)');
  });

  it('deletes a tab but keeps its subtabs, then deletes a tab with them', async () => {
    allowed(await call(deleteMembers(deletePlan(await files(), second, true))));
    // A kept subtab keeps its own key, so it sorts in among its new siblings by that key.
    assert.equal(await shape(), 'Tab 3 Tab 1 (copy) Tab 1');
    const all = await files();
    const nested = newTabMembers(all, sub);
    allowed(await call(nested.members));
    allowed(await call(deleteMembers(deletePlan(await files(), sub, false))));
    assert.equal(await shape(), 'Tab 1 (copy) Tab 1');
  });

  it('will not delete the last tab', async () => {
    const copy = (await files()).find(file => file.id !== server.tab)!;
    allowed(await call(deleteMembers(deletePlan(await files(), copy.id, false))));
    const refused = await call(deleteMembers(deletePlan(await files(), server.tab, false)));
    assert.equal(refused.verdict, 'deny');
    assert.equal(refused.verdict === 'deny' ? refused.reason : '', 'last_tab');
  });

  it('keeps the display choices', async () => {
    allowed(await call([displayMember('pageWidth', 'wide')]));
    allowed(await call([displayMember('headingFont', 'serif')]));
    allowed(await call([displayMember('tabsLocation', 'left')]));
    const display = (await project()).display;
    assert.equal(display?.pageWidth, 'wide');
    assert.equal(display?.headingFont, 'serif');
    assert.equal(display?.tabsLocation, 'left');
  });
});
