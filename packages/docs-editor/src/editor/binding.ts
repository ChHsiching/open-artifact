/**
 * Keeps an editor view and its tab's sync in step. The view's doc always equals the sync's shadow once an edit is
 * diffed: every local transaction is diffed over the top-level blocks it changed, and the ids the diff gave new
 * blocks are written back on them. A shadow the sync moved (someone else's write, a refused edit) is patched into the
 * view over the top-level blocks that differ, off the undo history, with the selection carried by character ids.
 * Nothing is diffed or patched while an input method is composing; it waits for the composition to end.
 */
import type { Block, DocState } from '@open-artifact/docs-core';
import type { Node as PMNode } from 'prosemirror-model';
import { Selection, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { DiffError, type IdFix, type TopWindow } from '../sync/diff.ts';
import { type PageNode, docToPage } from '../sync/page.ts';
import type { TabSync } from '../sync/tab-sync.ts';
import { schema } from './schema.ts';

/** The meta key of transactions the binding makes itself (patches and id fixes): they are not edits. */
export const SYNCED = 'docSynced';

export const isSyncedTransaction = (tr: Transaction) => tr.getMeta(SYNCED) === true;

export function pmDocOf(doc: DocState): PMNode {
  return schema.nodeFromJSON(docToPage(doc));
}

/** The top-level blocks that differ between two docs: `[from, to)` of `before`, replaced by `after`'s `[from, end)`. */
export function changedTop(before: PMNode, after: PMNode): { from: number; to: number; end: number } | null {
  if (before === after) return null;
  const a = before.childCount;
  const b = after.childCount;
  let from = 0;
  while (from < a && from < b && sameNode(before.child(from), after.child(from))) from++;
  if (from === a && from === b) return null;
  let to = a;
  let end = b;
  while (to > from && end > from && sameNode(before.child(to - 1), after.child(end - 1))) {
    to--;
    end--;
  }
  return { from, to, end };
}

const sameNode = (a: PMNode, b: PMNode) => a === b || a.eq(b);

/** A text position's place by ids: the text block, and the character (or atom) right before it, if any. */
interface IdPlace {
  bid: string;
  after: string | null;
}

function blocksById(blocks: readonly Block[], out = new Map<string, Block>()): Map<string, Block> {
  for (const block of blocks) {
    out.set(block.id, block);
    if (block.children) blocksById(block.children, out);
  }
  return out;
}

/** Inline index (characters count by code point, atoms as one) of a text offset within a PM text block. */
function itemIndexAt(node: PMNode, offset: number): number {
  let index = 0;
  let pos = 0;
  for (let i = 0; i < node.childCount && pos < offset; i++) {
    const child = node.child(i);
    if (child.isText) {
      const text = child.text!;
      const take = Math.min(text.length, offset - pos);
      index += [...text.slice(0, take)].length;
      pos += take;
    } else {
      index += 1;
      pos += child.nodeSize;
    }
  }
  return index;
}

/** PM text offset of an inline index within a PM text block. */
function offsetOfIndex(node: PMNode, index: number): number {
  let left = index;
  let pos = 0;
  for (let i = 0; i < node.childCount && left > 0; i++) {
    const child = node.child(i);
    if (child.isText) {
      const chars = [...child.text!];
      const take = Math.min(chars.length, left);
      pos += chars.slice(0, take).join('').length;
      left -= take;
    } else {
      pos += child.nodeSize;
      left -= 1;
    }
  }
  return pos;
}

export function idPlaceOf(doc: PMNode, shown: Map<string, Block>, pos: number): IdPlace | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock || !parent.attrs.bid) return null;
  const block = shown.get(parent.attrs.bid);
  if (!block?.inline) return null;
  const index = itemIndexAt(parent, $pos.parentOffset);
  return { bid: parent.attrs.bid, after: index > 0 ? (block.inline[index - 1]?.id ?? null) : null };
}

export function posOfIdPlace(doc: PMNode, shadow: DocState, place: IdPlace): number | null {
  let blockId = place.bid;
  let index = 0;
  const blocks = blocksById(shadow.blocks);
  if (place.after) {
    let found = false;
    for (const block of blocks.values()) {
      const at = block.inline?.findIndex(item => item.id === place.after) ?? -1;
      if (at >= 0) {
        blockId = block.id;
        index = at + 1;
        found = true;
        break;
      }
    }
    if (!found) return null;
  } else if (!blocks.has(blockId)) return null;
  let out: number | null = null;
  doc.descendants((node, pos) => {
    if (out !== null) return false;
    if (node.isTextblock && node.attrs.bid === blockId) {
      out = pos + 1 + offsetOfIndex(node, index);
      return false;
    }
    return !node.isTextblock;
  });
  return out;
}

/** What the binding uses of an editor view. */
export type BoundView = Pick<EditorView, 'state' | 'dispatch' | 'composing'>;

export interface BindingEvents {
  /** The diff failed: the view was put back to the shadow. */
  failed?(error: unknown): void;
  /** The view changed under the person (another page's write landed): for whatever draws over the text. */
  patched?(): void;
}

export class TabBinding {
  readonly sync: TabSync;
  private view: BoundView | null = null;
  /** The view's doc the shadow equals. */
  private synced: PMNode;
  /** The shadow the view shows. */
  private shown: DocState;
  private waitingShadow: DocState | null = null;
  private dirty = false;
  private writable: boolean;
  private events: BindingEvents;

  constructor(sync: TabSync, options: { writable: boolean; events?: BindingEvents }) {
    this.sync = sync;
    this.writable = options.writable;
    this.events = options.events ?? {};
    this.shown = sync.shadow;
    this.synced = pmDocOf(sync.shadow);
  }

