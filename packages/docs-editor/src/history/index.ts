/** Version history: the top bar's button, the list beside the page, and a past version shown in place of the text. */
import { fillSlot } from '../app/slots.ts';
import { useDocs } from '../app/store.ts';
import { clearPreview } from './data.ts';
import { HistoryButton } from './HistoryButton.tsx';
import { HistoryPanel } from './HistoryPanel.tsx';
import { RestoreDialog } from './RestoreDialog.tsx';
import './history.css';

export { VersionPreview } from './VersionPreview.tsx';
export { useVersionPreviewing } from './store.ts';

fillSlot('topBar', 'history', HistoryButton, 40);
fillSlot('rail', 'history', HistoryPanel, 20);
fillSlot('overlay', 'history-restore', RestoreDialog);

// A preview is of the open tab while the list is open: switching tabs or closing the list goes back to the text.
useDocs.subscribe((state, before) => {
  if (state.activeTab !== before.activeTab || (!state.history && before.history)) clearPreview();
});
