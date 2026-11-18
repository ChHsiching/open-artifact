/** Draws cell colours, opens the cell menu on a right-click or the Menu key inside a table, and on Mod-Y, with nothing to redo, inserts again the row or column last inserted. */
import { announce } from '@open-artifact/editor-kit';
import { redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { CellSelection, cellAround } from 'prosemirror-tables';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { caretIn, cellSelectionHas, refOf, repeatTableInsert, selectionCell, targetOf } from './table-menu.ts';
import { isHexColor } from './table-ops.ts';
import { openContextMenu, pagePoint } from './store.ts';

const key = new PluginKey<DecorationSet>('tableCells');

function cellColors(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === 'cell') {
      const color: unknown = node.attrs.background;
      if (isHexColor(color)) decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `--cell-bg: ${color.toLowerCase()}` }));
      return false;
    }
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

/** The cell under a right-click, with the caret moved into it unless the selection already holds it. */
function cellAtPointer(view: EditorView, event: MouseEvent): number | null {
  const element = event.target instanceof Element ? event.target.closest('td, th') : null;
  if (!element || !view.dom.contains(element)) return null;
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) return null;
  const $cell = cellAround(view.state.doc.resolve(hit.pos));
  if (!$cell || !targetOf(view.state, $cell.pos)) return null;
  const { selection } = view.state;
  const holds =
    selection instanceof CellSelection
      ? cellSelectionHas(view.state, $cell.pos)
      : cellAround(selection.$from)?.pos === $cell.pos && cellAround(selection.$to)?.pos === $cell.pos;
  if (!holds) {
    const $hit = view.state.doc.resolve(hit.pos);
    const inside = cellAround($hit)?.pos === $cell.pos && $hit.parent.inlineContent;
    view.dispatch(inside ? view.state.tr.setSelection(TextSelection.create(view.state.doc, hit.pos)) : caretIn(view.state.tr, $cell.pos));
  }
  return $cell.pos;
}

/** How long after the Menu key (or Shift+F10) the browser's own context menu event is still that key's. */
const KEY_MENU_MS = 1000;

export function tablePlugins(): Plugin[] {
  let keyMenuAt = 0;
  return [
    keymap({ 'Mod-y': (state, dispatch, view) => redo(state, dispatch) || (!!view && repeatTableInsert(view, announce)) }),
    new Plugin<DecorationSet>({
      key,
      state: {
        init: (_config, state) => cellColors(state.doc),
        apply: (tr, before) => (tr.docChanged ? cellColors(tr.doc) : before),
      },
      props: {
        decorations: state => key.getState(state),
        handleDOMEvents: {
          contextmenu(view, event) {
            if (Date.now() - keyMenuAt < KEY_MENU_MS) {
              keyMenuAt = 0;
              event.preventDefault();
              return true;
            }
            if (!view.editable) return false;
            const cellPos = cellAtPointer(view, event);
            if (cellPos === null) return false;
            const target = targetOf(view.state, cellPos);
            const at = pagePoint(view.dom, event.clientX, event.clientY);
            if (!target || !at) return false;
            event.preventDefault();
            openContextMenu(refOf(target), at);
            return true;
          },
        },
        handleKeyDown(view, event) {
          if (!view.editable || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return false;
          const target = selectionCell(view.state);
          if (!target) return false;
          const coords = view.coordsAtPos(view.state.selection.head);
          const at = pagePoint(view.dom, coords.left, coords.bottom);
          if (!at) return false;
          event.preventDefault();
          keyMenuAt = Date.now();
          openContextMenu(refOf(target), at);
          return true;
        },
      },
    }),
  ];
}
