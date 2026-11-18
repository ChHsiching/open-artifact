/**
 * Between editor positions and the doc model's ids: a range of words is kept as the ids of its first and last
 * character (or atom), so it follows the words through everyone's edits; a cell or an empty paragraph by its block id.
 * Each code point of text is one character of the model, each atom one item.
 */
import type { Block, DocState } from '@open-artifact/docs-core';
import type { Node as PMNode } from 'prosemirror-model';

export interface PosRange {
  from: number;
  to: number;
}

/** Where an inline item of the model is: its text block and index there. */
interface ItemPlace {
  block: string;
  index: number;
}

const itemIndexes = new WeakMap<DocState, Map<string, ItemPlace>>();
const textBlocks = new WeakMap<DocState, Map<string, Block>>();
const blockPositions = new WeakMap<PMNode, Map<string, { pos: number; node: PMNode }>>();

function blocksOf(doc: DocState): Map<string, Block> {
  let known = textBlocks.get(doc);
  if (known) return known;
  known = new Map();
  const visit = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      known!.set(block.id, block);
      if (block.children) visit(block.children);
    }
  };
  visit(doc.blocks);
  textBlocks.set(doc, known);
  return known;
}

function itemsOf(doc: DocState): Map<string, ItemPlace> {
  let known = itemIndexes.get(doc);
  if (known) return known;
  known = new Map();
  for (const block of blocksOf(doc).values()) block.inline?.forEach((item, index) => known!.set(item.id, { block: block.id, index }));
  itemIndexes.set(doc, known);
  return known;
}

/** The position of every node of the editor's doc that carries a block id. */
function positionsOf(doc: PMNode): Map<string, { pos: number; node: PMNode }> {
  let known = blockPositions.get(doc);
  if (known) return known;
  const found = new Map<string, { pos: number; node: PMNode }>();
  doc.descendants((node, pos) => {
    const bid = node.attrs.bid as string | null | undefined;
    if (bid && !found.has(bid)) found.set(bid, { pos, node });
    return !node.isTextblock;
  });
  blockPositions.set(doc, found);
  return found;
}

/** The items of a text block, each with its position in the editor's doc and size there. */
export function itemSpans(node: PMNode, pos: number): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = [];
  let at = pos + 1;
  node.forEach(child => {
    if (child.isText) {
      for (const ch of child.text!) {
        spans.push({ from: at, to: at + ch.length });
        at += ch.length;
      }
    } else {
      spans.push({ from: at, to: at + child.nodeSize });
      at += child.nodeSize;
    }
  });
  return spans;
}

/**
 * The ids of the first and last item wholly inside `[from, to)`, or `null` when there is none or the editor's doc and
 * the model disagree about a block (the model has not caught up with typing yet).
 */
export function idsOfRange(doc: PMNode, shadow: DocState, from: number, to: number): [string, string] | null {
  const blocks = blocksOf(shadow);
  let first: string | null = null;
  let last: string | null = null;
  let broken = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (broken) return false;
    if (!node.isTextblock) return true;
    const spans = itemSpans(node, pos);
    const inside = spans.map((span, index) => ({ span, index })).filter(({ span }) => span.from >= from && span.to <= to);
    if (!inside.length) return false;
    const block = node.attrs.bid ? blocks.get(node.attrs.bid as string) : undefined;
    if (!block?.inline || block.inline.length !== spans.length) {
      broken = true;
      return false;
    }
    first ??= block.inline[inside[0]!.index]!.id;
    last = block.inline[inside.at(-1)!.index]!.id;
    return false;
  });
  if (broken || first === null || last === null) return null;
  return [first, last];
}

/** Where two item ids are now in the editor's doc: from the start of the first to the end of the last. */
export function rangeOfIds(doc: PMNode, shadow: DocState, ids: readonly [string, string]): PosRange | null {
  const items = itemsOf(shadow);
  const start = items.get(ids[0]);
  const end = items.get(ids[1]);
  if (!start || !end) return null;
  const positions = positionsOf(doc);
  const startBlock = positions.get(start.block);
  const endBlock = positions.get(end.block);
  if (!startBlock || !endBlock) return null;
  const startSpan = itemSpans(startBlock.node, startBlock.pos)[start.index];
  const endSpan = itemSpans(endBlock.node, endBlock.pos)[end.index];
  if (!startSpan || !endSpan || startSpan.from >= endSpan.to) return null;
  return { from: startSpan.from, to: endSpan.to };
}

/** A block's node by id: the whole cell, or a text block's inside. */
export function rangeOfBlock(doc: PMNode, id: string): (PosRange & { node: PMNode }) | null {
  const found = positionsOf(doc).get(id);
  if (!found) return null;
  if (found.node.isTextblock) return { from: found.pos + 1, to: found.pos + found.node.nodeSize - 1, node: found.node };
  return { from: found.pos, to: found.pos + found.node.nodeSize, node: found.node };
}

/** Whether the model knows the item ids at all (for telling deleted words from a tab not loaded yet). */
export function hasItem(shadow: DocState, id: string): boolean {
  return itemsOf(shadow).has(id);
}

/** The id of the text block holding a position (for the thread's location), if any. */
export function blockIdAt(doc: PMNode, pos: number): string | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth--) {
    const bid = $pos.node(depth).attrs.bid as string | null | undefined;
    if (bid) return bid;
  }
  return null;
}

/**
 * The words between two positions, one unit per item and one `\n` between text blocks, with each unit's position
 * (`-1` for a break). Used to find copied words again in what was pasted.
 */
export interface TextUnits {
  text: string;
  starts: number[];
  ends: number[];
}

export function textUnits(doc: PMNode, from: number, to: number): TextUnits {
  const units: TextUnits = { text: '', starts: [], ends: [] };
  let seen = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const spans = itemSpans(node, pos).filter(span => span.from >= from && span.to <= to);
    if (seen) {
      units.text += '\n';
      units.starts.push(-1);
      units.ends.push(-1);
    }
    seen = true;
    for (const span of spans) {
      const slice = doc.textBetween(span.from, span.to, '', '￼');
      units.text += [...slice].length === 1 ? slice : '￼';
      units.starts.push(span.from);
      units.ends.push(span.to);
    }
    return false;
  });
  return units;
}

/** Positions of the units `[start, end)` of a {@link textUnits} result. */
export function unitRange(units: TextUnits, start: number, end: number): PosRange | null {
  let from = -1;
  let to = -1;
  for (let i = start; i < end; i++) {
    if (units.starts[i] === -1) continue;
    if (from === -1) from = units.starts[i]!;
    to = units.ends[i]!;
  }
  return from === -1 || to <= from ? null : { from, to };
}

/** The unit indexes `[start, end)` covering `[from, to)` in a {@link textUnits} result. */
export function unitsCovering(units: TextUnits, from: number, to: number): [number, number] | null {
  let start = -1;
  let end = -1;
  units.starts.forEach((unitFrom, index) => {
    if (unitFrom === -1) return;
    if (unitFrom >= from && units.ends[index]! <= to) {
      if (start === -1) start = index;
      end = index + 1;
    }
  });
  return start === -1 ? null : [start, end];
}
