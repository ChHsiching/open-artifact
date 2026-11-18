import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type DocState, type Session, applyOps } from '@open-artifact/docs-core';
import { type PageNode, bidOf, canonical, docToPage } from '../src/sync/page.ts';
import { diffPage } from '../src/sync/diff.ts';

type Json = Record<string, unknown>;

const SAMPLE = [
  '# Plan',
  '',
  'First paragraph with **bold** and *italic* words.',
  '',
  '- one',
  '- two',
  '  - nested',
  '- three',
  '',
  '> quoted line',
  '',
  '```ts',
  'const x = 1;',
  '```',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '---',
  '',
  '1. first',
  '2. second',
  '',
  '- [ ] task',
  '- [x] done',
  '',
  'Last line with a [link](https://example.com) and `code`.',
].join('\n');

function sampleDoc(): DocState {
  const empty: DocState = { rev: 0, blocks: [{ id: 's0.0', type: 'paragraph', inline: [] }] };
  const { doc } = applyOps(empty, [{ op: 'replace', target: { kind: 'blocks', ids: ['s0.0'] }, with: { as: 'markdown', from: { kind: 'inline', content: SAMPLE } } }], { sess: 's0', next: 1 });
  return doc;
}

let seed = 7;
const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const int = (n: number) => Math.floor(random() * n);
const copy = <T>(value: T): T => structuredClone(value);

/** Every node holding blocks (the doc and containers), with the text blocks under each. */
function textBlocks(page: PageNode): Array<{ node: PageNode; parent: PageNode; index: number }> {
  const out: Array<{ node: PageNode; parent: PageNode; index: number }> = [];
  const visit = (parent: PageNode) =>
    (parent.content ?? []).forEach((node, index) => {
      if (node.type === 'paragraph' || node.type === 'codeBlock') out.push({ node, parent, index });
      else if (node.content) visit(node);
    });
  visit(page);
  return out;
}

const textOf = (node: PageNode) => (node.content ?? []).map(child => (child.type === 'text' ? child.text : '￼')).join('');

/** A text block's content cut at a code point offset: [before, after]. */
function cut(node: PageNode, at: number): [PageNode[], PageNode[]] {
  const before: PageNode[] = [];
  const after: PageNode[] = [];
  let seen = 0;
  for (const child of node.content ?? []) {
    const length = child.type === 'text' ? Array.from(child.text ?? '').length : 1;
    if (seen + length <= at) before.push(child);
    else if (seen >= at) after.push(child);
    else {
      const chars = Array.from(child.text ?? '');
      before.push({ ...child, text: chars.slice(0, at - seen).join('') });
      after.push({ ...child, text: chars.slice(at - seen).join('') });
    }
    seen += length;
  }
  return [before, after];
}
const length = (node: PageNode) => (node.content ?? []).reduce((sum, child) => sum + (child.type === 'text' ? Array.from(child.text ?? '').length : 1), 0);

