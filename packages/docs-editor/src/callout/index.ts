/** Callouts: quotes that start with ℹ️, ✅ or ⚠️, drawn as coloured panels. */
import { getDocs } from '../app/store.ts';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { calloutPlugin } from './callout.ts';

addEditorExtension({ plugins: () => [calloutPlugin(() => getDocs().writable)] });
