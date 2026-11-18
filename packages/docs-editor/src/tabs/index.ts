/** The doc's tabs: the picker in the page bar, the list beside the text, the delete dialog, and Alt-Enter on a mentioned tab. */
import { NodeSelection } from 'prosemirror-state';
import { provideAction } from '../app/actions.ts';
import { getDocs } from '../app/store.ts';
import { fillSlot } from '../app/slots.ts';
import { currentView } from '../editor/format.ts';
import { openTab } from './actions.ts';
import { DeleteTabDialog } from './DeleteTabDialog.tsx';
import { TabPicker } from './TabPicker.tsx';
import { TabsAside } from './TabsAside.tsx';

fillSlot('pageBar', 'tabs-picker', TabPicker, 0);
fillSlot('aside', 'tabs-aside', TabsAside, 0);
fillSlot('overlay', 'tabs-delete', DeleteTabDialog, 0);

provideAction('openReference', () => {
  const selection = currentView()?.state.selection;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'mention') return false;
  const { ref, principal } = selection.node.attrs as { ref: string | null; principal: string | null };
  if (!ref || principal || !getDocs().project?.files.some(file => file.id === ref)) return false;
  openTab(ref);
  return true;
});
