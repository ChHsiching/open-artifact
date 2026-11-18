/**
 * The doc's tabs: the picker in the page bar, the list beside the text, the delete dialog, deleted tabs and their
 * restore, files dropped on the doc imported as tabs, and Alt-Enter on a mentioned tab.
 */
import { NodeSelection } from 'prosemirror-state';
import { provideAction } from '../app/actions.ts';
import { getDocs } from '../app/store.ts';
import { fillSlot } from '../app/slots.ts';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { currentView } from '../editor/format.ts';
import { openTab } from './actions.ts';
import { DeletedTabsDialog } from './DeletedTabsDialog.tsx';
import { DeleteTabDialog } from './DeleteTabDialog.tsx';
import { DropImportTarget, dropImportPlugin } from './drop-import.ts';
import { TabPicker } from './TabPicker.tsx';
import { TabsAside } from './TabsAside.tsx';

fillSlot('pageBar', 'tabs-picker', TabPicker, 0);
fillSlot('aside', 'tabs-aside', TabsAside, 0);
fillSlot('overlay', 'tabs-delete', DeleteTabDialog, 0);
fillSlot('overlay', 'tabs-deleted', DeletedTabsDialog, 0);
fillSlot('overlay', 'tabs-drop-import', DropImportTarget, 0);
// Ahead of the pictures' drop (features.ts loads tabs first): a dropped document is imported, pictures go on to them.
addEditorExtension({ plugins: () => [dropImportPlugin()] });

provideAction('openReference', () => {
  const selection = currentView()?.state.selection;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'mention') return false;
  const { ref, principal } = selection.node.attrs as { ref: string | null; principal: string | null };
  if (!ref || principal || !getDocs().project?.files.some(file => file.id === ref)) return false;
  openTab(ref);
  return true;
});
