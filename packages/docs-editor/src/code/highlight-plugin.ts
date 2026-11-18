/** Highlights code blocks as inline decorations, fetching a block's grammar when it first needs one. */
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { type Highlighted, grammarReady, highlight, loadGrammar } from './highlight.ts';
import { grammarFor } from './languages.ts';

/** Blocks longer than this stay plain, so typing in them stays quick. */
const MAX_HIGHLIGHT = 100_000;

const key = new PluginKey<DecorationSet>('codeHighlight');

/** Each code block node's highlight, worked out once per node. */
const cache = new WeakMap<PMNode, Highlighted>();

/** The highlight of a block, if its grammar is loaded. */
export function highlightOf(node: PMNode): Highlighted | null {
  const grammar = grammarFor(node.attrs.language as string | null);
  if (grammar === null || node.textContent.length > MAX_HIGHLIGHT) return null;
  const known = cache.get(node);
  if (known) return known;
  const made = highlight(node.textContent, grammar);
  if (made) cache.set(node, made);
  return made;
}

function build(doc: PMNode, wanted: Set<string>): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return !node.isTextblock;
    const grammar = grammarFor(node.attrs.language as string | null);
    if (grammar === null) return false;
    if (!grammarReady(grammar)) {
      wanted.add(grammar);
      return false;
    }
    const made = highlightOf(node);
    for (const range of made?.ranges ?? []) decorations.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: range.classes }));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export function highlightPlugin(): Plugin {
  let view: EditorView | null = null;
  const requested = new Set<string>();
  const fetch = (wanted: Set<string>) => {
    for (const grammar of wanted) {
      if (requested.has(grammar)) continue;
      requested.add(grammar);
      void loadGrammar(grammar).then(ok => {
        if (ok && view && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, grammar));
      });
    }
  };
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => {
        const wanted = new Set<string>();
        const set = build(state.doc, wanted);
        queueMicrotask(() => fetch(wanted));
        return set;
      },
      apply: (tr, before) => {
        if (!tr.docChanged && tr.getMeta(key) === undefined) return before;
        const wanted = new Set<string>();
        const set = build(tr.doc, wanted);
        if (wanted.size) queueMicrotask(() => fetch(wanted));
        return set;
      },
    },
    view: editorView => {
      view = editorView;
      return {
        destroy: () => {
          view = null;
        },
      };
    },
    props: { decorations: state => key.getState(state) },
  });
}

/** Marks the code block the selection is in, so its node view keeps the source open while it is edited. */
export function activeBlockPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { $from, $to } = state.selection;
        if ($from.depth === 0 || $from.parent.type.name !== 'codeBlock' || !$from.sameParent($to)) return null;
        const start = $from.before();
        return DecorationSet.create(state.doc, [Decoration.node(start, start + $from.parent.nodeSize, {}, { codeActive: true })]);
      },
    },
  });
}