  /** The doc a new editor state starts from. */
  get doc(): PMNode {
    return this.synced;
  }

  get shadow(): DocState {
    return this.shown;
  }

  attach(view: BoundView): void {
    this.view = view;
    if (view.state.doc !== this.synced) this.patch(this.sync.shadow);
  }

  detach(): void {
    this.view = null;
  }

  setWritable(writable: boolean): void {
    this.writable = writable;
  }

  /** After the view took a transaction. */
  afterTransaction(tr: Transaction): void {
    if (!tr.docChanged) return;
    if (isSyncedTransaction(tr) && this.view?.state.doc === this.synced) return;
    this.flush();
  }

  /** An input method started composing: others' writes wait until it is done. */
  compositionStarted(): void {
    this.sync.hold(true);
  }

  /** The composition ended: what waited is done now. */
  compositionEnded(): void {
    if (this.dirty) this.flush();
    if (this.waitingShadow) {
      this.waitingShadow = null;
      this.patch(this.sync.shadow);
    }
    this.sync.hold(false);
  }

  /** The sync's shadow moved: shown in the view. */
  showShadow(shadow: DocState): void {
    const view = this.view;
    if (!view) {
      this.shown = shadow;
      this.synced = pmDocOf(shadow);
      return;
    }
    if (view.composing) {
      this.waitingShadow = shadow;
      return;
    }
    // Local edits not yet diffed go first, so the shadow has them.
    if (view.state.doc !== this.synced) this.flush();
    this.patch(shadow);
  }

  private flush(): void {
    const view = this.view;
    if (!view) return;
    if (view.composing) {
      this.dirty = true;
      return;
    }
    this.dirty = false;
    const doc = view.state.doc;
    const range = changedTop(this.synced, doc);
    if (!range) {
      this.synced = doc;
      return;
    }
    if (!this.writable) {
      this.synced = doc;
      return;
    }
    const nodes: PageNode[] = [];
    for (let i = range.from; i < range.end; i++) nodes.push(doc.child(i).toJSON() as PageNode);
    const window: TopWindow = { from: range.from, to: range.to, nodes };
    let fixes: IdFix[];
    try {
      const diff = this.sync.edit(window);
      fixes = diff.fixes;
      this.shown = diff.shadow;
    } catch (error) {
      if (!(error instanceof DiffError)) throw error;
      this.events.failed?.(error);
      this.patch(this.sync.shadow);
      return;
    }
    if (fixes.length) {
      const tr = view.state.tr;
      for (const fix of fixes) {
        const pos = posOfPath(tr.doc, fix.path);
        if (pos !== null) tr.setNodeAttribute(pos, 'bid', fix.id);
      }
      tr.setMeta(SYNCED, true).setMeta('addToHistory', false);
      this.synced = tr.doc;
      view.dispatch(tr);
    } else {
      this.synced = doc;
    }
  }

  private patch(shadow: DocState): void {
    const view = this.view;
    const next = pmDocOf(shadow);
    if (!view) {
      this.shown = shadow;
      this.synced = next;
      return;
    }
    const state = view.state;
    const before = this.shown;
    this.shown = shadow;
    const start = state.doc.content.findDiffStart(next.content);
    if (start === null) {
      this.synced = state.doc;
      return;
    }
    // Only what differs is replaced, so the undo history maps the person's own steps through it.
    let { a: endA, b: endB } = state.doc.content.findDiffEnd(next.content)!;
    const overlap = start - Math.min(endA, endB);
    if (overlap > 0) {
      endA += overlap;
      endB += overlap;
    }
    const shownBlocks = blocksById(before.blocks);
    const anchor = idPlaceOf(state.doc, shownBlocks, state.selection.anchor);
    const head = idPlaceOf(state.doc, shownBlocks, state.selection.head);
    const tr = state.tr.replace(start, endA, next.slice(start, endB));
    if (!tr.doc.eq(next)) {
      tr.replaceWith(0, tr.doc.content.size, next.content);
    }
    const selection = carrySelection(tr.doc, shadow, state.selection, tr.selection, anchor, head);
    if (selection) tr.setSelection(selection);
    tr.setMeta(SYNCED, true).setMeta('addToHistory', false);
    this.synced = tr.doc;
    view.dispatch(tr);
    // A plugin's fix-up (a table made whole) is an edit of the person's; a reader keeps it to itself.
    if (view.state.doc !== this.synced) {
      if (this.writable) this.flush();
      else this.synced = view.state.doc;
    }
    this.events.patched?.();
  }
}

function carrySelection(doc: PMNode, shadow: DocState, was: Selection, mapped: Selection, anchor: IdPlace | null, head: IdPlace | null): Selection | null {
  if (!(was instanceof TextSelection)) return null;
  const a = anchor ? posOfIdPlace(doc, shadow, anchor) : null;
  const h = head ? posOfIdPlace(doc, shadow, head) : null;
  if (a === null && h === null) return null;
  try {
    return TextSelection.create(doc, a ?? mapped.anchor, h ?? mapped.head);
  } catch {
    return Selection.near(doc.resolve(Math.min(a ?? mapped.head, doc.content.size)));
  }
}

/** Position of the node at `path` (child indexes from the doc down). */
export function posOfPath(doc: PMNode, path: readonly number[]): number | null {
  let node = doc;
  let pos = 0;
  for (let depth = 0; depth < path.length; depth++) {
    const index = path[depth]!;
    if (index >= node.childCount) return null;
    if (depth > 0) pos += 1;
    for (let i = 0; i < index; i++) pos += node.child(i).nodeSize;
    node = node.child(index);
  }
  return pos;
}
