/** The editor the page shows now, and what is at its cursor, for the toolbars and menus around it. */
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { create } from 'zustand';
import { type BlockStyle, type ListKind, blockStyle, inTable, linkAt, listKind, markActive, markAttr, selectedMedia } from './commands.ts';
import { schema, type TextColor } from './schema.ts';

export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  highlight: boolean;
  textColor: TextColor | null;
  block: BlockStyle | null;
  list: ListKind | null;
  link: { from: number; to: number; href: string } | null;
  inTable: boolean;
  inCode: boolean;
  media: boolean;
  empty: boolean;
}

export function readFormat(state: EditorState): FormatState {
  const { marks } = schema;
  return {
    bold: markActive(state, marks.bold!),
    italic: markActive(state, marks.italic!),
    underline: markActive(state, marks.underline!),
    strike: markActive(state, marks.strike!),
    code: markActive(state, marks.code!),
    highlight: markActive(state, marks.highlight!),
    textColor: (markAttr(state, marks.textColor!, 'color') as TextColor | null) ?? null,
    block: blockStyle(state),
    list: listKind(state),
    link: linkAt(state),
    inTable: inTable(state),
    inCode: state.selection.$from.parent.type === schema.nodes.codeBlock,
    media: !!selectedMedia(state),
    empty: state.selection.empty,
  };
}

export interface EditorHold {
  view: EditorView | null;
  /** The editor's state, raised on every transaction. */
  state: EditorState | null;
  tab: string | null;
  focused: boolean;
}

export const useEditor = create<EditorHold>(() => ({ view: null, state: null, tab: null, focused: false }));

export const currentView = () => useEditor.getState().view;

/** Runs an edit on the editor shown now, and gives it the keyboard back. */
export function runOnEditor(command: (state: EditorState, dispatch: EditorView['dispatch'], view: EditorView) => boolean): boolean {
  const view = currentView();
  if (!view) return false;
  const done = command(view.state, view.dispatch, view);
  view.focus();
  return done;
}
