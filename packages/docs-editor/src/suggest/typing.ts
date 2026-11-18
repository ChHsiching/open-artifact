/**
 * Suggesting mode's edits as ops: what the person types, deletes or breaks into a new line, worked out against the tab
 * as the editor shows it and written as suggestions of theirs (`suggest: "<id>"` on each op; docs-core proposes the
 * change instead of making it). Typed words are an addition; deleted words stay, struck; words of the person's own
 * still-open addition go outright. One burst of typing or deleting at one place is one suggestion: it joins the
 * person's suggestion right beside it, else it starts a new one.
 *
 * Every plan is worked out before anything is written, so a refusal changes nothing. What the model can't hold as a
 * suggestion yet (a block split in two, joined blocks, formatting, tables, pictures) is refused with a line to show.
 */
import { type Block, type DocState, type Inline, type Proposal, findBlock } from '@open-artifact/docs-core';
import type { Mark, Node as PMNode, ResolvedPos, Slice } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { schema } from '../editor/schema.ts';

type Json = Record<string, unknown>;

export const REFUSALS = {
  notYet: 'that change can’t be made as a suggestion yet',
  uploads: 'images and files can’t be added as a suggestion',
  uploadsLeftOut: 'images and files can’t be added as a suggestion, so they were left out. Your text was kept',
  itemBreak: 'a list item can’t be split in two as a suggestion yet',
  flattened: 'the line breaks in that paste can’t be kept in a suggestion, so the pasted text stays in this line, joined together',
  peer: 'that’s someone else’s suggestion: to remove it, reject it from its card or ask an editor',
  changed: 'someone else just changed that spot, so your change was not made. Check that line before you go on',
} as const;

/** What a plan needs of the page. */
export interface PlanContext {
  /** The editor's state; its doc is the tab as `shadow` holds it. */
  state: EditorState;
  shadow: DocState;
  /** A suggestion the person may add to: their own, not someone else's nor an agent's. */
  mine(id: string): boolean;
  /** Ids for what the write adds, from the page's writing session. */
  take(count: number): string[];
  /** A new suggestion's id. */
  fresh(): string;
}

/** Where the caret goes once the write is shown: after a character (or at a text block's start), or near a position. */
export type Caret = { bid: string; after: string | null } | { near: number; bias: -1 | 1 };

export type Plan =
  | { kind: 'write'; ops: Json[]; id: string; caret: Caret }
  | { kind: 'move'; caret: Caret }
  | { kind: 'refuse'; why: string };

const refuse = (why: string): Plan => ({ kind: 'refuse', why });
const chars = (from: string, to: string = from) => ({ kind: 'chars', range: [from, to] });
const blocks = (...ids: string[]) => ({ kind: 'blocks', ids });

const isSuggestMark = (mark: Mark) => mark.type === schema.marks.suggestIns || mark.type === schema.marks.suggestDel;

/** The formatting new words take at a place: the stored marks, else those of the words there; never a suggestion's. */
export function marksAt(state: EditorState, from: number, to = from): Json[] {
  const $from = state.doc.resolve(from);
  const marks = state.storedMarks ?? (from === to ? $from.marks() : ($from.marksAcross(state.doc.resolve(to)) ?? []));
  return marks.filter(mark => !isSuggestMark(mark)).map(mark => mark.toJSON() as Json);
}

/** Inline content as the op carries it: text with its formatting, and chips. */
export const textContent = (text: string, marks: Json[] = []): Json[] => (text ? [{ type: 'text', text, ...(marks.length ? { marks } : {}) }] : []);

/** How many ids inline content takes: one per character (code point), one per chip. */
export function itemCount(content: readonly Json[]): number {
  let count = 0;
  for (const node of content) count += node.type === 'text' ? Array.from(String(node.text ?? '')).length : 1;
  return count;
}

/** A text block of the editor's doc, with the model's block it shows. */
interface TextPlace {
  node: PMNode;
  /** Position of the block's content start. */
  start: number;
  /** Depth of the text block. */
  depth: number;
  block: Block;
  $pos: ResolvedPos;
}

function textPlace(ctx: PlanContext, pos: number): TextPlace | null {
  const $pos = ctx.state.doc.resolve(pos);
  const node = $pos.parent;
  const bid = node.attrs.bid;
  if (!node.isTextblock || typeof bid !== 'string' || !bid) return null;
  const block = findBlock(ctx.shadow, bid)?.block;
  if (!block?.inline) return null;
  return { node, start: $pos.start(), depth: $pos.depth, block, $pos };
}

