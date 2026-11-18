import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type DiskDoc, type DocState, isAtom, proposalIds, type Session } from '@open-artifact/docs-core';
import type { DocSessionResponse, DocTabResponse } from '@open-artifact/runtime/doc-api';
import { Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { pmDocOf, posOfIdPlace } from '../src/editor/binding.ts';
import { schema } from '../src/editor/schema.ts';
import {
  type Plan,
  type PlanContext,
  REFUSALS,
  flattenSlice,
  intentOf,
  planDeleteChar,
  planEnter,
  planInsert,
  planRemove,
  textContent,
} from '../src/suggest/typing.ts';
import { type DocServer, type Page, startDocServer, texts } from './harness.ts';

// Suggesting mode's edits, worked out against the tab and written by a page: what the server keeps, and whose it is.

let fresh = 0;

/** The editor over a page's tab: its state, and the caret a plan leaves. */
class Typist {
  readonly page: Page;
  readonly started = new Set<string>();
  caret = 0;
  constructor(page: Page) {
    this.page = page;
  }
  get shadow(): DocState {
    return this.page.sync.shadow;
  }
  get state(): EditorState {
    return EditorState.create({ doc: pmDocOf(this.shadow) });
  }
  get ctx(): PlanContext {
    const session = (this.page.sync as unknown as { session: Session }).session;
    return {
      state: this.state,
      shadow: this.shadow,
      mine: id => this.started.has(id),
      take: count => Array.from({ length: count }, (_, index) => `${session.sess}.${session.next + index}`),
      fresh: () => {
        const id = `sg_test${++fresh}`;
        this.started.add(id);
        return id;
      },
    };
  }
  /** Position in text block `index` (top-level, or the first text block inside it) at `offset`. */
  at(index: number, offset = 0): number {
    const doc = this.state.doc;
    let pos = 0;
    for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
    let inner = pos + 1;
    while (!doc.resolve(inner).parent.isTextblock) inner++;
    return inner + offset;
  }
  run(plan: Plan | null): Plan | null {
    assert.ok(plan);
    if (plan.kind === 'write') this.page.sync.write(plan.ops);
    if (plan.kind !== 'refuse') {
      const caret = plan.caret;
      const pos = 'bid' in caret ? posOfIdPlace(this.state.doc, this.shadow, caret) : caret.near;
      assert.notEqual(pos, null, 'the caret has a place');
      this.caret = pos!;
    }
    return plan;
  }
  type(text: string): Plan | null {
    let last: Plan | null = null;
    for (const ch of text) last = this.run(planInsert(this.ctx, this.caret, this.caret, textContent(ch)));
    return last;
  }
}

/** The block's text with additions in [] and struck words in {}. */
function marked(doc: DocState, index: number): string {
  let out = '';
  let open = '';
  for (const item of doc.blocks[index]!.inline ?? []) {
    const op = item.suggest?.op ?? '';
    if (op !== open) {
      out += open === 'ins' ? ']' : open === 'del' ? '}' : '';
      out += op === 'ins' ? '[' : op === 'del' ? '{' : '';
      open = op;
    }
    out += isAtom(item) ? '¶' : item.ch;
  }
  return out + (open === 'ins' ? ']' : open === 'del' ? '}' : '');
}

describe('Suggesting mode’s edits', () => {
  let doc: DocServer;
  let me: string;

  before(async () => {
    doc = await startDocServer('# Notes\n\nThe quick fox.\n\n- one\n- two');
    me = (await doc.post<DocSessionResponse>('_api/doc/session', { client: 'who' })).me.id;
  });

  after(() => doc.stop());

  it('a burst of typing is one addition, recorded on the server as the person’s', async () => {
    const page = await doc.open('typing');
    const typist = new Typist(page);
    typist.caret = typist.at(1, 'The quick'.length);
    typist.type(' brown');
    assert.equal(marked(typist.shadow, 1), 'The quick[ brown] fox.');
    const ids = proposalIds(typist.shadow.blocks);
    assert.equal(ids.length, 1, 'one suggestion for the burst');
    await doc.settle(page);
    const held = (await doc.post<DocTabResponse>('_api/doc/read', { tab: doc.tab })).doc as unknown as DiskDoc;
    assert.equal(held.suggestions?.[ids[0]!]?.by, me);
    assert.equal(held.suggestions?.[ids[0]!]?.via, undefined);
    // The text stays as it was until someone accepts.
    assert.deepEqual((await doc.serverTexts()).slice(1, 2), ['The quick brown fox.']);
    // Backspace takes the person's own added words out outright.
    for (let i = 0; i < ' brown'.length; i++) typist.run(planDeleteChar(typist.ctx, typist.caret, -1));
    assert.equal(marked(typist.shadow, 1), 'The quick fox.');
    assert.deepEqual(proposalIds(typist.shadow.blocks), []);
    await doc.settle(page);
    await page.stop();
  });

  it('Backspace and Delete strike words, passing over what is struck already', async () => {
    const page = await doc.open('deleting');
    const typist = new Typist(page);
    typist.caret = typist.at(1, 'The quick'.length);
    typist.run(planDeleteChar(typist.ctx, typist.caret, -1));
    typist.run(planDeleteChar(typist.ctx, typist.caret, -1));
    assert.equal(marked(typist.shadow, 1), 'The qui{ck} fox.');
    assert.equal(proposalIds(typist.shadow.blocks).length, 1, 'struck in one burst');
    // Typing right there (the caret is before the struck words) joins the same suggestion: a replacement.
    typist.type('ite');
    assert.equal(marked(typist.shadow, 1), 'The qui[ite]{ck} fox.');
    assert.equal(proposalIds(typist.shadow.blocks).length, 1);
    // Delete forward passes over the struck words.
    typist.run(planDeleteChar(typist.ctx, typist.caret, 1));
    assert.equal(marked(typist.shadow, 1), 'The qui[ite]{ck }fox.');
    assert.equal(proposalIds(typist.shadow.blocks).length, 1);
    // A selection is struck as a whole.
    typist.run(planRemove(typist.ctx, typist.at(1, 0), typist.at(1, 4), -1));
    assert.equal(marked(typist.shadow, 1), '{The }qui[ite]{ck }fox.');
    await doc.settle(page);
    const ids = proposalIds(typist.shadow.blocks);
    const held = (await doc.post<DocTabResponse>('_api/doc/read', { tab: doc.tab })).doc as unknown as DiskDoc;
    for (const id of ids) assert.equal(held.suggestions?.[id]?.by, me);
    // Withdrawn, the text is back as it was.
    page.sync.write(ids.map(id => ({ op: 'decide', suggestId: id, verdict: 'withdraw' })));
    await doc.settle(page);
    assert.equal((await doc.serverTexts())[1], 'The quick fox.');
    assert.deepEqual(proposalIds(page.sync.shadow.blocks), []);
    await page.stop();
  });

  it('Enter at a block’s end adds a new line; mid-line it is refused', async () => {
    const page = await doc.open('enter');
    const typist = new Typist(page);
    typist.caret = typist.at(1, 'The quick fox.'.length);
    const plan = typist.run(planEnter(typist.ctx, typist.caret));
    assert.equal(plan?.kind, 'write');
    const added = typist.shadow.blocks[2]!;
    assert.equal(added.type, 'paragraph');
    assert.equal(added.suggest?.op, 'ins');
    typist.type('New');
    assert.equal(marked(typist.shadow, 2), '[New]');
    assert.equal(proposalIds(typist.shadow.blocks).length, 1, 'the line and its words are one suggestion');
    // Taking the words out, then Backspace at the empty line's start, takes the line out.
    for (let i = 0; i < 3; i++) typist.run(planDeleteChar(typist.ctx, typist.caret, -1));
    typist.run(planDeleteChar(typist.ctx, typist.caret, -1));
    assert.equal(typist.shadow.blocks.length, 3);
    assert.deepEqual(proposalIds(typist.shadow.blocks), []);
    // Mid-line, and joining lines, can't be suggested yet.
    assert.deepEqual(planEnter(typist.ctx, typist.at(1, 3)), { kind: 'refuse', why: REFUSALS.notYet });
    assert.deepEqual(planDeleteChar(typist.ctx, typist.at(1, 0), -1), { kind: 'refuse', why: REFUSALS.notYet });
    await doc.settle(page);
    await page.stop();
  });

  it('Enter at a list item’s end adds an item', async () => {
    const page = await doc.open('list');
    const typist = new Typist(page);
    typist.caret = typist.at(2, 'one'.length);
    typist.run(planEnter(typist.ctx, typist.caret));
    const list = typist.shadow.blocks[2]!;
    assert.equal(list.children!.length, 3);
    const item = list.children![1]!;
    assert.equal(item.type, 'listItem');
    assert.equal(item.suggest?.op, 'ins');
    assert.equal(item.children![0]!.suggest?.op, 'ins');
    typist.type('half');
    const para = typist.shadow.blocks[2]!.children![1]!.children![0]!;
    assert.equal(marked({ ...typist.shadow, blocks: [para] }, 0), '[half]');
    assert.equal(proposalIds(typist.shadow.blocks).length, 1);
    // Splitting an item in two can't be suggested yet.
    assert.deepEqual(planEnter(typist.ctx, typist.at(2, 1)), { kind: 'refuse', why: REFUSALS.itemBreak });
    await doc.settle(page);
    const ids = proposalIds(page.sync.shadow.blocks);
    page.sync.write(ids.map(id => ({ op: 'decide', suggestId: id, verdict: 'reject' })));
    await doc.settle(page);
    assert.equal(page.sync.shadow.blocks[2]!.children!.length, 2);
    await page.stop();
  });

  it('someone else’s suggestion is not added to or struck', async () => {
    const page = await doc.open('peer');
    const quick = page.sync.shadow.blocks[1]!.inline!.filter(item => !isAtom(item));
    const wrote = await doc.action('update', {
      call: {
        ref: { object: 'node', id: doc.tab },
        payload: { suggest: true, ops: [{ op: 'delete', target: { kind: 'chars', range: [quick[4]!.id, quick[8]!.id] } }] },
      },
    });
    assert.equal(wrote.ok, true, JSON.stringify(wrote));
    await doc.settle(page);
    const typist = new Typist(page);
    // Typing inside the agent's struck words, or over them, is refused.
    assert.deepEqual(planInsert(typist.ctx, typist.at(1, 6), typist.at(1, 6), textContent('x')), { kind: 'refuse', why: REFUSALS.peer });
    assert.deepEqual(planRemove(typist.ctx, typist.at(1, 2), typist.at(1, 6), -1), { kind: 'refuse', why: REFUSALS.peer });
    // Beside them, a new suggestion of the person's starts.
    typist.caret = typist.at(1, 0);
    const plan = typist.type('A');
    assert.equal(plan?.kind, 'write');
    const ids = proposalIds(typist.shadow.blocks);
    assert.equal(ids.length, 2);
    await doc.settle(page);
    page.sync.write(ids.map(id => ({ op: 'decide', suggestId: id, verdict: 'reject' })));
    await doc.settle(page);
    assert.equal((await doc.serverTexts())[1], 'The quick fox.');
    await page.stop();
  });

  it('works out a plain edit made some other way, and refuses the rest', async () => {
    const page = await doc.open('intent');
    const typist = new Typist(page);
    const state = typist.state;
    const cut = state.tr.delete(typist.at(1, 0), typist.at(1, 4));
    assert.deepEqual(intentOf(cut), { kind: 'remove', from: typist.at(1, 0), to: typist.at(1, 4) });
    const typed = state.tr.insertText('slow', typist.at(1, 4), typist.at(1, 9));
    const intent = intentOf(typed);
    assert.equal(intent.kind, 'insert');
    const bold = state.tr.addMark(typist.at(1, 0), typist.at(1, 3), schema.marks.bold!.create());
    assert.equal(intentOf(bold).kind, 'refuse');
    const across = state.tr.delete(typist.at(1, 2), typist.at(2, 1));
    assert.deepEqual(intentOf(across), { kind: 'refuse', why: REFUSALS.notYet });
    await page.stop();
  });

  it('a paste is flattened into one line', () => {
    const slice = new Slice(
      schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create(null, schema.text('one')), schema.nodes.paragraph!.create(null, schema.text('two', [schema.marks.bold!.create()]))]).content,
      1,
      1,
    );
    const flat = flattenSlice(slice, false);
    assert.equal(flat.joined, true);
    assert.equal(flat.leftOut, false);
    assert.deepEqual(flat.content, [
      { type: 'text', text: 'one ' },
      { type: 'text', text: 'two', marks: [{ type: 'bold' }] },
    ]);
  });
});
