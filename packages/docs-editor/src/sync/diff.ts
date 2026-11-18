/**
 * What the page's edit is, as ops: the difference between the tab as the server will hold it once every op sent so far
 * lands (the shadow) and the editor's document now.
 *
 * Every op is applied to a copy of the shadow as it is made, with the ids it mints written into it (`ids`), so the
 * server, applying the same ops to the same tab, holds the very doc the page does, ids and all. Blocks are matched by
 * id; a block keeps its id where the edit kept the block, and its characters keep theirs where the edit kept them (a
 * split's tail, a join's words). Whatever the steps can't reach is written as a replacement of the top-level blocks
 * that differ.
 */
import { type Block, type DocState, Refusal, type Session, ancestors, applyOps, findBlock, proposalIds, walk } from '@open-artifact/docs-core';
import {
  type PageAttrs,
  type PageItem,
  type PageNode,
  TEXT_BLOCKS,
  bidOf,
  blockToJson,
  blockToPage,
  canonical,
  docToPage,
  itemKey,
  itemOf,
  itemsText,
  itemsToJson,
  pageItems,
  samePage,
} from './page.ts';

type Json = Record<string, unknown>;

/** A page block whose id the edit settled: the editor writes it to the block at `path` (child indexes from the doc). */
export interface IdFix {
  path: number[];
  id: string;
}

export interface PageDiff {
  ops: Json[];
  /** The shadow once the ops land. */
  shadow: DocState;
  fixes: IdFix[];
  /** The edit was written as a replacement of whole top-level blocks. */
  replaced: boolean;
}

/** The page doc and the shadow could not be made to agree. */
export class DiffError extends Error {}

const charsTarget = (from: string, to: string) => ({ kind: 'chars', range: [from, to] });
const blocksTarget = (...ids: string[]) => ({ kind: 'blocks', ids });
const BLOCK_ONLY = new Set(['bid', 'suggestId', 'suggestOp']);

/**
 * The ops that make the shadow the page. Only the top-level blocks that differ are looked at (with a kept block on
 * each side, so a join or a move has its neighbour); the editor, which knows which top-level nodes a transaction
 * touched, calls diffTop with that window instead.
 */
export function diffPage(shadow: DocState, page: PageNode, session: Session): PageDiff {
  const top = page.content ?? [];
  const blocks = shadow.blocks;
  const same = (node: PageNode, block: Block) => bidOf(node) === block.id && samePage(node, blockToPage(block));
  let head = 0;
  while (head < top.length && head < blocks.length && same(top[head]!, blocks[head]!)) head++;
  if (head === top.length && head === blocks.length) return { ops: [], shadow, fixes: [], replaced: false };
  let tail = 0;
  while (tail < top.length - head && tail < blocks.length - head && same(top[top.length - 1 - tail]!, blocks[blocks.length - 1 - tail]!)) tail++;
  return diffTop(shadow, { from: head, to: blocks.length - tail, nodes: top.slice(head, top.length - tail) }, session);
}

/** The top-level blocks `from`..`to` (exclusive) of the shadow, which the page now holds as `nodes`. */
export interface TopWindow {
  from: number;
  to: number;
  nodes: PageNode[];
}

