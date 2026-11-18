/** The page bar's insert controls: a table, a picture, a checklist, and "+" for everything the slash menu offers. */
import { ChromeButton, ChromeDivider, ChromeMenu, ChromeMenuItem, ToolButton } from '@open-artifact/editor-kit/react';
import { ImagePlus, ListChecks, Plus, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDocs } from '../app/store.ts';
import { currentView, useEditor } from '../editor/format.ts';
import { ItemIcon } from './icons.tsx';
import { useCanPickImage } from './image.ts';
import { canWrite } from './plugin.ts';
import { ORDERED_ITEMS, type SlashItem, fitsPlace, slashPlace } from './slash-items.ts';

const itemById = (id: string) => ORDERED_ITEMS.find(item => item.id === id)!;

/** Runs an item at the caret of the editor shown now. */
function runItem(item: SlashItem): void {
  const view = currentView();
  if (!view || !canWrite(view)) return;
  view.focus();
  const at = view.state.selection.from;
  item.run(view, { from: at, to: at });
}

export function InsertBar(): ReactNode {
  const writable = useDocs(state => state.writable);
  const view = useEditor(state => state.view);
  const inTable = useEditor(state => (state.state ? slashPlace(state.state).inTable : false));
  const canImage = useCanPickImage();
  if (!writable) return null;
  const off = !view;
  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Insert">
      <ChromeDivider className="mx-1 h-5" />
      <ToolButton size="md" tipSide="bottom" label="Table" icon={<Table2 />} disabled={off || inTable} onClick={() => runItem(itemById('table'))} />
      {canImage ? <ToolButton size="md" tipSide="bottom" label="Image" icon={<ImagePlus />} disabled={off} onClick={() => runItem(itemById('image'))} /> : null}
      <ToolButton size="md" tipSide="bottom" label="Checklist" icon={<ListChecks />} disabled={off} onClick={() => runItem(itemById('checkbox'))} />
      <ChromeMenu
        tip={{ label: 'Insert' }}
        trigger={
          <ChromeButton square aria-label="Insert" disabled={off} className="[&_svg]:size-[18px]">
            <Plus />
          </ChromeButton>
        }
      >
        <InsertMenuItems />
      </ChromeMenu>
    </div>
  );
}

/** The slash menu's items that fit at the caret, unfiltered. */
function InsertMenuItems(): ReactNode {
  const state = useEditor(hold => hold.state);
  const place = state ? slashPlace(state) : { inTable: false, inQuoteOrItem: false, canPickImage: false };
  const items = ORDERED_ITEMS.filter(item => fitsPlace(item, place));
  return items.map(item => (
    <ChromeMenuItem key={item.id} icon={<ItemIcon icon={item.icon} />} onSelect={() => setTimeout(() => runItem(item), 0)}>
      {item.label}
    </ChromeMenuItem>
  ));
}
