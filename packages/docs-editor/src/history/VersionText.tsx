/** A version's text, drawn read-only in the page's schema, with what it changed highlighted when asked. */
import type { DocState } from '@open-artifact/docs-core';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { editorNodeViews } from '../editor/DocEditor.tsx';
import { type Comparison, compareVersions } from './compare.ts';
import { changesPlugin, previewDocOf } from './preview-doc.ts';

interface VersionTextProps {
  /** The version, or a comparison of two (from {@link compareVersions}) to draw with its changes highlighted. */
  doc: DocState | Comparison;
  /** A version to compare `doc` with here; `null` or left out draws `doc` as it is. */
  base?: DocState | null;
  /** The change the strip is on: ringed, and scrolled to when it changes. */
  active?: string | null;
}

export function VersionText({ doc, base = null, active = null }: VersionTextProps): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const drawn = useMemo(() => {
    try {
      return previewDocOf(base ? compareVersions(base, doc) : doc);
    } catch {
      return previewDocOf(doc);
    }
  }, [doc, base]);
  const stateOf = () => EditorState.create({ doc: drawn.doc, plugins: [changesPlugin(drawn.changes, active)] });

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView(host.current, {
      state: stateOf(),
      nodeViews: editorNodeViews(),
      editable: () => false,
      attributes: { class: 'doc-text doc-version-text', 'aria-readonly': 'true', 'aria-label': 'Version preview' },
      dispatchTransaction: () => undefined,
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The view is made once; later docs replace its state below.
  }, []);

  useEffect(() => {
    view.current?.updateState(stateOf());
  }, [drawn, active]);

  useEffect(() => {
    if (!active || !host.current) return;
    const id = CSS.escape(active);
    const target = host.current.querySelector(`[data-change-id="${id}"]:not(.vh-moved)`) ?? host.current.querySelector(`[data-change-id="${id}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, drawn]);

  return <div ref={host} className="relative" data-version-preview="" />;
}