export function diffTop(shadow: DocState, window: TopWindow, session: Session): PageDiff {
  const blocks = shadow.blocks;
  // A kept neighbour on each side, so the window is never empty and a step that names the block before has it.
  const from = Math.max(0, window.from - 1);
  const to = Math.min(blocks.length, window.to + 1);
  const nodes = [...blocks.slice(from, window.from).map(blockToPage), ...window.nodes, ...blocks.slice(window.to, to).map(blockToPage)];
  const part: DocState = { rev: shadow.rev, blocks: blocks.slice(from, to), ...(shadow.suggestions ? { suggestions: shadow.suggestions } : {}) };
  const diff = diffWhole(part, { type: 'doc', content: nodes }, session);
  const merged = [...blocks.slice(0, from), ...diff.shadow.blocks, ...blocks.slice(to)];
  const records = { ...(shadow.suggestions ?? {}), ...(diff.shadow.suggestions ?? {}) };
  const open = proposalIds(merged);
  const suggestions = Object.fromEntries(open.filter(id => records[id]).map(id => [id, records[id]!]));
  return {
    ops: diff.ops,
    shadow: { rev: shadow.rev + (diff.ops.length ? 1 : 0), blocks: merged, ...(open.length ? { suggestions } : {}) },
    fixes: diff.fixes.map(fix => ({ ...fix, path: [fix.path[0]! + from, ...fix.path.slice(1)] })),
    replaced: diff.replaced,
  };
}

function diffWhole(shadow: DocState, page: PageNode, session: Session): PageDiff {
  const start = session.next;
  try {
    const stepped = new Stepper(shadow, page, session);
    if (stepped.run()) return stepped.result(false);
  } catch (error) {
    if (!(error instanceof Refusal) && !(error instanceof DiffError)) throw error;
  }
  session.next = start;
  const replaced = new Stepper(shadow, page, session);
  replaced.replaceTop();
  if (replaced.agrees()) return replaced.result(true);
  session.next = start;
  throw new DiffError('the page and the tab do not agree');
}

class Stepper {
  private doc: DocState;
  private ops: Json[] = [];
  private ids = new Map<PageNode, string>();
  private parents = new Map<PageNode, PageNode | null>();
  private page: PageNode;
  private session: Session;

  constructor(shadow: DocState, page: PageNode, session: Session) {
    this.doc = shadow;
    this.page = page;
    this.session = session;
    const index = (node: PageNode, parent: PageNode | null) => {
      this.parents.set(node, parent);
      if (!TEXT_BLOCKS.has(node.type)) for (const child of node.content ?? []) index(child, node === page ? null : node);
    };
    for (const child of page.content ?? []) index(child, null);
  }

  /** Steps the shadow to the page; true when they agree. */
  run(): boolean {
    if (samePage(docToPage(this.doc), this.page)) {
      this.claimKnown();
      return true;
    }
    this.claimKnown();
    this.joins();
    this.splits();
    this.place(this.page.content ?? [], null);
    this.deletes();
    this.attrs(this.page.content ?? []);
    this.words();
    return this.agrees();
  }

  result(replaced: boolean): PageDiff {
    const fixes: IdFix[] = [];
    const visit = (nodes: PageNode[], path: number[]) =>
      nodes.forEach((node, index) => {
        const id = this.ids.get(node);
        if (id && id !== bidOf(node)) fixes.push({ path: [...path, index], id });
        if (!TEXT_BLOCKS.has(node.type)) visit(node.content ?? [], [...path, index]);
      });
    visit(this.page.content ?? [], []);
    return { ops: this.ops, shadow: this.doc, fixes, replaced };
  }

  agrees(): boolean {
    return JSON.stringify(canonical(docToPage(this.doc))) === JSON.stringify(canonical(this.withIds(this.page)));
  }

  private withIds(node: PageNode): PageNode {
    const id = this.ids.get(node);
    const out: PageNode = id ? { ...node, attrs: { ...(node.attrs ?? {}), bid: id } } : { ...node };
    if (node.content && !TEXT_BLOCKS.has(node.type)) out.content = node.content.map(child => this.withIds(child));
    return out;
  }

  // -- steps --

  private apply(op: Json): string[] {
    const { doc, results } = applyOps(this.doc, [op], this.session);
    this.doc = doc;
    const minted = results[0]?.minted ?? [];
    this.ops.push(minted.length ? { ...op, ids: minted } : op);
    return minted;
  }

  private take(count: number): string[] {
    return Array.from({ length: count }, () => `${this.session.sess}.${this.session.next++}`);
  }

