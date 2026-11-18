/** The entries of a cell's menu, drawn from the menu model. */
import { announce } from '@open-artifact/editor-kit';
import { ChromeMenuItem, ChromeMenuSeparator, ChromeSubmenu } from '@open-artifact/editor-kit/react';
import { ArrowUpDown, Palette, UnfoldHorizontal } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import type { ReactNode } from 'react';
import { useEditor } from '../editor/format.ts';
import { TableIconView } from './icons.tsx';
import { type CellRef, type TableAction, cellMenu, gripMenu, resolveRef } from './table-menu.ts';
import { CELL_COLORS } from './table-ops.ts';

export function ActionItem({ view, action }: { view: EditorView; action: TableAction }): ReactNode {
  return (
    <ChromeMenuItem
      danger={action.danger}
      checked={action.checked}
      disabled={action.disabledReason !== undefined}
      title={action.disabledReason}
      icon={action.icon ? <TableIconView name={action.icon} /> : undefined}
      onSelect={() => action.run(view)}
    >
      {action.label}
    </ChromeMenuItem>
  );
}

/** A colour's dot, drawn the way the cell draws it. */
export function ColorDot({ value }: { value: string | null }): ReactNode {
  return <span className="block size-3.5 rounded-full ring-1 ring-inset ring-chrome-line" data-cell-swatch={value ?? 'none'} />;
}

export function ColorItems({ current, onPick }: { current: string | null | undefined; onPick(value: string | null): void }): ReactNode {
  return CELL_COLORS.map(color => (
    <ChromeMenuItem key={color.label} checked={current === color.value} icon={<ColorDot value={color.value} />} onSelect={() => onPick(color.value)}>
      {color.label}
    </ChromeMenuItem>
  ));
}

/** Everything the cell menu offers for the cell `cell`. */
export function CellMenuItems({ view, cell }: { view: EditorView; cell: CellRef }): ReactNode {
  const state = useEditor(hold => hold.state) ?? view.state;
  const target = resolveRef(state, cell);
  const model = target ? cellMenu(state, announce, target.cellPos) : null;
  if (!model) return null;
  const item = (action: TableAction) => <ActionItem key={action.key} view={view} action={action} />;
  return (
    <>
      {model.insert.map(item)}
      <ChromeSubmenu label="Move row or column" icon={<ArrowUpDown className="size-4" strokeWidth={1.75} />}>
        {model.move.map(item)}
      </ChromeSubmenu>
      <ChromeSubmenu label="Set column width" icon={<UnfoldHorizontal className="size-4" strokeWidth={1.75} />}>
        {model.widths.map(width => (
          <ChromeMenuItem key={width.key} checked={width.checked} onSelect={() => width.run(view)}>
            {width.label}
          </ChromeMenuItem>
        ))}
      </ChromeSubmenu>
      <ChromeMenuSeparator />
      {model.remove.map(item)}
      <ChromeMenuSeparator />
      {model.sort.map(item)}
      {model.align.map(item)}
      <ChromeSubmenu label="Cell color" icon={<Palette className="size-4" strokeWidth={1.75} />}>
        <ColorItems current={model.color.current} onPick={value => model.color.pick(view, value)} />
      </ChromeSubmenu>
      {model.structure.length ? <ChromeMenuSeparator /> : null}
      {model.structure.map(item)}
    </>
  );
}

/** A row's or column's grip menu. */
export function GripMenuItems({ view, cell, kind }: { view: EditorView; cell: CellRef; kind: 'row' | 'col' }): ReactNode {
  const state = useEditor(hold => hold.state) ?? view.state;
  const target = resolveRef(state, cell);
  if (!target) return null;
  return gripMenu(state, kind, target.cellPos, announce).map(action => <ActionItem key={action.key} view={view} action={action} />);
}
