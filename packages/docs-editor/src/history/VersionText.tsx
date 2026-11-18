/** A version's text, drawn read-only in the page's schema, with what it changed highlighted when asked. */
import type { DocState } from '@open-artifact/docs-core';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { editorNodeViews } from '../editor/DocEditor.tsx';
import { compareVersions } from './compare.ts';
import { changesPlugin, previewDocOf } from './preview-doc.ts';

interface VersionTextProps {
  doc: DocState;
  /** The version it is compared with; `null` draws it plain. */
  base: DocState | null;
}

export function VersionText({ doc, base }: VersionTextProps): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const drawn = useMemo(() => {
    try {
      return previewDocOf(base ? compareVersions(base, doc) : doc);
    } catch {
      return previewDocOf(doc);
    }
  }, [doc, base]);

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView(host.current, {
      state: EditorState.create({ doc: drawn.doc, plugins: [changesPlugin(drawn.changes)] }),
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
    view.current?.updateState(EditorState.create({ doc: drawn.doc, plugins: [changesPlugin(drawn.changes)] }));
  }, [drawn]);

  return <div ref={host} className="relative" data-version-preview="" />;
}
