/**
 * What the find bar does to the editor shown now: searches it, steps through the matches, replaces them and lands on
 * one when it closes. The editor's matches live in its state (plugin.ts); the bar's words in its store (store.ts).
 */
import { stepIndex } from '@open-artifact/editor-kit';
import type { Node as PMNode } from 'prosemirror-model';
import { redo, undo } from 'prosemirror-history';
import { type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { getDocs, setDocs, useDocs } from '../app/store.ts';
import { foldedIds, toggleFold } from '../editor/fold.ts';
import { currentView, useEditor } from '../editor/format.ts';
import { schema } from '../editor/schema.ts';
import { type FindMeta, findKey, findState } from './plugin.ts';
import { type ReplaceOutcome, planReplace, writeReplacements } from './search.ts';
import { getFindBar, setFindBar } from './store.ts';

const send = (view: EditorView, meta: FindMeta) => view.dispatch(view.state.tr.setMeta(findKey, meta).setMeta('addToHistory', false));

const headingLevel = (node: PMNode) => (node.type === schema.nodes.paragraph ? ((node.attrs.heading as number | null) ?? 0) : 0);

/** The folded heading that hides `pos`, if one does. */
function foldHiding(state: EditorState, pos: number): string | null {
  const folded = foldedIds(state);
  if (!folded.size) return null;
  const { doc } = state;
  const index = doc.resolve(pos).index(0);
  let hiding = 0;
  let by: string | null = null;
  for (let at = 0; at <= index && at < doc.childCount; at++) {
    const node = doc.child(at);
    const level = headingLevel(node);
    if (hiding && level && level <= hiding) {
      hiding = 0;
      by = null;
    }
    if (hiding) {
      if (at === index) return by;
      continue;
    }
    if (level && node.attrs.bid && folded.has(node.attrs.bid as string)) {
      hiding = level;
      by = node.attrs.bid as string;
    }
  }
  return null;
}

/** Scrolls the page so `pos` is in sight, a third of the way down, when it is not already. */
function scrollToPos(view: EditorView, pos: number): void {
  let coords: { top: number; bottom: number };
  try {
    coords = view.coordsAtPos(pos);
  } catch {
    return;
  }
  const scroller = view.dom.closest<HTMLElement>('[data-doc-scroll]');
  if (!scroller) return;
  const box = scroller.getBoundingClientRect();
  const margin = Math.min(120, box.height / 4);
  if (coords.top >= box.top + margin && coords.bottom <= box.bottom - margin) return;
  scroller.scrollTop += coords.top - (box.top + box.height / 3);
}

/** Shows the current match: its section unfolded and the page scrolled to it. */
export function revealCurrent(view: EditorView): void {
  const { matches, current } = findState(view.state);
  const match = matches[current];
  if (!match) return;
  for (let tries = 0; tries < 6; tries++) {
    const heading = foldHiding(view.state, match.from);
    if (!heading) break;
    toggleFold(heading)(view.state, view.dispatch);
  }
  scrollToPos(view, match.from);
}

/** Searches the editor shown now for the bar's words (or clears it while find is closed). */
export function searchView(view: EditorView | null = currentView(), near?: number): void {
  if (!view) return;
  const { query, caseSensitive } = getFindBar();
  if (getDocs().find === 'closed' || !query) {
    if (findState(view.state).query) send(view, { kind: 'clear' });
    return;
  }
  send(view, { kind: 'search', query, caseSensitive, near: near ?? view.state.selection.from });
  revealCurrent(view);
}

/** ⌘F or ⇧⌘H: opens the bar (replace only for someone who may edit) and gives its field the keyboard. */
export function openFind(mode: 'find' | 'replace'): boolean {
  const { find, writable } = getDocs();
  setFindBar(state => ({ summons: state.summons + 1, summoned: mode }));
  const next = mode === 'replace' && writable ? 'replace' : 'find';
  if (find !== next) setDocs({ find: next });
  return true;
}

export function setQuery(query: string): void {
  setFindBar({ query, outcome: null, undoable: 0, redoable: 0 });
  searchView();
}

export function setReplacement(replacement: string): void {
  setFindBar({ replacement, outcome: null, undoable: 0, redoable: 0 });
}

export function setCaseSensitive(caseSensitive: boolean): void {
  setFindBar({ caseSensitive, outcome: null });
  searchView();
}

/** The next (1) or previous (-1) match, wrapping. */
export function step(delta: 1 | -1): void {
  const view = currentView();
  if (!view) return;
  const { matches, current } = findState(view.state);
  const next = stepIndex(current, matches.length, delta);
  if (next < 0) return;
  send(view, { kind: 'show', index: next });
  revealCurrent(view);
}

/** Replaces the shown match, or (`all`) every match, a batch at a time. Answers whether the text changed. */
export function replace(all: boolean): boolean {
  const view = currentView();
  const bar = getFindBar();
  if (!view || !getDocs().writable || !view.editable) return false;
  const found = findState(view.state);
  if (!found.query || found.query !== bar.query || found.caseSensitive !== bar.caseSensitive) return false;
  const text = bar.replacement;
  const plan = planReplace(view.state.doc, found.matches, found.current, {
    query: bar.query,
    caseSensitive: bar.caseSensitive,
    text,
    all,
    again: all && bar.lastReplaceAll === text,
  });
  const outcome: ReplaceOutcome = { serial: (bar.outcome?.serial ?? 0) + 1, all, replaced: 0, frozen: plan.frozen, already: plan.already, left: plan.left, more: plan.more, refused: false };
  if (!plan.targets.length) {
    setFindBar({ outcome });
    if (!all && found.matches.length > 1) {
      send(view, { kind: 'show', index: (found.current + 1) % found.matches.length });
      revealCurrent(view);
    }
    return false;
  }
  const tr = writeReplacements(view.state.tr, plan.targets, text);
  const lastEnd = tr.mapping.map(plan.targets[plan.targets.length - 1]!.to);
  tr.setMeta(findKey, { kind: 'near', near: all && plan.left === 0 ? 0 : lastEnd } satisfies FindMeta);
  const before = view.state.doc;
  view.dispatch(tr);
  if (view.state.doc === before) {
    setFindBar({ outcome: { ...outcome, frozen: 0, already: 0, left: 0, more: false, refused: true } });
    return false;
  }
  setFindBar({ outcome: { ...outcome, replaced: plan.targets.length }, lastReplaceAll: all ? text : bar.lastReplaceAll });
  if (!all) revealCurrent(view);
  return true;
}

/** ⌘Z or ⇧⌘Z in the bar: undoes or redoes a replacement made from it. */
export function undoFromBar(again: boolean): boolean {
  const view = currentView();
  if (!view) return false;
  const done = (again ? redo : undo)(view.state, view.dispatch);
  if (done) setFindBar({ outcome: null });
  return done;
}

/** Closes the bar. `land`: the cursor goes to the shown match, selected, and the text takes the keyboard. */
export function closeFind(land: boolean): void {
  const view = currentView();
  if (view && land) {
    const { matches, current } = findState(view.state);
    const match = matches[current];
    if (match) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView());
  }
  setFindBar({ outcome: null, undoable: 0, redoable: 0, firstOnOpen: false });
  if (getDocs().find !== 'closed') setDocs({ find: 'closed' });
  if (view && land) view.focus();
}

/** Keeps every editor in step with the bar: a newly shown tab is searched, a closed bar clears the highlights. */
export function watchFind(): () => void {
  const stopEditor = useEditor.subscribe((state, before) => {
    if (!state.view || state.view === before.view) return;
    const first = getFindBar().firstOnOpen;
    if (first) setFindBar({ firstOnOpen: false });
    searchView(state.view, first ? 0 : undefined);
  });
  const stopDocs = useDocs.subscribe((state, before) => {
    if ((state.find === 'closed') !== (before.find === 'closed')) searchView();
  });
  return () => {
    stopEditor();
    stopDocs();
  };
}
