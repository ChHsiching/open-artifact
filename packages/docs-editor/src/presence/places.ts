/**
 * What a page publishes about where it is in the doc, and how a peer's published place is found in this page's text.
 * Places are character ids (the block, and the character right before the caret), so they still point at the same
 * spot after anyone's concurrent edits.
 */
import type { Block, DocState } from '@open-artifact/docs-core';
import { normalizePeerColor, peerValue, type PublishedPeerColor } from '@open-artifact/editor-kit';
import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, type Selection } from 'prosemirror-state';
import { idPlaceOf, posOfIdPlace } from '../editor/binding.ts';

/** A text position by ids: its text block, and the character (or atom) right before it. */
export type IdPlace = NonNullable<ReturnType<typeof idPlaceOf>>;

export interface PeerSelection {
  anchor: IdPlace;
  head: IdPlace;
}

/** What a page publishes under {@link PRESENCE_KEY}. */
export interface DocsPresence {
  /** The person's id: their pages share it. */
  who: string | null;
  /** The tab the page shows. */
  tab: string | null;
  /** The text selection (a caret when anchor and head are the same place). */
  sel: PeerSelection | null;
  /** A selected block (a rule, an embed): its id. */
  node: string | null;
  /** The page's color claim. */
  color: PublishedPeerColor | null;
}

export const PRESENCE_KEY = 'docs';

const ID_MAX = 128;

export function blockMap(blocks: readonly Block[], out = new Map<string, Block>()): Map<string, Block> {
  for (const block of blocks) {
    out.set(block.id, block);
    if (block.children) blockMap(block.children, out);
  }
  return out;
}

/** Where a selection is, by ids. A selection the ids can't name (cells, a gap) publishes nothing. */
export function selectionPlaces(doc: PMNode, shadow: DocState, selection: Selection): { sel: PeerSelection | null; node: string | null } {
  if (selection instanceof NodeSelection && selection.node.isBlock) {
    const bid = selection.node.attrs.bid;
    return { sel: null, node: typeof bid === 'string' && bid ? bid : null };
  }
  const shown = blockMap(shadow.blocks);
  const head = idPlaceOf(doc, shown, selection.head);
  if (!head) return { sel: null, node: null };
  const anchor = selection.anchor === selection.head ? head : (idPlaceOf(doc, shown, selection.anchor) ?? head);
  return { sel: { anchor, head }, node: null };
}

/** A place's position in `doc`; when its character is gone, the start of its block; `null` when the block is gone too. */
export function positionOf(doc: PMNode, shadow: DocState, place: IdPlace): number | null {
  const pos = posOfIdPlace(doc, shadow, place);
  if (pos !== null || place.after === null) return pos;
  return posOfIdPlace(doc, shadow, { bid: place.bid, after: null });
}

export interface PeerRange {
  from: number;
  to: number;
  head: number;
}

/**
 * A peer's selection in `doc`. A character this page has not read yet (the peer's place came before its write) keeps
 * the caret where it was drawn last, `previousHead`, rather than at the start of its block.
 */
export function rangeOf(doc: PMNode, shadow: DocState, sel: PeerSelection, previousHead: number | null = null): PeerRange | null {
  const kept = previousHead !== null && previousHead >= 0 && previousHead <= doc.content.size ? previousHead : null;
  const head = posOfIdPlace(doc, shadow, sel.head) ?? kept ?? positionOf(doc, shadow, sel.head);
  if (head === null) return null;
  const sameSpot = sel.anchor.bid === sel.head.bid && sel.anchor.after === sel.head.after;
  const anchor = sameSpot ? head : (positionOf(doc, shadow, sel.anchor) ?? head);
  return { from: Math.min(anchor, head), to: Math.max(anchor, head), head };
}

/** The span of the block with id `bid`. */
export function blockRange(doc: PMNode, bid: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.isBlock && node.attrs.bid === bid) {
      found = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return !node.isTextblock;
  });
  return found;
}

/** Where the agent's caret sits after a write: the end of the last text block, in reading order, that it changed. */
export function agentCaretOf(doc: PMNode, blocks: readonly string[]): number | null {
  if (blocks.length === 0) return null;
  const touched = new Set(blocks);
  let caret: number | null = null;
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (touched.has(node.attrs.bid)) caret = pos + node.nodeSize - 1;
      return false;
    }
    return true;
  });
  return caret;
}

function placeOf(value: unknown): IdPlace | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const bid = peerValue.str(raw.bid, ID_MAX);
  if (!bid) return null;
  if (raw.after === null || raw.after === undefined) return { bid, after: null };
  const after = peerValue.str(raw.after, ID_MAX);
  return after ? { bid, after } : null;
}

/** Reads a peer's published value; anything malformed is dropped. */
export function parseDocsPresence(value: Record<string, unknown>): DocsPresence {
  const rawSel = value.sel && typeof value.sel === 'object' ? (value.sel as Record<string, unknown>) : null;
  const head = rawSel ? placeOf(rawSel.head) : null;
  const anchor = rawSel ? (placeOf(rawSel.anchor) ?? head) : null;
  const rawColor = value.color && typeof value.color === 'object' ? (value.color as Record<string, unknown>) : null;
  const c = rawColor ? normalizePeerColor(rawColor.c) : undefined;
  const t = rawColor ? peerValue.num(rawColor.t) : null;
  return {
    who: peerValue.str(value.who, ID_MAX),
    tab: peerValue.str(value.tab, ID_MAX),
    sel: head && anchor ? { anchor, head } : null,
    node: peerValue.str(value.node, ID_MAX),
    color: c ? { c, t } : null,
  };
}
