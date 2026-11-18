/**
 * Inserting: the slash menu, `@` mentions, `:emoji`, the date and dropdown chips' pickers, and the page bar's insert
 * controls.
 */
import { TextSelection } from 'prosemirror-state';
import { provideAction } from '../app/actions.ts';
import { fillSlot } from '../app/slots.ts';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { currentView } from '../editor/format.ts';
import { schema } from '../editor/schema.ts';
import { DropdownChipView } from './dropdown-view.ts';
import { InsertBar } from './InsertBar.tsx';
import { InsertLayer } from './InsertLayer.tsx';
import { canWrite, insertMenusPlugin, registerSource } from './plugin.ts';
import { emojiSource, mentionSource, slashSource } from './sources.ts';

export { type ImagePicker, setImagePicker } from './image.ts';

registerSource('slash', slashSource);
registerSource('mention', mentionSource);
registerSource('emoji', emojiSource);

addEditorExtension({
  plugins: () => [insertMenusPlugin()],
  nodeViews: { dropdown: node => new DropdownChipView(node) },
});

fillSlot('layer', 'insert-menus', InsertLayer);
fillSlot('pageBar', 'insert', InsertBar, 50);

/** Types "/" at the caret (after a space when the word before it isn't done), which opens the slash menu. */
provideAction('slash', () => {
  const view = currentView();
  if (!view || !canWrite(view)) return false;
  const { $to } = view.state.selection;
  if (!$to.parent.inlineContent || $to.parent.type === schema.nodes.codeBlock) return false;
  const before = $to.parent.textBetween(0, $to.parentOffset, undefined, '\ufffc');
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, $to.pos));
  view.dispatch(tr.insertText(before && !/\s$/.test(before) ? ' /' : '/').scrollIntoView());
  view.focus();
  return true;
});
