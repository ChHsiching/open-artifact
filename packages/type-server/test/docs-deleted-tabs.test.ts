/**
 * Deleted tabs: the list of them (name, when, by whom, subtabs deleted with them) and their restore, back to where they
 * were with the same id, body, history and comments; editors only; the agent told before comments are detached.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import type { Viewer } from '@open-artifact/runtime/capabilities';
import type { DocFrame } from '@open-artifact/runtime/doc-api';
import { runCall } from '../src/docs/calls.ts';
import { DocHost } from '../src/docs/host.ts';
import { docFromDisk, type DiskDoc } from '@open-artifact/docs-core';
import { type DeletedTabInfo, DocStore, FIRST_LINE_MAX, type Manifest, RESTORED_TAB_NAME, docDirOf, firstLineOf, scaffoldDoc } from '../src/docs/store.ts';

type Json = Record<string, unknown>;

const owner = { id: 'owner', name: 'Ada' };
const editor: Viewer = { id: 'guest-ed', name: 'Ed', role: 'editor' };
const commenter: Viewer = { id: 'guest-cy', name: 'Cy', role: 'commenter' };

/** A new artifact folder holding a blank doc. */
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

/** Adds tabs named `names` (in order) through the agent and answers their ids. */
function addTabs(store: DocStore, names: string[]): string[] {
  const outcome = agent(store, { tool: 'batch', batch: names.map((name) => ({ verb: 'create', object: 'file', payload: { birthName: name } })) });
  assert.equal(outcome.body.ok, true, JSON.stringify(outcome.body));
  return (outcome.body.acks as Json[]).map((ack) => String(ack.minted));
}

const nest = (store: DocStore, child: string, parent: string) => {
  const outcome = agent(store, { tool: 'update', ref: { object: 'project', id: store.id }, payload: { kind: 'patch', patch: [{ op: 'set', path: ['tabs', child, 'subtabOf'], value: parent }] } });
  assert.equal(outcome.body.ok, true, JSON.stringify(outcome.body));
};

const listed = (store: DocStore): DeletedTabInfo[] => {
  const outcome = agent(store, { tool: 'read', ref: { object: 'project' }, payload: { kind: 'deleted' } });
  assert.equal(outcome.body.ok, true, JSON.stringify(outcome.body));
  return outcome.body.deleted as DeletedTabInfo[];
};

const undelete = (store: DocStore, id: string) => agent(store, { tool: 'batch', batch: [{ verb: 'create', object: 'file', payload: { undelete: id } }] });