  private exists(id: string | undefined): id is string {
    return id !== undefined && findBlock(this.doc, id) !== null;
  }

  private blockOf(node: PageNode): Block | null {
    const id = this.ids.get(node);
    return id ? (findBlock(this.doc, id)?.block ?? null) : null;
  }

  /** Each page block whose id the shadow holds keeps it; a second block with the same id (a split's copy) is new. */
  private claimKnown(): void {
    const known = new Set<string>();
    for (const { block } of walk(this.doc.blocks)) known.add(block.id);
    const seen = new Set<string>();
    const visit = (nodes: PageNode[]) => {
      for (const node of nodes) {
        const bid = bidOf(node);
        if (bid && known.has(bid) && !seen.has(bid)) {
          this.ids.set(node, bid);
          seen.add(bid);
        }
        if (!TEXT_BLOCKS.has(node.type)) visit(node.content ?? []);
      }
    };
    visit(this.page.content ?? []);
  }

  private pageTexts(): PageNode[] {
    const out: PageNode[] = [];
    const visit = (nodes: PageNode[]) => {
      for (const node of nodes) {
        if (TEXT_BLOCKS.has(node.type)) out.push(node);
        else visit(node.content ?? []);
      }
    };
    visit(this.page.content ?? []);
    return out;
  }

  private shadowTexts(): Block[] {
    const out: Block[] = [];
    for (const { block } of walk(this.doc.blocks)) if (block.inline) out.push(block);
    return out;
  }

  /** A text block the page dropped whose words now end the text block before it: a join (its words keep their ids). */
  private joins(): void {
    const onPage = new Map<string, PageNode>();
    for (const [node, id] of this.ids) onPage.set(id, node);
    for (const gone of this.shadowTexts()) {
      if (onPage.has(gone.id) || !gone.inline?.length) continue;
      const texts = this.shadowTexts();
      const at = texts.findIndex(block => block.id === gone.id);
      let before: Block | undefined;
      for (let index = at - 1; index >= 0; index--) {
        if (onPage.has(texts[index]!.id)) {
          before = texts[index];
          break;
        }
      }
      if (!before) continue;
      const pageText = itemsText(pageItems(onPage.get(before.id)!));
      const goneText = itemsText(gone.inline.map(itemOf));
      if (!pageText.endsWith(goneText)) continue;
      this.apply({ op: 'join', target: blocksTarget(before.id, gone.id) });
    }
  }

  /**
   * A run of new text blocks after a kept one: the kept block was split (Enter), so its tail becomes the run's last
   * block, words and ids; a list item's tail in a new list item is a new item.
   */
  private splits(): void {
    const texts = this.pageTexts();
    for (let index = 0; index < texts.length; index++) {
      const last = texts[index]!;
      if (this.ids.has(last) || (index + 1 < texts.length && !this.ids.has(texts[index + 1]!))) continue;
      let first = index;
      while (first > 0 && !this.ids.has(texts[first - 1]!)) first--;
      if (first === 0) continue;
      const kept = texts[first - 1]!;
      const block = this.blockOf(kept);
      if (!block?.inline?.length) continue;
      const shadowItems = block.inline.map(itemOf);
      const pageNow = pageItems(kept);
      let cut = 0;
      while (cut < shadowItems.length && cut < pageNow.length && itemKey(shadowItems[cut]!) === itemKey(pageNow[cut]!)) cut++;
      const at = cut === 0 ? { id: block.inline[0]!.id, side: 'before' } : { id: block.inline[cut - 1]!.id, side: 'after' };
      const shadowParent = findBlock(this.doc, block.id)?.parent;
      const pageParent = this.parents.get(last) ?? null;
      const newItem = shadowParent?.type === 'listItem' && pageParent?.type === 'listItem' && !this.ids.has(pageParent) && pageParent.content?.[0] === last;
      const ids = this.take(newItem ? 2 : 1);
      this.apply({ op: 'split', target: charsTarget(at.id, at.id), side: at.side, ids });
      this.ids.set(last, ids[ids.length - 1]!);
      if (newItem) this.ids.set(pageParent, ids[0]!);
    }
  }

