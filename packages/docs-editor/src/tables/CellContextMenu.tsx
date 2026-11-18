/** The cell menu a right-click or the Menu key opens inside a table. */
import type { ReactNode } from 'react';
import { useEditor } from '../editor/format.ts';
import { AnchoredMenu } from './AnchoredMenu.tsx';
import { CellMenuItems } from './CellMenu.tsx';
import { closeContextMenu, useTableMenu } from './store.ts';

export function CellContextMenu(): ReactNode {
  const view = useEditor(hold => hold.view);
  const context = useTableMenu(state => state.context);
  if (!view || !context) return null;
  return (
    <AnchoredMenu
      key={`${context.left}:${context.top}`}
      left={context.left}
      top={context.top}
      open
      onClose={() => {
        closeContextMenu();
        requestAnimationFrame(() => {
          if (!view.isDestroyed && view.editable) view.focus();
        });
      }}
    >
      <CellMenuItems view={view} cell={context.ref} />
    </AnchoredMenu>
  );
}