describe('deleted tabs', () => {
  let dir: string;
  let root: string;
  let store: DocStore;

  beforeEach(async () => {
    dir ??= await mkdtemp(join(tmpdir(), 'open-artifact-docs-deleted-'));
    root = await newDoc(dir);
    store = DocStore.open(docDirOf(root));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists a deleted tab with who deleted it and when, then restores it in its old place', () => {
    const [a, b, c] = addTabs(store, ['A', 'B', 'C']);
    const order = store.tab(b!).order;
    const node = store.tab(b!).node;
    const wrote = agent(store, { tool: 'update', ref: { object: 'node', id: b }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: 'Kept words.' } } }] } });
    assert.equal(wrote.body.ok, true, JSON.stringify(wrote.body));
    const versions = store.history(b!)?.versions.length ?? 0;

    assert.equal(agent(store, { tool: 'delete', ref: { object: 'file', id: b } }).body.ok, true);
    assert.equal(existsSync(join(docDirOf(root), 'tabs', '.deleted', `${b}.json`)), true);
    const [entry, ...rest] = listed(store);
    assert.equal(rest.length, 0);
    assert.equal(entry!.id, b);
    assert.equal(entry!.name, 'B');
    assert.equal(entry!.known, true);
    assert.equal(entry!.returnsTo, 'place');
    assert.deepEqual(entry!.by, { id: 'owner', name: 'Ada', agent: true });
    assert.ok(entry!.deletedAt && Number.isFinite(Date.parse(entry!.deletedAt)));
    assert.equal((agent(store, { tool: 'read' }).body as Json).deletedTabs, 1);

    const restored = undelete(store, b!);
    assert.equal(restored.body.ok, true, JSON.stringify(restored.body));
    const ack = (restored.body.acks as Json[])[0]!;
    assert.equal(ack.minted, b);
    assert.equal(ack.returnedTo, 'place');
    assert.deepEqual(ack.restored, [b]);
    assert.deepEqual(store.tabIds().slice(1), [a, b, c]);
    assert.equal(store.tab(b!).order, order);
    assert.equal(store.tab(b!).node, node);
    assert.equal(store.history(b!)?.versions.length ?? 0, versions);
    assert.match(String((agent(store, { tool: 'read', ref: { object: 'node', id: b }, payload: { kind: 'markdown' } }).body as Json).markdown), /Kept words\./);
    assert.deepEqual(listed(store), []);
    assert.equal((store.manifest as Manifest).deleted, undefined);

    const again = undelete(store, b!);
    assert.equal(again.body.ok, false);
    assert.equal(again.body.code, 'already_restored');
    assert.equal(undelete(store, 'nope').body.code, 'absent');
  });

  it('says each deleted tab\'s first line of text, and shows its content to the agent', async () => {
    const [a, b, c] = addTabs(store, ['A', 'B', 'C']);
    const write = (tab: string, markdown: string) => {
      const wrote = agent(store, { tool: 'update', ref: { object: 'node', id: tab }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: markdown } } }] } });
      assert.equal(wrote.body.ok, true, JSON.stringify(wrote.body));
    };
    write(a!, '\n\n- First   item\n- Second');
    write(b!, `# ${'Long words '.repeat(20)}`);
    for (const tab of [a, b, c]) assert.equal(agent(store, { tool: 'delete', ref: { object: 'file', id: tab } }).body.ok, true);
    const lines = Object.fromEntries(listed(store).map((entry) => [entry.id, entry.firstLine]));
    assert.equal(lines[a!], 'First item');
    assert.equal(lines[b!]!.length, FIRST_LINE_MAX);
    assert.ok(lines[b!]!.endsWith('…'));
    assert.equal(lines[c!], '');
    // The project's count of them does not read their files.
    assert.equal((agent(store, { tool: 'read' }).body as Json).deletedTabs, 3);

    const shown = agent(store, { tool: 'read', ref: { object: 'project' }, payload: { kind: 'deleted', id: a } });
    assert.equal(shown.body.ok, true, JSON.stringify(shown.body));
    assert.equal(shown.body.name, 'A');
    assert.match(String(shown.body.markdown), /First\s+item/);
    assert.equal(shown.body.doc, undefined);
    assert.equal(agent(store, { tool: 'read', ref: { object: 'project' }, payload: { kind: 'deleted', id: 'nope' } }).body.code, 'absent');
    assert.equal(store.deletedSnapshot(a!).blocks.length > 0, true);

    // A file that can't be read: listed with no line, its preview refused.
    const bin = join(docDirOf(root), 'tabs', '.deleted', `${c}.json`);
    await writeFile(bin, '{');
    assert.equal(listed(store).find((entry) => entry.id === c)!.firstLine, null);
    assert.equal(agent(store, { tool: 'read', ref: { object: 'project' }, payload: { kind: 'deleted', id: c } }).body.code, 'unreadable');
    assert.equal(undelete(store, a!).body.ok, true);
    assert.equal(agent(store, { tool: 'read', ref: { object: 'project' }, payload: { kind: 'deleted', id: a } }).body.code, 'absent');
  });

  it('keeps its place next to a tab that took its key since', () => {
    const [, b] = addTabs(store, ['A', 'B']);
    const order = store.tab(b!).order;
    agent(store, { tool: 'delete', ref: { object: 'file', id: b } });
    const [d] = addTabs(store, ['D']);
    agent(store, { tool: 'update', ref: { object: 'project', id: store.id }, payload: { kind: 'patch', patch: [{ op: 'set', path: ['tabs', d, 'order'], value: order }] } });
    assert.equal(undelete(store, b!).body.ok, true);
    const ids = store.tabIds();
    assert.equal(ids.indexOf(b!), ids.indexOf(d!) + 1);
    assert.ok(store.tab(b!).order > order);
  });

  it('brings back the subtabs deleted with a tab, and goes last when the tab it sat under is gone', () => {
    const [parent, child, grand, other] = addTabs(store, ['Parent', 'Child', 'Grandchild', 'Other']);
    nest(store, child!, parent!);
    nest(store, grand!, child!);
    // The page deletes a tab and its subtabs in one call, the tab first.
    const gone = agent(store, { tool: 'batch', batch: [parent, child, grand].map((id) => ({ verb: 'delete', ref: { object: 'file', id } })) });
    assert.equal(gone.body.ok, true, JSON.stringify(gone.body));
    const list = listed(store);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, parent);
    assert.equal(list[0]!.subtabs[0]!.id, child);
    assert.equal(list[0]!.subtabs[0]!.subtabs[0]!.id, grand);

    const back = undelete(store, parent!);
    assert.deepEqual((back.body.acks as Json[])[0]!.restored, [parent, child, grand]);
    assert.equal(store.tab(child!).subtabOf, parent);
    assert.equal(store.tab(grand!).subtabOf, child);

    // A subtab deleted on its own, whose tab goes after: it comes back last, at the top level.
    agent(store, { tool: 'delete', ref: { object: 'file', id: grand } });
    agent(store, { tool: 'delete', ref: { object: 'file', id: child } });
    const entries = listed(store);
    assert.deepEqual(entries.map((entry) => entry.id).sort(), [child, grand].sort());
    assert.equal(entries.find((entry) => entry.id === grand)!.returnsTo, 'end');
    assert.equal(entries.find((entry) => entry.id === child)!.parent?.id, parent);
    const last = undelete(store, grand!);
    assert.equal((last.body.acks as Json[])[0]!.returnedTo, 'end');
    assert.equal(store.tabIds().at(-1), grand);
    assert.equal(store.tab(grand!).subtabOf, undefined);
    assert.ok(store.tab(grand!).order > store.tab(other!).order);
  });

  it('puts back under it the subtabs its delete moved up a level', () => {
    const [parent, child] = addTabs(store, ['Parent', 'Child']);
    nest(store, child!, parent!);
    agent(store, { tool: 'delete', ref: { object: 'file', id: parent } });
    assert.equal(store.tab(child!).subtabOf, undefined);
    assert.equal(listed(store)[0]!.subtabs.length, 0);
    undelete(store, parent!);
    assert.equal(store.tab(child!).subtabOf, parent);
  });

  it('restores a tab deleted before the doc kept names, last, named for a restore', async () => {
    const [b] = addTabs(store, ['B']);
    agent(store, { tool: 'delete', ref: { object: 'file', id: b } });
    // Before the doc kept a record: the content file alone.
    const manifestFile = join(docDirOf(root), 'doc.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as Manifest;
    delete manifest.deleted;
    await writeFile(manifestFile, JSON.stringify(manifest));
    store = DocStore.open(docDirOf(root));
    const [entry] = listed(store);
    assert.equal(entry!.known, false);
    assert.equal(entry!.name, RESTORED_TAB_NAME);
    assert.equal(entry!.deletedAt, null);
    assert.equal(entry!.returnsTo, 'end');
    assert.equal(undelete(store, b!).body.ok, true);
    assert.equal(store.tab(b!).name, RESTORED_TAB_NAME);
    assert.equal(store.tabIds().at(-1), b);
  });

  it('rolls a refused batch back, restore and all', () => {
    const [b] = addTabs(store, ['B']);
    agent(store, { tool: 'delete', ref: { object: 'file', id: b } });
    const refused = agent(store, { tool: 'batch', batch: [{ verb: 'create', object: 'file', payload: { undelete: b } }, { verb: 'update', ref: { object: 'file', id: 'nope' }, payload: {} }] });
    assert.equal(refused.body.ok, false);
    store = DocStore.open(docDirOf(root));
    assert.equal(store.manifest.tabs[b!], undefined);
    assert.equal(listed(store)[0]!.id, b);
    assert.equal(existsSync(join(docDirOf(root), 'tabs', '.deleted', `${b}.json`)), true);
  });

  it('asks the agent to allow detaching the comments on a tab it deletes', async () => {
    const [b] = addTabs(store, ['B']);
    const thread = { id: 't1', anchor: JSON.stringify({ tab: b }), label: '', location: { tab: b }, status: 'open', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', messages: [] };
    await writeFile(join(root, 'comments.json'), JSON.stringify({ version: 1, threads: [thread] }));
    const refused = agent(store, { tool: 'delete', ref: { object: 'file', id: b } });
    assert.equal(refused.body.ok, false);
    assert.equal(refused.body.code, 'anchors_affected');
    assert.ok(store.manifest.tabs[b!]);
    const allowed = agent(store, { tool: 'delete', ref: { object: 'file', id: b }, payload: { allowDetach: true } });
    assert.equal(allowed.body.ok, true, JSON.stringify(allowed.body));
    // The thread is left as it was: the restored tab has the same id, so it hangs there again.
    assert.equal(undelete(store, b!).body.ok, true);
    assert.match(await readFile(join(root, 'comments.json'), 'utf8'), new RegExp(`"tab\\\\":\\\\"${b}`));
  });
});

