/** The selection toolbar and the link box: drawn over the text, answering Mod-k and Alt-Enter. */
import { provideAction } from '../app/actions.ts';
import { fillSlot } from '../app/slots.ts';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { useEditor } from '../editor/format.ts';
import { LinkPopover } from './LinkPopover.tsx';
import { closeLink, handleLinkClick, openLinkAtCursor, startLinkEdit } from './links.ts';
import { followAddressOnce } from './navigate.ts';
import { SelectionToolbar } from './SelectionToolbar.tsx';
import { watchPlugin } from './watch.ts';

addEditorExtension({ plugins: () => [watchPlugin({ onLinkClick: handleLinkClick })] });

fillSlot('layer', 'selection-toolbar', SelectionToolbar, 10);
fillSlot('layer', 'link-box', LinkPopover, 11);

provideAction('link', startLinkEdit);
provideAction('openLink', openLinkAtCursor);

// A box open on one tab's text closes when another tab is shown.
useEditor.subscribe((state, before) => {
  if (state.view !== before.view) closeLink();
});

followAddressOnce();
