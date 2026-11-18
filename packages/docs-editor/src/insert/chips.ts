/** Putting chips in at the caret: dates, dropdowns and mentions, each followed by a space. */
import type { Attrs, Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '../editor/schema.ts';
import { type Range, closePicker, openPicker } from './plugin.ts';

const { nodes } = schema;

/** Removes the typed trigger and query, leaving the caret where they were. */
export function clearRange(view: EditorView, range: Range): void {
  if (range.to > range.from) view.dispatch(view.state.tr.delete(range.from, range.to));
}

/** Puts `node` and a space in at the caret (or in place of `range`); answers where the node went, or null. */
export function insertChip(view: EditorView, node: PMNode, range?: Range): number | null {
  const { state } = view;
  const from = range?.from ?? state.selection.from;
  const to = range?.to ?? state.selection.to;
  const $from = state.doc.resolve(from);
  if (!$from.parent.inlineContent || $from.parent.type === nodes.codeBlock) return null;
  const tr = state.tr.replaceWith(from, to, [node, schema.text(' ')]);
  tr.setSelection(TextSelection.create(tr.doc, from + node.nodeSize + 1));
  view.dispatch(tr.scrollIntoView());
  return from;
}

export function insertDate(view: EditorView, ts: string, options: { range?: Range; open?: boolean } = {}): void {
  const at = insertChip(view, nodes.date!.create({ ts }), options.range);
  if (at !== null && options.open) openPicker(view, 'date', at);
  view.focus();
}

export function insertDropdownChip(view: EditorView, enumId: string, options: { range?: Range; open?: boolean } = {}): void {
  const at = insertChip(view, nodes.dropdown!.create({ enum: enumId, index: null }), options.range);
  if (at !== null && options.open) openPicker(view, 'dropdown', at);
}

export function insertMention(view: EditorView, attrs: Attrs, range?: Range): void {
  insertChip(view, nodes.mention!.create(attrs), range);
  view.focus();
}

/** Sets a chip's attrs and puts the caret after it. */
export function setChipAttrs(view: EditorView, pos: number, attrs: Attrs): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
  view.dispatch(tr);
}

/** Closes the chip's picker and gives the editor the keyboard back, the caret after the chip. */
export function leaveChip(view: EditorView, pos: number | null): void {
  closePicker(view);
  const node = pos === null ? null : view.state.doc.nodeAt(pos);
  if (pos !== null && node) {
    const after = pos + node.nodeSize;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after)));
  }
  view.focus();
}