const EDITS: Array<[string, (page: PageNode) => boolean]> = [
  [
    'type',
    page => {
      const { node } = pick(textBlocks(page));
      const at = int(length(node) + 1);
      const [a, b] = cut(node, at);
      const marks = a[a.length - 1]?.marks;
      node.content = [...a, { type: 'text', text: pick(['x', 'hello ', 'é', '😀', 'a']), ...(marks && node.type !== 'codeBlock' ? { marks } : {}) }, ...b];
      return true;
    },
  ],
  [
    'delete words',
    page => {
      const { node } = pick(textBlocks(page));
      const n = length(node);
      if (n < 2) return false;
      const from = int(n - 1);
      const to = from + 1 + int(Math.min(5, n - from - 1));
      const [a] = cut(node, from);
      const [, b] = cut(node, to);
      node.content = [...a, ...b];
      return true;
    },
  ],
  [
    'enter',
    page => {
      const { node, parent, index } = pick(textBlocks(page));
      const at = int(length(node) + 1);
      const [a, b] = cut(node, at);
      node.content = a;
      const tail: PageNode = { ...copy(node), content: b };
      if (parent.type === 'listItem' && index === 0) {
        const lists = findParent(page, parent);
        const item: PageNode = { type: 'listItem', attrs: { ...copy(parent.attrs ?? {}), ...(parent.attrs?.checked !== undefined ? { checked: false } : {}) }, content: [tail, ...parent.content!.slice(1)] };
        parent.content = [node];
        lists!.content!.splice(lists!.content!.indexOf(parent) + 1, 0, item);
      } else parent.content!.splice(index + 1, 0, tail);
      return true;
    },
  ],
  [
    'backspace at start',
    page => {
      const texts = textBlocks(page);
      const at = 1 + int(texts.length - 1);
      const { node, parent, index } = texts[at]!;
      const before = texts[at - 1]!.node;
      if (before.type !== node.type || parent.type === 'cell' || texts[at - 1]!.parent.type === 'cell') return false;
      before.content = [...(before.content ?? []), ...(node.content ?? [])];
      parent.content!.splice(index, 1);
      prune(page);
      return true;
    },
  ],
  [
    'bold',
    page => {
      const { node } = pick(textBlocks(page));
      if (node.type === 'codeBlock' || length(node) < 2) return false;
      const from = int(length(node) - 1);
      const to = from + 1 + int(length(node) - from - 1);
      const [a, rest] = cut(node, from);
      const [mid, b] = cut({ type: 'p', content: rest }, to - from);
      node.content = [...a, ...mid.map(child => (child.type === 'text' ? { ...child, marks: [...(child.marks ?? []).filter(mark => mark.type !== 'bold'), { type: 'bold' }] } : child)), ...b];
      return true;
    },
  ],
  [
    'heading',
    page => {
      const top = page.content!.filter(node => node.type === 'paragraph');
      if (!top.length) return false;
      const node = pick(top);
      node.attrs = { ...node.attrs, heading: pick([null, 1, 2, 3]) };
      return true;
    },
  ],
  [
    'wrap in list',
    page => {
      const index = page.content!.findIndex(node => node.type === 'paragraph');
      if (index < 0) return false;
      const node = page.content![index]!;
      page.content![index] = { type: 'list', attrs: { bid: null, kind: 'bullet' }, content: [{ type: 'listItem', attrs: { bid: null }, content: [node] }] };
      return true;
    },
  ],
  [
    'lift item',
    page => {
      const index = page.content!.findIndex(node => node.type === 'list');
      if (index < 0) return false;
      const list = page.content![index]!;
      const item = list.content![0]!;
      list.content!.shift();
      page.content!.splice(index, list.content!.length ? 0 : 1, ...item.content!);
      return true;
    },
  ],
  [
    'delete block',
    page => {
      if (page.content!.length < 3) return false;
      page.content!.splice(int(page.content!.length), 1);
      return true;
    },
  ],
  [
    'move block',
    page => {
      if (page.content!.length < 3) return false;
      const [node] = page.content!.splice(int(page.content!.length), 1);
      page.content!.splice(int(page.content!.length + 1), 0, node!);
      return true;
    },
  ],
  [
    'new paragraph',
    page => {
      page.content!.splice(int(page.content!.length + 1), 0, { type: 'paragraph', attrs: { bid: null, heading: null }, content: [{ type: 'text', text: 'New words.' }] });
      return true;
    },
  ],
  [
    'paste paragraphs',
    page => {
      const { node, parent, index } = pick(textBlocks(page));
      if (node.type !== 'paragraph') return false;
      const [a, b] = cut(node, int(length(node) + 1));
      node.content = [...a, { type: 'text', text: 'one' }];
      parent.content!.splice(index + 1, 0, { type: 'paragraph', attrs: { bid: null }, content: [{ type: 'text', text: 'two' }] }, { ...copy(node), content: [{ type: 'text', text: 'three' }, ...b] });
      return true;
    },
  ],
  [
    'to code',
    page => {
      const top = page.content!.filter(node => node.type === 'paragraph');
      if (!top.length) return false;
      const node = pick(top);
      node.type = 'codeBlock';
      node.attrs = { bid: node.attrs?.bid ?? null, language: null };
      node.content = (node.content ?? []).filter(child => child.type === 'text').map(child => ({ type: 'text', text: child.text }));
      return true;
    },
  ],
  [
    'check list',
    page => {
      const list = page.content!.find(node => node.type === 'list' && node.attrs?.kind === 'bullet');
      if (!list) return false;
      list.attrs = { ...list.attrs, kind: 'check' };
      for (const item of list.content!) item.attrs = { ...item.attrs, checked: false };
      return true;
    },
  ],
  [
    'delete across',
    page => {
      const top = page.content!;
      const index = int(top.length - 1);
      if (top[index]!.type !== 'paragraph' || top[index + 1]!.type !== 'paragraph') return false;
      const a = top[index]!;
      const b = top[index + 1]!;
      const [keep] = cut(a, int(length(a) + 1));
      const [, rest] = cut(b, int(length(b) + 1));
      a.content = [...keep, ...rest];
      top.splice(index + 1, 1);
      return true;
    },
  ],
  [
    'table',
    page => {
      const cell = (text: string): PageNode => ({ type: 'cell', attrs: { bid: null }, content: [{ type: 'paragraph', attrs: { bid: null }, content: [{ type: 'text', text }] }] });
      page.content!.splice(int(page.content!.length + 1), 0, { type: 'table', attrs: { bid: null }, content: [{ type: 'tableRow', attrs: { bid: null }, content: [cell('x'), cell('y')] }] });
      return true;
    },
  ],
  [
    'mention',
    page => {
      const { node } = pick(textBlocks(page));
      if (node.type === 'codeBlock') return false;
      const [a, b] = cut(node, int(length(node) + 1));
      node.content = [...a, { type: 'mention', attrs: { principal: 'owner', ref: null, label: 'You' } }, ...b];
      return true;
    },
  ],
];