  private placeOf(parentId: string | null, after: string | null): Json {
    if (after) return { target: blocksTarget(after), side: 'after' };
    if (parentId) return { target: blocksTarget(parentId), side: 'start' };
    return { target: { kind: 'root' }, side: 'start' };
  }

  private holdsKnown(node: PageNode): boolean {
    if (TEXT_BLOCKS.has(node.type)) return false;
    return (node.content ?? []).some(child => this.exists(this.ids.get(child)) || this.holdsKnown(child));
  }

  /** Puts every page block in its place under its parent, in order: moving kept ones, making new ones. */
  private place(nodes: PageNode[], parentId: string | null): void {
    let after: string | null = null;
    for (const node of nodes) {
      let id: string | undefined = this.ids.get(node);
      if (id !== undefined && !this.exists(id)) {
        this.ids.delete(node);
        id = undefined;
      }
      if (id !== undefined) {
        const place = findBlock(this.doc, id)!;
        const before = place.index === 0 ? null : place.siblings[place.index - 1]!.id;
        if ((place.parent?.id ?? null) !== parentId || before !== after) this.apply({ op: 'move', target: blocksTarget(id), to: this.placeOf(parentId, after) });
      } else {
        const shell = this.holdsKnown(node);
        const where = this.placeOf(parentId, after);
        this.apply({ op: 'insert', ...where, with: { as: 'blocks', from: { kind: 'blocks', content: [blockToJson(node, shell)] } } });
        const siblings: Block[] = parentId ? findBlock(this.doc, parentId)!.block.children! : this.doc.blocks;
        const made: Block | undefined = siblings[after ? siblings.findIndex(block => block.id === after) + 1 : 0];
        if (!made) throw new DiffError('a new block did not land where it was put');
        this.pair(node, made, shell);
        id = made.id;
      }
      if (!TEXT_BLOCKS.has(node.type) && node.content) this.place(node.content, id!);
      after = id!;
    }
  }

  private pair(node: PageNode, block: Block, shell: boolean): void {
    this.ids.set(node, block.id);
    if (shell || TEXT_BLOCKS.has(node.type)) return;
    (node.content ?? []).forEach((child, index) => {
      const made = block.children?.[index];
      if (made) this.pair(child, made, false);
    });
  }

  private deletes(): void {
    const keep = new Set(this.ids.values());
    const gone = new Set<string>();
    for (const { block } of walk(this.doc.blocks)) if (!keep.has(block.id)) gone.add(block.id);
    const top = [...gone].filter(id => !ancestors(this.doc, id).some(block => gone.has(block.id)));
    if (top.length) this.apply({ op: 'delete', target: blocksTarget(...top) });
  }

  private attrs(nodes: PageNode[]): void {
    for (const node of nodes) {
      const block = this.blockOf(node);
      if (!block) throw new DiffError('a page block has no place in the tab');
      if (block.type !== node.type) {
        if (TEXT_BLOCKS.has(block.type) && TEXT_BLOCKS.has(node.type)) {
          this.apply({ op: 'set', target: blocksTarget(block.id), attrs: { type: node.type, ...(node.type === 'codeBlock' && node.attrs?.language ? { language: node.attrs.language } : {}) } });
        } else {
          this.retype(node, block);
          continue;
        }
      }
      const now = this.blockOf(node)!;
      const want = ownAttrs(node);
      const have = ownAttrs(blockToPage(now));
      const change: Json = {};
      for (const key of new Set([...Object.keys(want), ...Object.keys(have)])) {
        if (JSON.stringify(want[key]) !== JSON.stringify(have[key])) change[key] = want[key] ?? null;
      }
      if (Object.keys(change).length) this.apply({ op: 'set', target: blocksTarget(now.id), attrs: change });
      if (!TEXT_BLOCKS.has(node.type)) this.attrs(node.content ?? []);
    }
  }

