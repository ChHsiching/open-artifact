/** The open tab's headings, as its editor holds them, and going to one. */
import type { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { useMemo } from 'react';
import { currentView, useEditor } from '../editor/format.ts';

export interface OutlineHeading {
  /** The heading block's id (or its position, before it has one). */
  key: string;
  level: number;
  text: string;
  pos: number;
}

/** The headings at the top level of a tab's text, with words in them. */
export function headingsOf(doc: PMNode): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  doc.forEach((node, pos) => {
    const level = node.type.name === 'paragraph' ? (node.attrs.heading as number | null) : null;
    if (!level || node.attrs.suggestOp === 'ins') return;
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    out.push({ key: (node.attrs.bid as string | null) ?? `at-${pos}`, level, text, pos });
  });
  return out;
}

/** The headings of tab `tab` while its editor is the one shown; none otherwise. */
export function useOutline(tab: string | null): OutlineHeading[] {
  const doc = useEditor(state => (state.tab === tab ? (state.state?.doc ?? null) : null));
  return useMemo(() => (doc ? headingsOf(doc) : []), [doc]);
}

/** Puts the cursor at the start of the heading and scrolls it to the top of the page. */
export function jumpToHeading(heading: OutlineHeading): void {
  const view = currentView();
  if (!view) return;
  const node = view.state.doc.nodeAt(heading.pos);
  if (!node) return;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, heading.pos + 1)));
  view.focus();
  const dom = view.nodeDOM(heading.pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