/** The item index (characters by code point, chips as one) of a text offset in a text block. */
export function itemIndexAt(node: PMNode, offset: number): number {
  let index = 0;
  let pos = 0;
  for (let i = 0; i < node.childCount && pos < offset; i++) {
    const child = node.child(i);
    if (child.isText) {
      const take = Math.min(child.text!.length, offset - pos);
      index += Array.from(child.text!.slice(0, take)).length;
      pos += take;
    } else {
      index += 1;
      pos += child.nodeSize;
    }
  }
  return index;
}

const index = (place: TextPlace, pos: number) => itemIndexAt(place.node, pos - place.start);

/** A proposal the person may add to, else null. */
const ownOf = (ctx: PlanContext, proposal: Proposal | undefined) => (proposal && ctx.mine(proposal.id) ? proposal.id : null);

/** The block's own suggestion, when it is an addition of the person's. */
const ownBlock = (ctx: PlanContext, block: Block) => (block.suggest?.op === 'ins' ? ownOf(ctx, block.suggest) : null);

/** An item of someone else's suggestion among `items`. */
const foreign = (ctx: PlanContext, items: readonly Inline[]) => items.some(item => item.suggest && !ctx.mine(item.suggest.id));

/** A block that is part of someone else's suggestion, or struck: nothing is added to or struck in it. */
const closedBlock = (ctx: PlanContext, block: Block) => !!block.suggest && !(block.suggest.op === 'ins' && ctx.mine(block.suggest.id));

/**
 * Inline content (typed or pasted words, a line break) going in at `from`..`to` of one text block: added, and the
 * words it goes over struck.
 */
export function planInsert(ctx: PlanContext, from: number, to: number, content: Json[]): Plan | null {
  const place = textPlace(ctx, from);
  if (!place || !ctx.state.doc.resolve(to).sameParent(place.$pos)) return refuse(REFUSALS.notYet);
  const count = itemCount(content);
  const a = index(place, from);
  const b = index(place, to);
  if (b <= a) {
    if (!count) return null;
  } else if (!count) return planRemove(ctx, from, to, -1);
  const { block } = place;
  const inline = block.inline!;
  const over = inline.slice(a, b);
  // Not over someone else's suggestion, nor in the middle of one.
  const left = inline[a - 1]?.suggest;
  const inside = b <= a && !!left && left.id === inline[a]?.suggest?.id && !ctx.mine(left.id);
  if (closedBlock(ctx, block) || foreign(ctx, over) || inside) return refuse(REFUSALS.peer);
  const id =
    ownBlock(ctx, block) ??
    over.map(item => ownOf(ctx, item.suggest)).find(Boolean) ??
    ownOf(ctx, inline[a - 1]?.suggest) ??
    ownOf(ctx, inline[b]?.suggest) ??
    ctx.fresh();
  const ids = ctx.take(count);
  const source = { as: 'inline', from: { kind: 'inline', content } };
  const made = { ids: { from: ids[0], count }, with: source, suggest: id };
  let op: Json;
  if (b > a) op = { op: 'replace', target: chars(inline[a]!.id, inline[b - 1]!.id), ...made };
  else if (a > 0) op = { op: 'insert', target: chars(inline[a - 1]!.id), side: 'after', ...made };
  else if (inline.length) op = { op: 'insert', target: chars(inline[0]!.id), side: 'before', ...made };
  else op = { op: 'insert', target: blocks(block.id), side: 'start', ...made };
  return { kind: 'write', ops: [op], id, caret: { bid: block.id, after: ids[count - 1]! } };
}

/** Words `from`..`to` of one text block struck (the person's own added ones go outright); `dir` says where the caret goes. */
export function planRemove(ctx: PlanContext, from: number, to: number, dir: -1 | 1): Plan | null {
  const place = textPlace(ctx, from);
  if (!place || !ctx.state.doc.resolve(to).sameParent(place.$pos)) return refuse(REFUSALS.notYet);
  return strike(ctx, place, index(place, from), index(place, to), dir);
}

function strike(ctx: PlanContext, place: TextPlace, a: number, b: number, dir: -1 | 1): Plan | null {
  if (b <= a) return null;
  const { block } = place;
  const inline = block.inline!;
  const items = inline.slice(a, b);
  const before = a > 0 ? inline[a - 1]!.id : null;
  if (items.every(item => item.suggest?.op === 'del')) return { kind: 'move', caret: { bid: block.id, after: dir < 0 ? before : items[items.length - 1]!.id } };
  if (closedBlock(ctx, block) || foreign(ctx, items)) return refuse(REFUSALS.peer);
  const id =
    items.map(item => ownOf(ctx, item.suggest)).find(Boolean) ??
    ownOf(ctx, inline[a - 1]?.suggest) ??
    ownOf(ctx, inline[b]?.suggest) ??
    ownBlock(ctx, block) ??
    ctx.fresh();
  // The person's own added words go; the rest stay, struck.
  const left = items.filter(item => item.suggest?.op !== 'ins');
  const after = dir < 0 ? before : (left[left.length - 1]?.id ?? before);
  return { kind: 'write', ops: [{ op: 'delete', target: chars(items[0]!.id, items[items.length - 1]!.id), suggest: id }], id, caret: { bid: block.id, after } };
}

