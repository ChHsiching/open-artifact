/**
 * A doc an owner locked (nobody can change it until an owner unlocks it; the open pages hear the lock at once), and the
 * size limits of one tab (a write that would leave it over one is refused, a write that shrinks it is not).
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import type { Viewer } from '@open-artifact/runtime/capabilities';
import type { DocCallAnswer, DocFrame, DocProject } from '@open-artifact/runtime/doc-api';
import { runCall } from '../src/docs/calls.ts';
import { DocHost } from '../src/docs/host.ts';
import { DocStore, LOCKED_WORDS, TAB_LIMITS, docDirOf, scaffoldDoc, tabSize, tabTooLarge } from '../src/docs/store.ts';

type Json = Record<string, unknown>;

const owner = { id: 'owner', name: 'Ada' };
const ownerViewer: Viewer = { id: 'owner', name: 'Ada', role: 'owner' };
const editor: Viewer = { id: 'guest-ed', name: 'Ed', role: 'editor' };

async function newDoc(dir: string): Promise<string> {
  const root = await mkdtemp(join(dir, 'doc-'));
  for (const [file, text] of Object.entries(scaffoldDoc('Plan'))) {
    const at = join(docDirOf(root), file);
    await mkdir(join(at, '..'), { recursive: true });
    await writeFile(at, text);
  }
  return root;
}

const agent = (store: DocStore, call: Json) => runCall(store, call, owner);
const appendMarkdown = (store: DocStore, markdown: string) =>
  agent(store, { tool: 'update', ref: { object: 'node', id: '' }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: markdown } } }] } });
const lockCall = (store: DocStore, note?: string) =>
  agent(store, { tool: 'update', ref: { object: 'project', id: store.id }, payload: { kind: 'patch', patch: [{ op: 'set', path: ['locked'], ...(note ? { value: { note } } : {}) }] } });
const unlockCall = (store: DocStore) => agent(store, { tool: 'update', ref: { object: 'project', id: store.id }, payload: { kind: 'patch', patch: [{ op: 'delete', path: ['locked'] }] } });

describe('a locked doc', () => {
  let dir: string;
  let root: string;
  let store: DocStore;

  beforeEach(async () => {
    dir ??= await mkdtemp(join(tmpdir(), 'open-artifact-docs-lock-'));
    root = await newDoc(dir);
    store = DocStore.open(docDirOf(root));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses every agent write until the owner unlocks it, and reads say who locked it', () => {
    assert.equal(appendMarkdown(store, 'Before.').body.ok, true);
    const locked = lockCall(store, 'Final draft');
    assert.equal(locked.body.ok, true, JSON.stringify(locked.body));
    assert.equal(locked.changes?.project, true);
    const read = agent(store, { tool: 'read' });
    assert.deepEqual((read.body.locked as Json).by, { id: 'owner', name: 'Ada' });
    assert.equal((read.body.locked as Json).note, 'Final draft');

    for (const call of [
      { tool: 'update', ref: { object: 'node', id: '' }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: 'No.' } } }] } },
      { tool: 'create', object: 'file', payload: { birthName: 'More' } },
      { tool: 'update', ref: { object: 'project', id: store.id }, payload: { kind: 'patch', patch: [{ op: 'set', path: ['name'], value: 'Renamed' }] } },
      { tool: 'batch', batch: [{ verb: 'update', object: 'project', payload: { kind: 'patch', patch: [{ op: 'delete', path: ['locked'] }, { op: 'set', path: ['name'], value: 'Sneaky' }] } }] },
    ]) {
      const refused = agent(store, call);
      assert.equal(refused.body.ok, false, JSON.stringify(call));
      assert.equal(refused.body.code, 'locked');
      assert.equal(refused.body.message, LOCKED_WORDS);
    }
    assert.equal(store.manifest.name, 'Plan');
    assert.ok(store.manifest.locked);

    const unlocked = unlockCall(store);
    assert.equal(unlocked.body.ok, true, JSON.stringify(unlocked.body));
    assert.equal(store.manifest.locked, undefined);
    assert.equal(appendMarkdown(store, 'After.').body.ok, true);
  });

  it('lets only the owner lock and unlock from the page; refuses page writes and restores while locked; tells every page', () => {
    const frames: DocFrame[] = [];
    const host = new DocHost({ root, owner, emit: (frame) => frames.push(frame), log: () => {} });
    const tab = host.store.tabIds()[0]!;
    const node = host.store.tab(tab).node;
    const ed = host.session('page-ed', editor);
    const own = host.session('page-own', ownerViewer);
    const lockMember = (op: 'set' | 'delete') => ({ verb: 'update', object: 'project', payload: { kind: 'patch', patch: [{ op, path: ['locked'] }] } }) as never;

    const notOwner = host.call({ sess: ed.sess!, member: lockMember('set') }, 'page-ed', editor) as DocCallAnswer & Json;
    assert.equal(notOwner.verdict, 'deny');
    assert.equal(notOwner.reason, 'not_owner');

    const lock = host.call({ sess: own.sess!, member: lockMember('set') }, 'page-own', ownerViewer) as DocCallAnswer & Json;
    assert.equal(lock.verdict, 'allow', JSON.stringify(lock));
    const heard = frames.filter((frame): frame is DocFrame & { kind: 'project'; project: DocProject } => frame.kind === 'project').at(-1);
    assert.equal(heard?.project.locked?.by.name, 'Ada');
    assert.equal(host.session('page-late', editor).project.locked?.by.id, 'owner');

    const typed = host.call({ sess: ed.sess!, opId: 'w1', member: { verb: 'update', ref: { object: 'node', id: node }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'blocks', from: { kind: 'inline', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No' }] }] } } }] } } as never }, 'page-ed', editor) as DocCallAnswer & Json;
    assert.equal(typed.verdict, 'deny');
    assert.equal(typed.reason, 'locked');
    assert.equal(typed.detail, LOCKED_WORDS);
    const renamed = host.call({ sess: ed.sess!, member: { verb: 'update', object: 'project', payload: { kind: 'patch', patch: [{ op: 'set', path: ['name'], value: 'X' }] } } as never }, 'page-ed', editor) as DocCallAnswer & Json;
    assert.equal(renamed.reason, 'locked');
    assert.throws(() => host.restore(tab, 1, undefined, editor), (error: Error & { code?: string }) => error.code === 'locked');
    const agentWrite = host.agentCall({ tool: 'create', object: 'file', payload: { birthName: 'More' } });
    assert.equal(agentWrite.body.code, 'locked');

    const unlockByEditor = host.call({ sess: ed.sess!, member: lockMember('delete') }, 'page-ed', editor) as DocCallAnswer & Json;
    assert.equal(unlockByEditor.reason, 'not_owner');
    const unlock = host.call({ sess: own.sess!, member: lockMember('delete') }, 'page-own', ownerViewer) as DocCallAnswer & Json;
    assert.equal(unlock.verdict, 'allow');
    const last = frames.filter((frame): frame is DocFrame & { kind: 'project'; project: DocProject } => frame.kind === 'project').at(-1);
    assert.equal(last?.project.locked, undefined);
  });
});

describe('the size of a tab', () => {
  let dir: string;
  let store: DocStore;
  const saved = { ...TAB_LIMITS };

  beforeEach(async () => {
    dir ??= await mkdtemp(join(tmpdir(), 'open-artifact-docs-size-'));
    store = DocStore.open(docDirOf(await newDoc(dir)));
  });

  afterEach(() => Object.assign(TAB_LIMITS, saved));

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('counts blocks at every depth and the UTF-8 bytes of the text', () => {
    assert.equal(appendMarkdown(store, '- one\n- two é\n\n> 字').body.ok, true);
    const size = tabSize(store.doc(store.tabIds()[0]!));
    assert.equal(size.textBytes, 'one'.length + 'two é'.length + 1 + 3);
    // The blank paragraph, a list with two items each holding a paragraph, a quote holding one.
    assert.equal(size.blocks, 1 + 1 + 2 * 2 + 2);
  });

  it('20,000 blocks and 2 MB of text', () => {
    assert.deepEqual(saved, { blocks: 20_000, textBytes: 2 * 1024 * 1024 });
    const big = { rev: 1, blocks: [{ id: 'a.0', type: 'paragraph' as const, inline: Array.from({ length: 2 * 1024 * 1024 + 1 }, (_, n) => ({ id: `a.${n + 1}`, ch: 'x' })) }] };
    assert.match(tabTooLarge(null, big)!.message, /^this document is at its size limit \(2 MB of text\); nothing was added — remove something or start a new document$/);
  });

  it('refuses an agent write that would leave the tab over a limit, and takes one that shrinks it', () => {
    TAB_LIMITS.textBytes = 40;
    const refused = appendMarkdown(store, 'x'.repeat(41));
    assert.equal(refused.body.ok, false);
    assert.equal(refused.body.code, 'doc_too_large');
    assert.match(String(refused.body.message), /this document is at its size limit \(1 KB of text\); nothing was added — remove something or start a new document/);
    assert.deepEqual(refused.body.data, { dim: 'doc_text_bytes', limit: 40, got: 41 });
    assert.equal(store.doc(store.tabIds()[0]!).rev, 1);

    assert.equal(appendMarkdown(store, 'y'.repeat(30)).body.ok, true);
    TAB_LIMITS.textBytes = 10;
    // Over the limit now, but deleting makes room.
    const doc = store.doc(store.tabIds()[0]!);
    const last = doc.blocks.at(-1)!;
    const shrink = agent(store, { tool: 'update', ref: { object: 'node', id: '' }, payload: { ops: [{ op: 'delete', target: { kind: 'chars', range: [last.inline![0]!.id, last.inline![19]!.id] } }] } });
    assert.equal(shrink.body.ok, true, JSON.stringify(shrink.body));

    TAB_LIMITS.blocks = 3;
    const many = appendMarkdown(store, 'a\n\nb\n\nc');
    assert.equal(many.body.code, 'doc_too_large');
    assert.equal((many.body.data as Json).dim, 'doc_blocks');
    assert.match(String(many.body.message), /\(3 blocks\)/);
  });

  it('refuses a page write over the limit with the same words, keeping the session’s ids', async () => {
    const root = await newDoc(dir);
    const host = new DocHost({ root, owner, emit: () => {}, log: () => {} });
    const node = host.store.tab(host.store.tabIds()[0]!).node;
    const page = host.session('page-ed', editor);
    TAB_LIMITS.textBytes = 5;
    const insert = (text: string, opId: string) =>
      host.call({ sess: page.sess!, opId, member: { verb: 'update', ref: { object: 'node', id: node }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'blocks', from: { kind: 'inline', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } } }] } } as never }, 'page-ed', editor) as DocCallAnswer & Json;
    const before = host.store.session(page.sess!)!.next;
    const answer = insert('too long', 'w1');
    assert.equal(answer.verdict, 'deny');
    assert.equal(answer.reason, 'doc_too_large');
    assert.match(String(answer.detail), /size limit/);
    assert.equal(host.store.session(page.sess!)!.next, before);
    assert.equal(insert('ok', 'w2').verdict, 'allow');
  });

  it('refuses a strict page write made for another rev', async () => {
    const root = await newDoc(dir);
    const host = new DocHost({ root, owner, emit: () => {}, log: () => {} });
    const node = host.store.tab(host.store.tabIds()[0]!).node;
    const page = host.session('page-ed', editor);
    const member = (ifRev: number) => ({ verb: 'update', ref: { object: 'node', id: node }, payload: { strict: true, ifRev, ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'blocks', from: { kind: 'inline', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] } } }] } }) as never;
    const stale = host.call({ sess: page.sess!, opId: 's1', member: member(7) }, 'page-ed', editor) as DocCallAnswer & Json;
    assert.equal(stale.reason, 'guard_mismatch');
    const fresh = host.call({ sess: page.sess!, opId: 's2', member: member(1) }, 'page-ed', editor) as DocCallAnswer & Json;
    assert.equal(fresh.verdict, 'allow', JSON.stringify(fresh));
  });
});
