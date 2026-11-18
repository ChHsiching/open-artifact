/**
 * Comments in the text: the words each thread of the tab hangs on are marked, the open thread's more strongly; a click
 * on marked words opens their thread. The marks follow edits as they are typed, and are found again by their ids
 * whenever the tab's model moves. Words carrying a comment that are copied and pasted in the same tab take the
 * comment with them: the paste becomes another place of the thread.
 */
import type { CommentThread } from '@open-artifact/runtime';
import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { docClient } from '../app/doc-client.ts';
import { useDocs } from '../app/store.ts';
import { type DocAnchor, anchorRanges, serializeAnchor, withPlace } from './anchor.ts';
import { idsOfRange, rangeOfBlock, rangeOfIds, textUnits, unitRange, unitsCovering } from './anchor-map.ts';
import { type Hold, NEW_THREAD, canComment, docComments, setActive, setCommentUi, threadById, useCommentUi } from './store.ts';

/** One marked range of a thread (or of the composer, {@link NEW_THREAD}). */
export interface MarkedRange {
  id: string;
  /** Which place of the thread (`null`: its first range). */
  place: string | null;
  from: number;
  to: number;
  kind: 'words' | 'cell' | 'block';
}

/** Words pasted where copied words carried a thread: they become a place of it once they have ids. */
interface PendingPlace {
  thread: string;
  from: number;
  to: number;
}

interface CommentsPluginState {
  tab: string | null;
  ranges: MarkedRange[];
  active: string | null;
  shown: boolean;
  decorations: DecorationSet;
  pending: PendingPlace[];
}

type CommentsMeta =
  | { type: 'tab'; tab: string }
  | { type: 'set'; ranges: MarkedRange[]; active: string | null; shown: boolean }
  | { type: 'placed' };

export const commentsKey = new PluginKey<CommentsPluginState>('docComments');

/** What was last copied from a tab: its words, and the threads on words inside them (as unit indexes). */
interface Clip {
  tab: string;
  text: string;
  hits: Array<{ thread: string; start: number; end: number }>;
}

let clip: Clip | null = null;

function decorate(doc: PMNode, ranges: readonly MarkedRange[], active: string | null, shown: boolean): DecorationSet {
  if (!shown) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  for (const range of ranges) {
    const on = range.id === active;
    const attrs = { 'data-comment': range.id, ...(range.place ? { 'data-comment-place': range.place } : {}) };
    if (range.kind === 'words') {
      if (range.to > range.from) decorations.push(Decoration.inline(range.from, range.to, { class: on ? 'doc-comment-anchor doc-comment-active' : 'doc-comment-anchor', ...attrs }, { range }));
    } else if (range.kind === 'cell') {
      decorations.push(Decoration.node(range.from, range.to, { class: on ? 'doc-comment-cell doc-comment-cell-active' : 'doc-comment-cell', ...attrs }, { range }));
    } else if (range.to >= range.from && range.from >= 1) {
      decorations.push(Decoration.node(range.from - 1, range.to + 1, { class: on ? 'doc-comment-block doc-comment-block-active' : 'doc-comment-block', ...attrs }, { range }));
    }
  }
  return DecorationSet.create(doc, decorations);
}

function mapRanges(ranges: readonly MarkedRange[], tr: Transaction): MarkedRange[] {
  const out: MarkedRange[] = [];
  for (const range of ranges) {
    const from = tr.mapping.map(range.from, range.kind === 'words' ? 1 : -1);
    const to = tr.mapping.map(range.to, range.kind === 'words' ? -1 : 1);
    if (range.kind === 'words' ? to > from : to >= from) out.push({ ...range, from, to });
  }
  return out;
}

/** The words a paste put in, if they are the words last copied from this tab: where the copied threads now hang. */
function pastedPlaces(tr: Transaction, before: EditorState, after: EditorState, tab: string | null): PendingPlace[] {
  if (!clip || !tab || clip.tab !== tab || !clip.hits.length) return [];
  const from = tr.mapping.map(before.selection.from, -1);
  const to = Math.max(from, after.selection.to);
  const units = textUnits(after.doc, from, to);
  if (units.text !== clip.text) return [];
  return clip.hits.flatMap(hit => {
    const range = unitRange(units, hit.start, hit.end);
    return range ? [{ thread: hit.thread, ...range }] : [];
  });
}