/** Backspace (`dir` -1) or Delete (1) at a caret: the character beside it, over struck words, which are passed by. */
export function planDeleteChar(ctx: PlanContext, pos: number, dir: -1 | 1): Plan | null {
  const place = textPlace(ctx, pos);
  if (!place) return refuse(REFUSALS.notYet);
  const inline = place.block.inline!;
  const at = index(place, pos);
  let k = dir < 0 ? at - 1 : at;
  while (k >= 0 && k < inline.length && inline[k]!.suggest?.op === 'del') k += dir;
  if (k < 0 || k >= inline.length) {
    // Only struck words between the caret and the block's edge: the caret goes past them.
    if (k !== (dir < 0 ? at - 1 : at)) return { kind: 'move', caret: { bid: place.block.id, after: dir < 0 ? null : (inline[inline.length - 1]?.id ?? null) } };
    return planEdge(ctx, place, dir);
  }
  return strike(ctx, place, k, k + 1, dir);
}

/**
 * Backspace at a text block's start, or Delete at its end: an empty block the person suggested goes; joining two
 * blocks can't be suggested yet.
 */
function planEdge(ctx: PlanContext, place: TextPlace, dir: -1 | 1): Plan | null {
  const doc = ctx.state.doc;
  let target = place;
  if (dir > 0) {
    // The text block after this one.
    const next = nextTextblock(doc, place.start + place.node.content.size + 1);
    if (next === null) return null;
    const found = textPlace(ctx, next);
    if (!found) return refuse(REFUSALS.notYet);
    target = found;
  } else if (place.start <= 1 && place.depth === 1) return null;
  const own = ownBlock(ctx, target.block);
  if (!own || target.block.inline!.length > 0) return refuse(REFUSALS.notYet);
  // Its list item goes with it, when the item holds nothing else and is the person's addition too.
  let id = target.block.id;
  let depth = target.depth;
  const parent = target.$pos.node(target.depth - 1);
  if (parent.type === schema.nodes.listItem && parent.childCount === 1 && parent.attrs.suggestId === own && parent.attrs.suggestOp === 'ins') {
    id = parent.attrs.bid as string;
    depth -= 1;
  }
  const caret: Caret = dir < 0 ? { near: target.$pos.before(depth), bias: -1 } : { bid: place.block.id, after: place.block.inline![place.block.inline!.length - 1]?.id ?? null };
  return { kind: 'write', ops: [{ op: 'delete', target: blocks(id), suggest: own }], id: own, caret };
}

