/** Pasting Markdown as blocks, and the 1 MB limit on one paste. */
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { showNotice } from '../suggest/store.ts';
import { pastePlugin, tooLargeWords } from './paste.ts';

addEditorExtension({ plugins: () => [pastePlugin(textFits => showNotice(tooLargeWords(textFits)))] });
