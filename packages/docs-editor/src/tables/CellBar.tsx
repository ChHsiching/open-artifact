/** The bar over a cell selection: merge, split, colour, delete rows or columns, and the rest of the cell menu. */
import { announce } from '@open-artifact/editor-kit';
import { Card, ChromeButton, ChromeDivider, ChromeMenu, ToolButton } from '@open-artifact/editor-kit/react';
import { Ellipsis, Palette } from 'lucide-react';
import type { EditorState } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { useEditor } from '../editor/format.ts';
import { CellMenuItems, ColorItems } from './CellMenu.tsx';
import { cellElement } from './geometry.ts';
import { TableIconView } from './icons.tsx';
import { cellMenu, refOf } from './table-menu.ts';

const BAR_HEIGHT = 40;
const GAP = 8;

/** The selected cells' bounds on screen. */
function selectionBox(view: EditorView, selection: CellSelection): DOMRect | null {
  let box: DOMRect | null = null;
  selection.forEachCell((_node, pos) => {
    const rect = cellElement(view, pos)?.getBoundingClientRect();
    if (!rect) return;
    box = box
      ? DOMRect.fromRect({
          x: Math.min(box.left, rect.left),
          y: Math.min(box.top, rect.top),
          width: Math.max(box.right, rect.right) - Math.min(box.left, rect.left),
          height: Math.max(box.bottom, rect.bottom) - Math.min(box.top, rect.top),
        })
      : rect;
  });
  return box;
}

export function CellBar(): ReactNode {
  const view = useEditor(hold => hold.view);
  const state = useEditor(hold => hold.state);
  const focused = useEditor(hold => hold.focused);
  const [menus, setMenus] = useState(0);
  if (!view || !state || !view.editable || !(state.selection instanceof CellSelection)) return null;
  if (!focused && menus === 0) return null;
  return <Bar view={view} state={state} selection={state.selection} onMenu={open => setMenus(count => Math.max(0, count + (open ? 1 : -1)))} />;
}

function Bar({ view, state, selection, onMenu }: { view: EditorView; state: EditorState; selection: CellSelection; onMenu(open: boolean): void }): ReactNode {
  const page = view.dom.closest('.doc-page');
  const box = selectionBox(view, selection);
  const model = cellMenu(state, announce, selection.$headCell.pos);
  if (!page || !box || !model) return null;
  const pageBox = page.getBoundingClientRect();
  const above = box.top - BAR_HEIGHT - GAP >= 0;
  const top = (above ? box.top - BAR_HEIGHT - GAP : box.bottom + GAP) - pageBox.top;
  const left = Math.max(0, box.left - pageBox.left);
  const side = above ? 'top' : 'bottom';
  const keepSelection = (event: MouseEvent) => event.preventDefault();
  const structure = model.structure.filter(action => action.key === 'merge' || action.key === 'split');
  const removeLines = model.remove.filter(action => action.key !== 'deleteTable');
  const menuOpen = (open: boolean) => onMenu(open);
  return (
    <Card role="toolbar" aria-label="Cell actions" className="absolute z-30 h-10 gap-0.5 px-1" style={{ left, top }} onMouseDown={keepSelection}>
      {structure.map(action => (
        <ToolButton key={action.key} size="md" tipSide={side} label={action.label} icon={action.icon ? <TableIconView name={action.icon} /> : null} onClick={() => action.run(view)} />
      ))}
      <ChromeMenu
        side={side === 'top' ? 'bottom' : 'top'}
        onOpenChange={menuOpen}
        trigger={<ToolButton size="md" tipSide={side} label="Cell color" icon={<Palette className="size-4" strokeWidth={1.75} />} />}
      >
        <ColorItems current={model.color.current} onPick={value => model.color.pick(view, value)} />
      </ChromeMenu>
      <ChromeDivider />
      {removeLines.map(action => (
        <ChromeButton key={action.key} className="px-2 text-[13px]" onClick={() => action.run(view)}>
          {action.label}
        </ChromeButton>
      ))}
      <ChromeDivider />
      <ChromeMenu
        side={side === 'top' ? 'bottom' : 'top'}
        align="end"
        onOpenChange={menuOpen}
        trigger={<ToolButton size="md" tipSide={side} label="More cell actions" icon={<Ellipsis className="size-4" strokeWidth={1.75} />} />}
      >
        <CellMenuItems view={view} cell={refOf(model.target)} />
      </ChromeMenu>
    </Card>
  );
}