function recordCopy(view: EditorView): void {
  const state = commentsKey.getState(view.state);
  const { from, to, empty } = view.state.selection;
  if (!state?.tab || empty) {
    clip = null;
    return;
  }
  const units = textUnits(view.state.doc, from, to);
  const hits: Clip['hits'] = [];
  for (const range of state.ranges) {
    if (range.kind !== 'words' || range.id === NEW_THREAD || range.from < from || range.to > to) continue;
    const covered = unitsCovering(units, range.from, range.to);
    if (covered && !hits.some(hit => hit.thread === range.id && hit.start === covered[0])) hits.push({ thread: range.id, start: covered[0], end: covered[1] });
  }
  clip = { tab: state.tab, text: units.text, hits };
}

/** The threads that hang on a tab (and the composer's words), as the margin shows them. */
function anchorsOf(tab: string): Array<{ id: string; anchor: DocAnchor; visible: boolean }> {
  const { threads, active } = docComments.store.getState();
  const out: Array<{ id: string; anchor: DocAnchor; visible: boolean }> = [];
  for (const thread of threads) {
    const anchor = docComments.anchorOf(thread);
    if (anchor.tab === tab) out.push({ id: thread.id, anchor, visible: thread.status === 'open' || thread.id === active });
  }
  const composer = useCommentUi.getState().composer;
  if (composer && composer.anchor.tab === tab) out.push({ id: NEW_THREAD, anchor: composer.anchor, visible: true });
  return out;
}

const rangesKey = (ranges: readonly MarkedRange[]) => ranges.map(range => `${range.id}:${range.place}:${range.from}-${range.to}`).join('|');

/** Keeps one tab's marks found by their ids and in step with the threads. */
class CommentsView {
  private readonly view: EditorView;
  private readonly tab: string | null;
  private readonly stops: Array<() => void> = [];
  private scheduled = false;
  private settling = false;
  private idle: ReturnType<typeof setTimeout> | undefined;
  /** Moves already asked for, so a thread is re-anchored once per change. */
  private readonly moved = new Set<string>();
  private destroyed = false;

  constructor(view: EditorView) {
    this.view = view;
    this.tab = view.dom.getAttribute('data-tab');
    const tab = this.tab;
    if (tab) queueMicrotask(() => !this.destroyed && view.dispatch(view.state.tr.setMeta(commentsKey, { type: 'tab', tab } satisfies CommentsMeta)));
    this.stops.push(docComments.store.subscribe((next, before) => (next.threads !== before.threads || next.active !== before.active) && this.schedule()));
    this.stops.push(useCommentUi.subscribe((next, before) => next.composer !== before.composer && this.schedule()));
    this.stops.push(useDocs.subscribe((next, before) => next.comments !== before.comments && this.schedule()));
    try {
      this.stops.push(docClient().onShadow(shadowTab => shadowTab === this.tab && this.schedule()));
    } catch {
      // No doc yet: nothing to follow.
    }
    this.schedule();
  }