describe('deleted tabs from the page', () => {
  let dir: string;
  let root: string;
  let host: DocHost;
  const frames: { frame: DocFrame; except: string | undefined }[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-docs-deleted-page-'));
    root = await newDoc(dir);
    frames.length = 0;
    host = new DocHost({ root, owner, emit: (frame, except) => frames.push({ frame, except }), log: () => {} });
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists and restores for editors, tells every page, and refuses others', () => {
    const page = host.session('page-a', editor);
    assert.ok(page.sess);
    const made = host.call({ sess: page.sess!, batch: [{ verb: 'create', object: 'file', payload: { birthName: 'Notes' } }] }, 'page-a', editor);
    assert.equal(made.verdict, 'allow', JSON.stringify(made));
    const tab = String(((made as Json).acks as Json[])[0]!.minted);
    const gone = host.call({ sess: page.sess!, member: { verb: 'delete', ref: { object: 'file', id: tab } } }, 'page-a', editor);
    assert.equal(gone.verdict, 'allow', JSON.stringify(gone));

    const list = host.call({ sess: page.sess!, member: { verb: 'read', object: 'project', payload: { kind: 'deleted' } } }, 'page-a', editor);
    assert.equal(list.verdict, 'allow');
    const deleted = ((list as Json).value as { deleted: DeletedTabInfo[] }).deleted;
    assert.equal(deleted[0]!.id, tab);
    assert.deepEqual(deleted[0]!.by, { id: 'guest-ed', name: 'Ed' });

    host.session('page-c', commenter);
    const peek = host.call({ sess: '', member: { verb: 'read', object: 'project', payload: { kind: 'deleted' } } }, 'page-c', commenter);
    assert.equal(peek.verdict === 'deny' && peek.reason, 'not_writer');
    const steal = host.call({ sess: '', member: { verb: 'create', object: 'file', payload: { undelete: tab } } }, 'page-c', commenter);
    assert.equal(steal.verdict === 'deny' && steal.reason, 'not_writer');
    assert.equal(host.store.manifest.tabs[tab], undefined);

    frames.length = 0;
    const back = host.call({ sess: page.sess!, member: { verb: 'create', object: 'file', payload: { undelete: tab } } }, 'page-a', editor);
    assert.equal(back.verdict, 'allow', JSON.stringify(back));
    assert.equal((back as Json).minted, tab);
    const project = frames.find(({ frame }) => frame.kind === 'project');
    assert.ok(project, 'a project frame');
    assert.equal(project.except, undefined, 'every page hears of it, the restoring one too');
    assert.ok(project.frame.kind === 'project' && project.frame.project.files.some((file) => file.id === tab));

    const twice = host.call({ sess: page.sess!, member: { verb: 'create', object: 'file', payload: { undelete: tab } } }, 'page-a', editor);
    assert.equal(twice.verdict === 'deny' && twice.reason, 'already_restored');
  });

  it('shows editors a deleted tab\'s content as it was, and refuses others', () => {
    const page = host.session('page-a', editor);
    const made = host.call({ sess: page.sess!, batch: [{ verb: 'create', object: 'file', payload: { birthName: 'Notes' } }] }, 'page-a', editor);
    const tab = String(((made as Json).acks as Json[])[0]!.minted);
    const wrote = runCall(host.store, { tool: 'update', ref: { object: 'node', id: tab }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: 'Gone words.' } } }] } }, owner);
    assert.equal(wrote.body.ok, true, JSON.stringify(wrote.body));
    assert.equal(host.call({ sess: page.sess!, member: { verb: 'delete', ref: { object: 'file', id: tab } } }, 'page-a', editor).verdict, 'allow');

    const list = host.call({ sess: page.sess!, member: { verb: 'read', object: 'project', payload: { kind: 'deleted' } } }, 'page-a', editor);
    assert.equal(((list as Json).value as { deleted: DeletedTabInfo[] }).deleted[0]!.firstLine, 'Gone words.');
    // Read without a writing session too: the page asks before it takes one.
    const shown = host.call({ sess: '', member: { verb: 'read', object: 'project', payload: { kind: 'deleted', id: tab } } }, 'page-a', editor);
    assert.equal(shown.verdict, 'allow', JSON.stringify(shown));
    const value = (shown as Json).value as { id: string; name: string; doc: DiskDoc; markdown?: string };
    assert.equal(value.id, tab);
    assert.equal(value.name, 'Notes');
    assert.equal(value.markdown, undefined);
    assert.equal(firstLineOf(docFromDisk(value.doc)), 'Gone words.');

    host.session('page-c', commenter);
    const peek = host.call({ sess: '', member: { verb: 'read', object: 'project', payload: { kind: 'deleted', id: tab } } }, 'page-c', commenter);
    assert.equal(peek.verdict === 'deny' && peek.reason, 'not_writer');
  });

  it('brings a deleted tab\'s words back as a new tab when asked, leaving it in the list', () => {
    const page = host.session('page-a', editor);
    const made = host.call({ sess: page.sess!, batch: [{ verb: 'create', object: 'file', payload: { birthName: 'Notes' } }] }, 'page-a', editor);
    const tab = String(((made as Json).acks as Json[])[0]!.minted);
    const node = host.store.tab(tab).node;
    const wrote = runCall(host.store, { tool: 'update', ref: { object: 'node', id: node }, payload: { ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: 'Copied words.' } } }] } }, owner);
    assert.equal(wrote.body.ok, true, JSON.stringify(wrote.body));
    const before = host.store.doc(tab).blocks.map((block) => block.id);
    assert.equal(host.call({ sess: page.sess!, member: { verb: 'delete', ref: { object: 'file', id: tab } } }, 'page-a', editor).verdict, 'allow');

    const copy = host.call({ sess: page.sess!, member: { verb: 'create', object: 'file', payload: { copyOf: tab } } }, 'page-a', editor);
    assert.equal(copy.verdict, 'allow', JSON.stringify(copy));
    const minted = String((copy as Json).minted);
    assert.notEqual(minted, tab);
    assert.equal(host.store.tab(minted).name, 'Notes');
    const blocks = host.store.doc(minted).blocks;
    assert.equal(firstLineOf(host.store.doc(minted)), 'Copied words.');
    assert.equal(blocks.some((block) => before.includes(block.id)), false);
    // The deleted tab stays, with its comments and history, for a restore of its own.
    assert.equal(host.store.deletedTabs().some((entry) => entry.id === tab), true);

    const missing = host.call({ sess: page.sess!, member: { verb: 'create', object: 'file', payload: { copyOf: 'nope00000000' } } }, 'page-a', editor);
    assert.equal(missing.verdict === 'deny' && missing.reason, 'absent');
    host.session('page-c', commenter);
    const refused = host.call({ sess: '', member: { verb: 'create', object: 'file', payload: { copyOf: tab } } }, 'page-c', commenter);
    assert.equal(refused.verdict === 'deny' && refused.reason, 'not_writer');
  });

  it('names the people on versions and suggestions, not their ids', () => {
    const page = host.session('page-a', editor);
    assert.equal(page.people?.[editor.id], 'Ed');
    const tab = host.store.tabIds()[0]!;
    const node = host.store.tab(tab).node;
    const first = host.store.doc(tab).blocks[0]!.id;
    const wrote = host.call({ sess: page.sess!, member: { verb: 'update', ref: { object: 'node', id: node }, payload: { ops: [{ op: 'insert', target: { kind: 'blocks', ids: [first] }, side: 'after', source: { markdown: 'Ed wrote this.' }, ids: [`${page.sess}.${page.next}`] }] } } }, 'page-a', editor);
    assert.equal(wrote.verdict, 'allow', JSON.stringify(wrote));
    const human = host.history(tab).versions.find((version) => version.by === 'human');
    assert.equal(human?.user, editor.id);
    assert.equal(human?.name, 'Ed');
    // Kept with the doc: a new server knows the name too.
    const again = new DocHost({ root, owner, emit: () => {}, log: () => {} });
    assert.equal(again.history(tab).versions.find((version) => version.by === 'human')?.name, 'Ed');
    assert.equal(again.people.nameOf(editor.id), 'Ed');
  });

  it('lets the page delete a tab with comments on it (its dialog warned)', async () => {
    const page = host.session('page-a', editor);
    const made = host.call({ sess: page.sess!, batch: [{ verb: 'create', object: 'file', payload: { birthName: 'Notes' } }] }, 'page-a', editor);
    const tab = String(((made as Json).acks as Json[])[0]!.minted);
    await writeFile(join(root, 'comments.json'), JSON.stringify({ version: 1, threads: [{ id: 't1', anchor: JSON.stringify({ tab }), label: '', location: {}, status: 'open', createdAt: '', updatedAt: '', messages: [] }] }));
    const gone = host.call({ sess: page.sess!, member: { verb: 'delete', ref: { object: 'file', id: tab } } }, 'page-a', editor);
    assert.equal(gone.verdict, 'allow', JSON.stringify(gone));
    // A content file moved away by hand is no longer listed.
    await rename(join(docDirOf(root), 'tabs', '.deleted', `${tab}.json`), join(dir, 'moved.json'));
    const list = host.call({ sess: page.sess!, member: { verb: 'read', object: 'project', payload: { kind: 'deleted' } } }, 'page-a', editor);
    assert.deepEqual(((list as Json).value as { deleted: unknown[] }).deleted, []);
  });
});
