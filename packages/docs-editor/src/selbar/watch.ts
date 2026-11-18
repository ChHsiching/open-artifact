/**
 * What the toolbars around the text follow besides the editor's state: whether the text is being composed (IME) or a
 * selection dragged out, and the range the link box is open on, kept in step with every edit.
 */
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { create } from 'zustand';

export interface TextRange {
  from: number;
  to: number;
}

export interface SelbarSignals {
  composing: boolean;
  /** A pointer is down on the text, drawing a selection. */
  dragging: boolean;
}

export const useSelbarSignals = create<SelbarSignals>(() => ({ composing: false, dragging: false }));

export const linkRangeKey = new PluginKey<TextRange | null>('docLinkRange');

export function linkRange(view: EditorView): TextRange | null {
  return linkRangeKey.getState(view.state) ?? null;
}

/** Puts the link box's range in the editor's state (null takes it away). */
export function setLinkRange(view: EditorView, range: TextRange | null): void {
  view.dispatch(view.state.tr.setMeta(linkRangeKey, range ?? false));
}

export interface WatchOptions {
  /** A click on a link in the text; true when it was taken. */
  onLinkClick(view: EditorView, event: MouseEvent): boolean;
}

export function watchPlugin(options: WatchOptions): Plugin<TextRange | null> {
  let composeEnd: ReturnType<typeof setTimeout> | undefined;
  return new Plugin<TextRange | null>({
    key: linkRangeKey,
    state: {
      init: () => null,
      apply(tr, range) {
        const meta = tr.getMeta(linkRangeKey) as TextRange | false | undefined;
        if (meta === false) return null;
        if (meta) return meta;
        if (!range || !tr.docChanged) return range;
        const from = tr.mapping.map(range.from, range.from === range.to ? -1 : 1);
        const to = Math.max(from, tr.mapping.map(range.to, -1));
        return { from, to };
      },
    },
    props: {
      handleDOMEvents: {
        compositionstart: () => {
          clearTimeout(composeEnd);
          useSelbarSignals.setState({ composing: true });
          return false;
        },
        compositionend: () => {
          clearTimeout(composeEnd);
          composeEnd = setTimeout(() => useSelbarSignals.setState({ composing: false }), 0);
          return false;
        },
        mousedown: (_view, event) => {
          if (event.button !== 0) return false;
          useSelbarSignals.setState({ dragging: true });
          const up = () => {
            document.removeEventListener('mouseup', up, true);
            // After the editor has read the selection the mouse left.
            setTimeout(() => useSelbarSignals.setState({ dragging: false }), 0);
          };
          document.addEventListener('mouseup', up, true);
          return false;
        },
        click: (view, event) => options.onLinkClick(view, event),
      },
    },
    view: () => ({
      destroy: () => {
        clearTimeout(composeEnd);
        useSelbarSignals.setState({ composing: false, dragging: false });
      },
    }),
  });
}