function findParent(page: PageNode, child: PageNode): PageNode | null {
  for (const node of page.content ?? []) {
    if (node === child) return page;
    if (node.content && node.type !== 'paragraph' && node.type !== 'codeBlock') {
      const found = findParent(node, child);
      if (found) return found;
    }
  }
  return null;
}

/** Containers the edit left empty go, as the editor's schema would have it; a list item keeps a paragraph first. */
function prune(node: PageNode): void {
  if (!node.content || node.type === 'paragraph' || node.type === 'codeBlock') return;
  node.content.forEach(prune);
  node.content = node.content.filter(child => !(child.content !== undefined && child.content.length === 0 && ['list', 'listItem', 'blockquote', 'table', 'tableRow'].includes(child.type)));
  for (const child of node.content) {
    if (child.type === 'listItem' && child.content?.[0]?.type !== 'paragraph') child.content!.unshift({ type: 'paragraph', attrs: { bid: null } });
    if (child.type === 'cell' && !child.content?.length) child.content = [{ type: 'paragraph', attrs: { bid: null } }];
  }
}

function applyFixes(page: PageNode, fixes: { path: number[]; id: string }[]): void {
  for (const fix of fixes) {
    let node = page;
    for (const index of fix.path) node = node.content![index]!;
    node.attrs = { ...(node.attrs ?? {}), bid: fix.id };
  }
}

function ids(doc: DocState): string[] {
  const out: string[] = [];
  const visit = (blocks: DocState['blocks']) => {
    for (const block of blocks) {
      out.push(block.id);
      for (const item of block.inline ?? []) out.push(item.id);
      visit(block.children ?? []);
    }
  };
  visit(doc.blocks);
  return out;
}

