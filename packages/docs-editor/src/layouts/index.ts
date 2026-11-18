/** Starting a doc from a layout: the row under an empty doc's first line, and the grey hints a layout leaves. */
import { fillSlot } from '../app/slots.ts';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { layoutHints } from './layouts.ts';
import { StartRow } from './StartRow.tsx';

addEditorExtension({ plugins: () => [layoutHints()] });
fillSlot('layer', 'start-row', StartRow);
