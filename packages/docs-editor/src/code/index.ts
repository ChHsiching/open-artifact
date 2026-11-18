/** Code blocks: highlighting, the language picker, Copy code, and live CSV, formula, Markdown and diagram blocks. */
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration, EditorView } from 'prosemirror-view';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { CodeBlockView } from './code-view.ts';
import { activeBlockPlugin, highlightPlugin } from './highlight-plugin.ts';
import './code.css';

addEditorExtension({
  plugins: () => [highlightPlugin(), activeBlockPlugin()],
  nodeViews: {
    codeBlock: (node: PMNode, view: EditorView, getPos: () => number | undefined, decorations: readonly Decoration[]) =>
      new CodeBlockView(node, view, getPos, decorations),
  },
});