describe('the page diff', () => {
  it('agrees with an unchanged page and sends nothing', () => {
    const shadow = sampleDoc();
    const result = diffPage(shadow, docToPage(shadow), { sess: 'p1', next: 0 });
    assert.equal(result.ops.length, 0);
    assert.equal(result.replaced, false);
  });

  it('types words in as one insert, keeping every id', () => {
    const shadow = sampleDoc();
    const page = docToPage(shadow);
    const paragraph = page.content![1]!;
    paragraph.content = [...(paragraph.content ?? []), { type: 'text', text: ' More!' }];
    const typed = diffPage(shadow, page, { sess: 'p1', next: 0 });
    assert.equal(typed.replaced, false);
    assert.deepEqual(typed.ops.map(op => op.op), ['insert']);
    const kept = new Set(ids(typed.shadow));
    for (const id of ids(shadow)) assert.ok(kept.has(id), id);
    assert.equal(ids(typed.shadow).length, ids(shadow).length + 6);
  });

  it('answers a keystroke in a long doc quickly', () => {
    const blocks = Array.from({ length: 1500 }, (_, index) => `Paragraph ${index} with some **words** in it, long enough to count for something here.`).join('\n\n');
    const empty: DocState = { rev: 0, blocks: [{ id: 's0.0', type: 'paragraph', inline: [] }] };
    const shadow = applyOps(empty, [{ op: 'replace', target: { kind: 'blocks', ids: ['s0.0'] }, with: { as: 'markdown', from: { kind: 'inline', content: blocks } } }], { sess: 's0', next: 1 }).doc;
    const page = docToPage(shadow);
    page.content![700]!.content!.push({ type: 'text', text: 'x' });
    const started = performance.now();
    const result = diffPage(shadow, page, { sess: 'p1', next: 0 });
    const took = performance.now() - started;
    assert.deepEqual(result.ops.map(op => op.op), ['insert']);
    assert.ok(took < 400, `took ${took.toFixed(0)} ms`);
    console.log(`keystroke in 1500 paragraphs: ${took.toFixed(1)} ms`);
  });

  it('writes what the server makes of it, ids and all, over many random edits', () => {
    let shadow = sampleDoc();
    const client: Session = { sess: 'pg', next: 0 };
    const server: Session = { sess: 'pg', next: 0 };
    let replaced = 0;
    const tally = new Map<string, number>();
    for (let round = 0; round < 400; round++) {
      const page = docToPage(shadow);
      const steps = 1 + int(3);
      const names: string[] = [];
      for (let step = 0; step < steps; step++) {
        const [name, edit] = pick(EDITS);
        if (edit(page)) names.push(name);
      }
      prune(page);
      if (!page.content!.length) continue;
      const before = copy(page);
      const result = diffPage(shadow, page, client);
      assert.deepEqual(page, before, 'the diff leaves the page as it is');
      if (result.replaced) {
        replaced++;
        for (const name of names) tally.set(name, (tally.get(name) ?? 0) + 1);
      }
      const landed = applyOps(shadow, result.ops, server).doc;
      assert.deepEqual(landed.blocks, result.shadow.blocks, `round ${round} (${names.join(', ')}): the server holds what the page does`);
      applyFixes(page, result.fixes);
      assert.deepEqual(canonical(page), canonical(docToPage(result.shadow)), `round ${round}: the page agrees once its ids are set`);
      const seen = new Set<string>();
      const visit = (node: PageNode) => {
        for (const child of node.content ?? []) {
          if (child.type === 'text' || !child.attrs) continue;
          const bid = bidOf(child);
          if (bid) {
            assert.equal(seen.has(bid), false, `round ${round}: block ids are unique`);
            seen.add(bid);
          }
          visit(child);
        }
      };
      visit(page);
      shadow = result.shadow;
    }
    console.log(`replaced ${replaced}/400: ${JSON.stringify([...tally])}`);
    assert.ok(replaced < 40, `few edits fall back to replacing blocks (${replaced}: ${JSON.stringify([...tally])})`);
  });

  it('keeps the words of a split and a join', () => {
    const shadow = sampleDoc();
    const page = docToPage(shadow);
    const paragraph = page.content![1]!;
    const [a, b] = cut(paragraph, 5);
    paragraph.content = a;
    page.content!.splice(2, 0, { ...copy(paragraph), content: b });
    const split = diffPage(shadow, page, { sess: 'p1', next: 0 });
    assert.equal(split.replaced, false);
    assert.deepEqual(
      split.ops.map(op => op.op),
      ['split'],
    );
    const before = new Set(ids(shadow));
    const after = ids(split.shadow);
    assert.equal(after.filter(id => !before.has(id)).length, 1, 'only the new block gets a new id');

    applyFixes(page, split.fixes);
    const joined = copy(page);
    joined.content![1]!.content = [...(joined.content![1]!.content ?? []), ...(joined.content![2]!.content ?? [])];
    joined.content!.splice(2, 1);
    const join = diffPage(split.shadow, joined, { sess: 'p1', next: 10 });
    assert.deepEqual(
      join.ops.map(op => op.op),
      ['join'],
    );
  });

  it('turns Enter in a list item into a new item', () => {
    const shadow = sampleDoc();
    const page = docToPage(shadow);
    const list = page.content!.find(node => node.type === 'list')!;
    const item = list.content![0]!;
    const paragraph = item.content![0]!;
    const [a, b] = cut(paragraph, 1);
    paragraph.content = a;
    list.content!.splice(1, 0, { ...copy(item), content: [{ ...copy(paragraph), content: b }] });
    const result = diffPage(shadow, page, { sess: 'p1', next: 0 });
    assert.deepEqual(result.ops.map(op => op.op), ['split']);
    assert.equal((result.ops[0]!.ids as string[]).length, 2);
  });
});

export type { Json };
