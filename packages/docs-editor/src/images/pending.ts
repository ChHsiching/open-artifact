/**
 * Pictures still uploading: a shimmering box where each will go, and a dimmed picture being replaced. They are
 * decorations, so they never reach the doc, other people or the undo history; they move with the edits around them.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export interface PendingBox {
  w: number;
  h: number;
}

/** A box where an upload will go. */
interface PendingInsert {
  kind: 'insert';
  id: string;
  pos: number;
  box: PendingBox;
  order: number;
}

/** A picture whose bytes are being replaced. */
interface PendingReplace {
  kind: 'replace';
  id: string;
  pos: number;
}

type Pending = PendingInsert | PendingReplace;

interface PendingState {
  items: readonly Pending[];
  decorations: DecorationSet;
}

type PendingMeta =
  | { kind: 'add'; items: readonly Pending[] }
  | { kind: 'remove'; ids: readonly string[] };

export const pendingKey = new PluginKey<PendingState>('docImagesPending');

/** The uploads this page is still waiting for; a box whose upload is gone is dropped when its tab opens again. */
export const liveUploads = new Set<string>();

function drawBox(box: PendingBox): HTMLElement {
  const dom = document.createElement('span');
  dom.className = 'doc-image-pending';
  dom.setAttribute('role', 'img');
  dom.setAttribute('aria-label', 'Uploading…');
  dom.contentEditable = 'false';
  dom.style.width = `${box.w}px`;
  dom.style.aspectRatio = `${box.w} / ${box.h}`;
  return dom;
}

function decorate(doc: PMNode, items: readonly Pending[]): DecorationSet {
  if (!items.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    items.map(item => {
      if (item.kind === 'insert') return Decoration.widget(item.pos, () => drawBox(item.box), { side: 1 + item.order, key: `pending-${item.id}-${item.box.w}x${item.box.h}` });
      const node = doc.nodeAt(item.pos)!;
      return Decoration.node(item.pos, item.pos + node.nodeSize, { class: 'doc-image-replacing' });
    }),
  );
}

/** Moves each item with the edit; a box goes when the text on both sides of it is deleted, a picture when it is. */
function mapItems(items: readonly Pending[], tr: Transaction): Pending[] {
  const out: Pending[] = [];
  for (const item of items) {
    const result = tr.mapping.mapResult(item.pos, 1);
    if (item.kind === 'insert') {
      if (!result.deletedAcross) out.push({ ...item, pos: result.pos });
      continue;
    }
    if (result.deleted) continue;
    if (tr.doc.nodeAt(result.pos)?.type.name === 'media') out.push({ ...item, pos: result.pos });
  }
  return out;
}

export function pendingPlugin(): Plugin<PendingState> {
  return new Plugin<PendingState>({
    key: pendingKey,
    state: {
      init: () => ({ items: [], decorations: DecorationSet.empty }),
      apply(tr, value) {
        const meta = tr.getMeta(pendingKey) as PendingMeta | undefined;
        if (!tr.docChanged && !meta) return value;
        let items = tr.docChanged ? mapItems(value.items, tr) : [...value.items];
        if (meta?.kind === 'add') items = [...items, ...meta.items.filter(item => item.kind === 'insert' || tr.doc.nodeAt(item.pos)?.type.name === 'media')];
        if (meta?.kind === 'remove') items = items.filter(item => !meta.ids.includes(item.id));
        return { items, decorations: decorate(tr.doc, items) };
      },
    },
    props: {
      decorations: state => pendingKey.getState(state)?.decorations ?? null,
    },
    view(view) {
      const stale = pendingIds(view.state).filter(id => !liveUploads.has(id));
      if (stale.length) queueMicrotask(() => view.isDestroyed || view.dispatch(removePending(view.state.tr, stale)));
      return {};
    },
  });
}

/** Puts a box for each upload at its position, in the order given. */
export function addPending(tr: Transaction, items: ReadonlyArray<{ id: string; pos: number; box: PendingBox }>): Transaction {
  return tr.setMeta(pendingKey, { kind: 'add', items: items.map((item, order) => ({ kind: 'insert', ...item, order })) } satisfies PendingMeta);
}

/** Dims the picture at `pos` until its new bytes arrive. */
export function markReplacing(tr: Transaction, id: string, pos: number): Transaction {
  return tr.setMeta(pendingKey, { kind: 'add', items: [{ kind: 'replace', id, pos }] } satisfies PendingMeta);
}

export function removePending(tr: Transaction, ids: readonly string[]): Transaction {
  return tr.setMeta(pendingKey, { kind: 'remove', ids } satisfies PendingMeta);
}

/** Where an upload's box (or the picture it replaces) is now, or null when it was deleted. */
export function pendingPos(state: EditorState, id: string): number | null {
  return pendingKey.getState(state)?.items.find(item => item.id === id)?.pos ?? null;
}

export function pendingIds(state: EditorState): string[] {
  return (pendingKey.getState(state)?.items ?? []).map(item => item.id);
}
