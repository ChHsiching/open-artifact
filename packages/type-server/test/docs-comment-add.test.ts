/**
 * The agent starting a comment thread on a doc (`comment-add`): on words of a tab as the tab has them (found again when
 * case and spaces differ, refused when they stand in more than one place until `--nth` or `--block` picks one), on a
 * suggestion's words, or on the tab as a whole; the thread is in `comments.json` in the shape the page writes.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { CommentStore } from '@open-artifact/server-sdk/comments';
import { runCall } from '../src/docs/calls.ts';
import { CommentTargetError, WHOLE_TAB_LABEL, docCommentTarget } from '../src/docs/comment-target.ts';
import { DocStore, docDirOf, scaffoldDoc } from '../src/docs/store.ts';
import { cmdCommentAdd } from '../src/comments-cli.ts';

type Json = Record<string, unknown>;

const owner = { id: 'owner', name: 'Ada' };

async function newDoc(dir: string): Promise<string> {
  const root = await mkdtemp(join(dir, 'doc-'));
  for (const [file, text] of Object.entries(scaffoldDoc('Plan'))) {
    const at = join(docDirOf(root), file);
    await mkdir(join(at, '..'), { recursive: true });
    await writeFile(at, text);
  }
  return root;
}

const markdownOp = (markdown: string) => ({ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: markdown } } });

function refusal(run: () => unknown): CommentTargetError {
  try {
    run();
  } catch (error) {
    if (error instanceof CommentTargetError) return error;
    throw error;
  }
  assert.fail('expected a refusal');
}

/** Runs `comment-add` and gives back what it printed and its exit code. */
async function commentAdd(positional: string[], flags: Record<string, string>): Promise<{ code: number; out: Json | null; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]) => void out.push(args.join(' '));
  console.error = (...args: unknown[]) => void err.push(args.join(' '));
  try {
    const code = await cmdCommentAdd(positional, new Map(Object.entries(flags)));
    return { code, out: out.length ? (JSON.parse(out.join('\n')) as Json) : null, err: err.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe('the agent starts a comment on a doc', () => {
  let dir: string;
  let root: string;
  let store: DocStore;
  let tab: string;

  beforeEach(async () => {
    dir ??= await mkdtemp(join(tmpdir(), 'open-artifact-docs-comment-add-'));
    root = await newDoc(dir);
    store = DocStore.open(docDirOf(root));
    tab = store.tabIds()[0]!;
    runCall(store, { tool: 'update', ref: { object: 'node', id: '' }, payload: { ops: [markdownOp('Ship the connector to every workspace by Sep 29.\n\nThe plan is firm.\n\n- The plan is firm.')] } }, owner);
  });

  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('hangs on the words as the tab has them, with the paragraph for context', () => {
    const target = docCommentTarget(root, { on: 'every workspace' });
    const anchor = JSON.parse(target.anchor) as { tab: string; range: [string, string] };
    assert.equal(anchor.tab, tab);
    const block = store.doc(tab).blocks.find(b => b.inline?.some(item => item.id === anchor.range[0]))!;
    const ids = block.inline!.map(item => item.id);
    const from = ids.indexOf(anchor.range[0]);
    const to = ids.indexOf(anchor.range[1]);
    assert.equal(block.inline!.slice(from, to + 1).map(item => ('ch' in item ? item.ch : '')).join(''), 'every workspace');
    assert.equal(target.label, 'every workspace');
    assert.equal(target.detail, 'On “every workspace” in: Ship the connector to every workspace by Sep 29.');
    assert.deepEqual(target.location, { tab, block: block.id });
  });

  it('finds the words again when their case or spaces differ', () => {
    const target = docCommentTarget(root, { on: 'EVERY   workspace' });
    assert.equal(target.label, 'every workspace');
  });

  it('refuses words that are not there, and words in more than one place until one is picked', () => {
    assert.equal(refusal(() => docCommentTarget(root, { on: 'every team' })).code, 'not_found');
    const twice = refusal(() => docCommentTarget(root, { on: 'The plan is firm' }));
    assert.equal(twice.code, 'ambiguous');
    const places = twice.data.places as Array<{ nth: number; block: string }>;
    assert.equal(places.length, 2);
    const second = docCommentTarget(root, { on: 'The plan is firm', nth: 2 });
    assert.equal((second.location as Json).block, places[1]!.block);
    // The list holding the second one names it too.
    const list = store.doc(tab).blocks.find(block => block.children?.length)!;
    assert.equal((docCommentTarget(root, { on: 'The plan is firm', block: list.id }).location as Json).block, places[1]!.block);
    assert.equal(refusal(() => docCommentTarget(root, { on: 'The plan is firm', nth: 3 })).code, 'not_found');
  });

  it('notes the tab as a whole when no words are given', () => {
    const target = docCommentTarget(root, {});
    assert.deepEqual(JSON.parse(target.anchor), { tab });
    assert.equal(target.label, WHOLE_TAB_LABEL);
    assert.equal(refusal(() => docCommentTarget(root, { nth: 1 })).code, 'bad_target');
    assert.equal(refusal(() => docCommentTarget(root, { tab: 'No such tab' })).code, 'bad_tab');
  });

  it('hangs on a suggestion’s words', () => {
    const answer = runCall(
      store,
      { tool: 'update', ref: { object: 'node', id: '' }, payload: { suggest: true, ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: 'A new closing line.' } } }] } },
      owner,
    ) as unknown as Json;
    assert.notEqual(answer.ok, false, JSON.stringify(answer));
    const fresh = DocStore.open(docDirOf(root));
    const id = Object.keys(fresh.doc(tab).suggestions ?? {})[0]!;
    assert.ok(id, 'the suggestion is open');
    const target = docCommentTarget(root, { suggestion: id });
    assert.equal(target.label, 'A new closing line.');
    assert.equal(target.detail, 'On a suggestion to add “A new closing line.”');
    assert.equal((target.location as Json).suggestion, id);
    assert.equal(refusal(() => docCommentTarget(root, { suggestion: 'sg_nope' })).code, 'not_found');
  });

  it('comment-add writes the thread as the agent, in the page’s shape', async () => {
    const done = await commentAdd([root, 'Which', 'workspaces', 'first?'], { on: 'every workspace' });
    assert.equal(done.code, 0, done.err);
    const thread = new CommentStore(root).threads().find(item => item.id === done.out!.created)!;
    assert.equal(thread.label, 'every workspace');
    assert.equal(thread.messages[0]!.author.kind, 'agent');
    assert.equal(thread.messages[0]!.text, 'Which workspaces first?');
    assert.equal(JSON.parse(thread.anchor).tab, tab);

    const ambiguous = await commentAdd([root, 'Why?'], { on: 'The plan is firm' });
    assert.equal(ambiguous.code, 1);
    assert.equal(ambiguous.out!.code, 'ambiguous');
    assert.equal(new CommentStore(root).threads().length, 1);

    const empty = await commentAdd([root, '  '], { on: 'every workspace' });
    assert.equal(empty.code, 1);
    assert.match(empty.err, /empty/);
  });
});