  /** A block that became another kind of block: written anew in its place. */
  private retype(node: PageNode, block: Block): void {
    const place = findBlock(this.doc, block.id)!;
    const parentId = place.parent?.id ?? null;
    const index = place.index;
    this.apply({ op: 'replace', target: blocksTarget(block.id), with: { as: 'blocks', from: { kind: 'blocks', content: [blockToJson(node)] } } });
    const siblings = parentId ? findBlock(this.doc, parentId)!.block.children! : this.doc.blocks;
    this.pair(node, siblings[index]!, false);
  }

  /** The words of every text block: what went, what came, and marks and chips changed on what stayed. */
  private words(): void {
    for (const node of this.pageTexts()) {
      const block = this.blockOf(node);
      if (!block?.inline) throw new DiffError('a page text block has no text block in the tab');
      if (samePage({ type: 'p', content: node.content ?? [] }, { type: 'p', content: blockToPage(block).content ?? [] })) continue;
      const have = block.inline;
      const want = pageItems(node);
      const haveItems = have.map(itemOf);
      let head = 0;
      while (head < have.length && head < want.length && itemKey(haveItems[head]!) === itemKey(want[head]!)) head++;
      let tail = 0;
      while (tail < have.length - head && tail < want.length - head && itemKey(haveItems[have.length - 1 - tail]!) === itemKey(want[want.length - 1 - tail]!)) tail++;
      const kept: Array<[string, PageItem, PageItem]> = [];
      for (let index = 0; index < head; index++) kept.push([have[index]!.id, haveItems[index]!, want[index]!]);
      for (let offset = tail; offset > 0; offset--) kept.push([have[have.length - offset]!.id, haveItems[have.length - offset]!, want[want.length - offset]!]);
      if (have.length - tail > head) this.apply({ op: 'delete', target: charsTarget(have[head]!.id, have[have.length - tail - 1]!.id) });
      const added = want.slice(head, want.length - tail);
      if (added.length) this.insertWords(block, added, head > 0 ? have[head - 1]!.id : null, tail > 0 ? have[have.length - tail]!.id : null);
      this.restyle(kept);
    }
  }

  private insertWords(block: Block, items: PageItem[], after: string | null, before: string | null): void {
    // Words added inside an open suggestion's addition join it; any other run goes in plain. Each run is its own insert.
    const runs: PageItem[][] = [];
    for (const item of items) {
      const plain = item.suggest?.op === 'ins' ? item : withoutSuggest(item);
      const last = runs[runs.length - 1];
      if (last && last[0]!.suggest?.id === plain.suggest?.id) last.push(plain);
      else runs.push([plain]);
    }
    let anchor = after;
    for (const run of runs) {
      const ids = this.take(run.length);
      const where = anchor
        ? { target: charsTarget(anchor, anchor), side: 'after' }
        : before
          ? { target: charsTarget(before, before), side: 'before' }
          : { target: blocksTarget(block.id), side: 'start' };
      this.apply({ op: 'insert', ...where, ids: { from: ids[0], count: ids.length }, with: { as: 'inline', from: { kind: 'inline', content: itemsToJson(run) } } });
      anchor = ids[ids.length - 1]!;
    }
  }