  update(view: EditorView, before: EditorState): void {
    if (view.state.doc !== before.doc) {
      clearTimeout(this.idle);
      this.idle = setTimeout(() => this.schedule(), 300);
    }
    const state = commentsKey.getState(view.state);
    if (state?.pending.length && !this.settling) void this.placePasted();
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.idle);
    for (const stop of this.stops) stop();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.destroyed) this.refresh();
    });
  }

  /** Finds every thread's words again by their ids, keeping words whose ends were deleted where the edits took them. */
  private refresh(): void {
    const tab = this.tab;
    if (!tab) return;
    const open = docClient().openTabOf(tab);
    const state = commentsKey.getState(this.view.state);
    if (!open || !state) return;
    const doc = this.view.state.doc;
    // The model and the view agree only once typed words are in the model.
    const inStep = open.binding.doc === doc;
    const shadow = open.binding.shadow;
    const ranges: MarkedRange[] = [];
    const holds: Record<string, Hold> = {};
    for (const { id, anchor, visible } of anchorsOf(tab)) {
      const found: MarkedRange[] = [];
      let lost = false;
      if (anchor.kind === 'words') {
        for (const { place, range } of anchorRanges(anchor)) {
          const at = inStep ? rangeOfIds(doc, shadow, range) : null;
          const kept = state.ranges.find(item => item.id === id && item.place === place);
          if (at) found.push({ id, place, kind: 'words', ...at });
          else if (kept) {
            found.push(kept);
            if (inStep) lost = true;
          }
        }
        if (lost && id !== NEW_THREAD) this.reanchor(id, anchor, found);
      } else if (anchor.kind === 'cell' || anchor.kind === 'block') {
        const at = rangeOfBlock(doc, anchor.kind === 'cell' ? anchor.cell : anchor.block);
        if (at && (anchor.kind === 'cell') === (at.node.type.name === 'cell')) found.push({ id, place: null, kind: anchor.kind, from: at.from, to: at.to });
      } else if (anchor.kind === 'cells') {
        // Each cell still there is marked; the thread is loose only once all of them are gone.
        for (const cell of anchor.cells) {
          const at = rangeOfBlock(doc, cell);
          if (at && at.node.type.name === 'cell') found.push({ id, place: null, kind: 'cell', from: at.from, to: at.to });
        }
      }
      holds[id] = anchor.kind === 'doc' ? 'page' : found.length ? 'ok' : 'detached';
      if (visible) ranges.push(...found);
    }
    const shown = useDocs.getState().comments !== 'hidden';
    const active = docComments.store.getState().active ?? (useCommentUi.getState().composer ? NEW_THREAD : null);
    const placed = useCommentUi.getState().placed;
    if (placed.tab !== tab || JSON.stringify(placed.holds) !== JSON.stringify(holds)) setCommentUi({ placed: { tab, holds } });
    if (rangesKey(ranges) === rangesKey(state.ranges) && active === state.active && shown === state.shown) return;
    this.view.dispatch(this.view.state.tr.setMeta(commentsKey, { type: 'set', ranges, active, shown } satisfies CommentsMeta).setMeta('addToHistory', false));
  }

  /** A thread whose first or last words were deleted hangs on what is left of them. */
  private reanchor(id: string, anchor: DocAnchor & { kind: 'words' }, found: readonly MarkedRange[]): void {
    if (!canComment() || !this.tab) return;
    const open = docClient().openTabOf(this.tab);
    if (!open) return;
    const doc = this.view.state.doc;
    const ranges = found.flatMap(range => {
      const ids = idsOfRange(doc, open.binding.shadow, range.from, range.to);
      return ids ? [{ place: range.place, ids }] : [];
    });
    const first = ranges.find(range => range.place === null) ?? ranges[0];
    if (!first) return;
    const next: DocAnchor = {
      ...anchor,
      range: first.ids,
      places: anchor.places.flatMap(place => {
        const range = ranges.find(item => item.place === place.id && item !== first);
        return range ? [{ id: place.id, range: range.ids }] : [];
      }),
    };
    const text = serializeAnchor(next);
    const key = `${id}:${text}`;
    if (text === serializeAnchor(anchor) || this.moved.has(key)) return;
    this.moved.add(key);
    void docComments.move(id, next);
  }

  /** Pasted words take the threads of the copied ones, once the model has given them ids. */
  private async placePasted(): Promise<void> {
    this.settling = true;
    try {
      await docClient().settled();
      if (this.destroyed || !this.tab) return;
      const open = docClient().openTabOf(this.tab);
      const state = commentsKey.getState(this.view.state);
      if (!open || !state?.pending.length) return;
      const pending = state.pending;
      this.view.dispatch(this.view.state.tr.setMeta(commentsKey, { type: 'placed' } satisfies CommentsMeta).setMeta('addToHistory', false));
      if (open.binding.doc !== this.view.state.doc) return;
      const byThread = new Map<string, Array<[string, string]>>();
      for (const place of pending) {
        const ids = idsOfRange(this.view.state.doc, open.binding.shadow, place.from, place.to);
        if (ids) byThread.set(place.thread, [...(byThread.get(place.thread) ?? []), ids]);
      }
      for (const [id, places] of byThread) {
        const thread = threadById(id);
        if (!thread) continue;
        const anchor = docComments.anchorOf(thread);
        let next = anchor;
        for (const range of places) next = withPlace(next, range);
        if (next !== anchor) await docComments.move(id, next);
      }
    } finally {
      this.settling = false;
    }
  }
}

