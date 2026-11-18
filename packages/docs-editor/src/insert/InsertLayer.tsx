/** Over the text: the typeahead menu at the caret and the open chip picker. */
import type { ReactNode } from 'react';
import { useDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import { CalendarPicker } from './CalendarPicker.tsx';
import { DropdownPicker } from './DropdownPicker.tsx';
import { InsertDropdownPicker } from './InsertDropdownPicker.tsx';
import { insertState } from './plugin.ts';
import { TypeaheadMenu } from './TypeaheadMenu.tsx';

export function InsertLayer(): ReactNode {
  return (
    <>
      <TypeaheadMenu />
      <ChipPicker />
    </>
  );
}

function ChipPicker(): ReactNode {
  const view = useEditor(state => state.view);
  const state = useEditor(state => state.state);
  const writable = useDocs(state => state.writable);
  const picker = insertState(state)?.picker;
  if (!view || !picker || !writable) return null;
  switch (picker.kind) {
    case 'date':
      return <CalendarPicker key={picker.id} view={view} pos={picker.pos} />;
    case 'dropdown':
      return <DropdownPicker key={picker.id} view={view} pos={picker.pos} />;
    case 'insertDropdown':
      return <InsertDropdownPicker key={picker.id} view={view} pos={picker.pos} />;
  }
}