  /** Marks and chip attrs changed on the words that stayed, as format and set ops over runs of the same change. */
  private restyle(kept: Array<[string, PageItem, PageItem]>): void {
    let run: { from: string; to: string; key: string; add: Json[]; remove: Json[] } | null = null;
    const flush = () => {
      if (!run) return;
      this.apply({ op: 'format', target: charsTarget(run.from, run.to), ...(run.add.length ? { add: run.add } : {}), ...(run.remove.length ? { remove: run.remove } : {}) });
      run = null;
    };
    for (const [id, have, want] of kept) {
      if (have.kind === 'atom' && want.kind === 'atom' && JSON.stringify(canonical({ type: have.atom, attrs: have.attrs })) !== JSON.stringify(canonical({ type: want.atom, attrs: want.attrs }))) {
        const attrs: Json = {};
        for (const key of new Set([...Object.keys(have.attrs), ...Object.keys(want.attrs)])) {
          if (JSON.stringify(have.attrs[key]) !== JSON.stringify(want.attrs[key])) attrs[key] = want.attrs[key] ?? null;
        }
        this.apply({ op: 'set', target: charsTarget(id, id), attrs });
      }
      const change = markChange(have, want);
      if (!change) {
        flush();
        continue;
      }
      if (run && run.key === change.key) run.to = id;
      else {
        flush();
        run = { from: id, to: id, ...change };
      }
    }
    flush();
  }

  /** The changed top-level blocks, written anew: the shadow's run that differs gives way to the page's. */
  replaceTop(): void {
    const top = this.page.content ?? [];
    const blocks = this.doc.blocks;
    const same = (node: PageNode, block: Block) => bidOf(node) === block.id && samePage(node, blockToPage(block));
    let head = 0;
    while (head < top.length && head < blocks.length && same(top[head]!, blocks[head]!)) head++;
    let tail = 0;
    while (tail < top.length - head && tail < blocks.length - head && same(top[top.length - 1 - tail]!, blocks[blocks.length - 1 - tail]!)) tail++;
    const gone = blocks.slice(head, blocks.length - tail).map(block => block.id);
    const fresh = top.slice(head, top.length - tail);
    for (let index = 0; index < head; index++) this.pair(top[index]!, blocks[index]!, false);
    const tailNodes = top.slice(top.length - tail);
    const tailBlocks = blocks.slice(blocks.length - tail);
    const content = fresh.map(node => blockToJson(node));
    if (fresh.length && gone.length) this.apply({ op: 'replace', target: blocksTarget(...gone), with: { as: 'blocks', from: { kind: 'blocks', content } } });
    else if (fresh.length) this.apply({ op: 'insert', ...this.placeOf(null, head > 0 ? blocks[head - 1]!.id : null), with: { as: 'blocks', from: { kind: 'blocks', content } } });
    else if (gone.length) this.apply({ op: 'delete', target: blocksTarget(...gone) });
    fresh.forEach((node, index) => {
      const made = this.doc.blocks[head + index];
      if (made) this.pair(node, made, false);
    });
    tailNodes.forEach((node, index) => this.pair(node, tailBlocks[index]!, false));
  }
}

/** A block's own attrs, as the page and the shadow are compared on them. */
function ownAttrs(node: PageNode): PageAttrs {
  const attrs = canonical({ ...node, content: [] }).attrs ?? {};
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => !BLOCK_ONLY.has(key)));
}

const withoutSuggest = (item: PageItem): PageItem => {
  const { suggest: _suggest, ...rest } = item;
  return rest as PageItem;
};

/** The format a kept item needs: the marks it gains (or changes) and loses, keyed so equal changes share one op. */
function markChange(have: PageItem, want: PageItem): { key: string; add: Json[]; remove: Json[] } | null {
  const add: Json[] = [];
  const remove: Json[] = [];
  const a = (have.marks ?? {}) as Record<string, unknown>;
  const b = (want.marks ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[key] === b[key]) continue;
    if (b[key] === undefined) remove.push({ type: key });
    else if (key === 'link') add.push({ type: 'link', attrs: { href: b[key] } });
    else if (key === 'highlight') add.push({ type: 'highlight', attrs: { color: b[key] } });
    else if (key === 'textColor') add.push({ type: 'textColor', attrs: { color: b[key] } });
    else add.push({ type: key });
  }
  if (!add.length && !remove.length) return null;
  return { key: JSON.stringify([add, remove]), add, remove };
}