function nextTextblock(doc: PMNode, from: number): number | null {
  let found: number | null = null;
  doc.nodesBetween(Math.min(from, doc.content.size), doc.content.size, (node, pos) => {
    if (found !== null) return false;
    if (node.isTextblock && pos >= from - 1) {
      found = pos + 1;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Enter at a caret: a new empty paragraph (a list item in a list) after the block when the caret is at its end, or
 * before it at its start, added by the suggestion. In a code block it is a new line of code.
 */
export function planEnter(ctx: PlanContext, pos: number): Plan | null {
  const place = textPlace(ctx, pos);
  if (!place) return refuse(REFUSALS.notYet);
  if (place.node.type === schema.nodes.codeBlock) return planInsert(ctx, pos, pos, textContent('\n'));
  const { block, $pos } = place;
  const inline = block.inline!;
  const at = index(place, pos);
  const atEnd = inline.slice(at).every(item => item.suggest?.op === 'del');
  const atStart = at === 0 && !atEnd;
  const parent = $pos.node(place.depth - 1);
  const inItem = parent.type === schema.nodes.listItem;
  if (!atEnd && !atStart) return refuse(inItem ? REFUSALS.itemBreak : REFUSALS.notYet);
  if (closedBlock(ctx, block)) return refuse(REFUSALS.peer);
  // In a list item, a new item when the caret is at the item's edge; else a paragraph in the item.
  const edge = atEnd ? $pos.index(place.depth - 1) === parent.childCount - 1 : $pos.index(place.depth - 1) === 0;
  const item = inItem && edge && typeof parent.attrs.bid === 'string' ? (parent.attrs.bid as string) : null;
  if (item && parent.attrs.suggestId && !(parent.attrs.suggestOp === 'ins' && ctx.mine(parent.attrs.suggestId as string))) return refuse(REFUSALS.peer);
  const id =
    ownBlock(ctx, block) ??
    (item && parent.attrs.suggestOp === 'ins' ? ownOf(ctx, { id: parent.attrs.suggestId as string, op: 'ins' }) : null) ??
    ownOf(ctx, inline[at - 1]?.suggest) ??
    ctx.fresh();
  // A list item and its paragraph, or a paragraph: the item's id first (the model deals them in document order).
  const ids = ctx.take(item ? 2 : 1);
  const op = {
    op: 'insert',
    target: blocks(item ?? block.id),
    side: atEnd ? 'after' : 'before',
    ids: { from: ids[0], count: ids.length },
    with: { as: 'blocks', from: { kind: 'blocks', content: [{ type: 'paragraph' }] } },
    suggest: id,
  };
  const caret: Caret = atEnd ? { bid: ids[ids.length - 1]!, after: null } : { bid: block.id, after: null };
  return { kind: 'write', ops: [op], id, caret };
}

// ---- what the page pastes, and edits it didn't make itself ------------------------------------------------------

export interface Flattened {
  content: Json[];
  /** Line breaks or blocks were joined into the one line. */
  joined: boolean;
  /** Pictures or files were left out. */
  leftOut: boolean;
}

/** A pasted slice as one line of inline content: blocks and line breaks joined (by a space; in code, a new line). */
export function flattenSlice(slice: Slice, code: boolean): Flattened {
  const content: Json[] = [];
  let joined = false;
  let leftOut = false;
  let blocksSeen = 0;
  const gap = code ? '\n' : ' ';
  const push = (text: string, marks: Json[] = []) => {
    if (!text) return;
    const last = content[content.length - 1];
    if (last && last.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text = `${String(last.text)}${text}`;
    else content.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
  };
  const inlineOf = (node: PMNode) => {
    node.forEach(child => {
      if (child.isText) push(child.text!, code ? [] : child.marks.filter(mark => !isSuggestMark(mark)).map(mark => mark.toJSON() as Json));
      else if (child.type === schema.nodes.hardBreak) {
        joined = true;
        push(gap);
      } else if (child.type === schema.nodes.media) leftOut = true;
      else if (!code) content.push({ ...(child.toJSON() as Json), marks: undefined });
    });
  };
  const visit = (node: PMNode) => {
    if (node.isTextblock) {
      if (blocksSeen++ > 0) {
        joined = true;
        push(gap);
      }
      inlineOf(node);
    } else if (node.type === schema.nodes.media) leftOut = true;
    else if (node.isLeaf) {
      if (!node.isInline) return;
      inlineOf({ forEach: (f: (child: PMNode) => void) => f(node) } as unknown as PMNode);
    } else node.forEach(visit);
  };
  slice.content.forEach(visit);
  for (const node of content) if (node.marks === undefined) delete node.marks;
  return { content, joined, leftOut };
}

/** An edit made some other way (cut, a spell check, the keyboard of a phone): what it does, when it is plain text. */
export type Intent = { kind: 'insert'; from: number; to: number; content: Json[] } | { kind: 'remove'; from: number; to: number } | { kind: 'refuse'; why: string };

export function intentOf(tr: Transaction): Intent {
  const step = tr.steps.length === 1 ? tr.steps[0] : null;
  const pictures = tr.steps.some(each => each instanceof ReplaceStep && sliceHas((each as unknown as { slice: Slice }).slice, schema.nodes.media!));
  if (!step || step.constructor !== ReplaceStep) return { kind: 'refuse', why: pictures ? REFUSALS.uploads : REFUSALS.notYet };
  const { from, to, slice } = step as unknown as { from: number; to: number; slice: Slice };
  const $from = tr.before.resolve(from);
  if (!$from.parent.isTextblock || !$from.sameParent(tr.before.resolve(to)) || slice.openStart !== slice.openEnd) return { kind: 'refuse', why: REFUSALS.notYet };
  if (pictures) return { kind: 'refuse', why: REFUSALS.uploads };
  if (!slice.content.size) return { kind: 'remove', from, to };
  const flat = flattenSlice(slice, $from.parent.type === schema.nodes.codeBlock);
  if (flat.joined) return { kind: 'refuse', why: REFUSALS.notYet };
  return { kind: 'insert', from, to, content: flat.content };
}

function sliceHas(slice: Slice, type: PMNode['type']): boolean {
  let found = false;
  slice.content.descendants(node => {
    if (node.type === type) found = true;
    return !found;
  });
  return found;
}