/** The smallest marked range under a position. */
export function rangeAt(state: EditorState, pos: number): MarkedRange | null {
  const ranges = commentsKey.getState(state)?.ranges ?? [];
  let best: MarkedRange | null = null;
  for (const range of ranges) {
    if (range.id === NEW_THREAD || pos < range.from || pos > range.to) continue;
    if (!best || range.to - range.from < best.to - best.from) best = range;
  }
  return best;
}

/** The marked ranges of a thread in an editor state: its first range (or first cell) first, then the rest in order. */
export function rangesOf(state: EditorState | null, id: string): MarkedRange[] {
  const ranges = (state && commentsKey.getState(state)?.ranges) || [];
  return ranges.filter(range => range.id === id).sort((a, b) => ((a.place === null) !== (b.place === null) ? (a.place === null ? -1 : 1) : a.from - b.from));
}

/** How many ranges of words a thread is marked on now (more than one: a place can be taken off). */
export function liveRanges(state: EditorState | null, thread: CommentThread): number {
  return rangesOf(state, thread.id).filter(range => range.kind === 'words').length;
}

export function commentsPlugin(): Plugin<CommentsPluginState> {
  return new Plugin<CommentsPluginState>({
    key: commentsKey,
    state: {
      init: () => ({ tab: null, ranges: [], active: null, shown: true, decorations: DecorationSet.empty, pending: [] }),
      apply(tr, value, before, after) {
        const meta = tr.getMeta(commentsKey) as CommentsMeta | undefined;
        let next = value;
        if (tr.docChanged) {
          next = {
            ...next,
            ranges: mapRanges(next.ranges, tr),
            decorations: next.decorations.map(tr.mapping, tr.doc),
            pending: next.pending.flatMap(place => {
              const from = tr.mapping.map(place.from, 1);
              const to = tr.mapping.map(place.to, -1);
              return to > from ? [{ ...place, from, to }] : [];
            }),
          };
          if (tr.getMeta('uiEvent') === 'paste') {
            const pasted = pastedPlaces(tr, before, after, next.tab);
            if (pasted.length) next = { ...next, pending: [...next.pending, ...pasted] };
          }
        }
        if (meta?.type === 'tab') next = { ...next, tab: meta.tab };
        else if (meta?.type === 'set') next = { ...next, ranges: meta.ranges, active: meta.active, shown: meta.shown, decorations: decorate(tr.doc, meta.ranges, meta.active, meta.shown) };
        else if (meta?.type === 'placed') next = { ...next, pending: [] };
        return next;
      },
    },
    view: view => new CommentsView(view),
    props: {
      decorations: state => commentsKey.getState(state)?.decorations ?? null,
      handleClick(view, pos) {
        const state = commentsKey.getState(view.state);
        if (!state?.shown) return false;
        const range = rangeAt(view.state, pos);
        if (range) {
          if (docComments.store.getState().active !== range.id || useCommentUi.getState().activePlace !== range.place) setActive(range.id, range.place);
        } else if (docComments.store.getState().active) setActive(null);
        return false;
      },
      handleDOMEvents: {
        copy: view => {
          recordCopy(view);
          return false;
        },
        cut: view => {
          recordCopy(view);
          return false;
        },
      },
    },
  });
}
