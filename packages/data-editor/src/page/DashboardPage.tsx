import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type { DashboardContent } from '@open-artifact/data-core';
import { DASHBOARD_ENTRY_FILENAME } from '@open-artifact/data-core';
import { dataEngine, type DataEngine } from '../data/engine.ts';
import { applyStoredLook } from './look.ts';
import { DASHBOARD_ROOT_ID, mountDashboardPage, type PageHandle, type PageSnapshot } from './runtime.ts';
import { getPageStyleCss } from './tokens.ts';

export interface DashboardPageProps {
  content: DashboardContent;
  engine?: DataEngine;
  /** Edit mode: keeps the stored markup beside the mounted page. */
  editing?: boolean;
  /** A saved edit: the new files are what the mounted page already shows. */
  adopt?: boolean;
  /** Hide the notes under the page (when a fix notice says the same). */
  notesOff?: boolean;
  onLink?: (fragment: string) => void;
  onHandle?: (handle: PageHandle | null) => void;
  /** Drawn right before `#dash-root` (the Listen controls). */
  beforeRoot?: ReactNode;
}

const EMPTY_SNAPSHOT: PageSnapshot = {
  n: 0,
  files: null,
  stops: [],
  broke: false,
  faults: [],
  drawingFaults: [],
  marks: [],
  flagged: 0,
  usage: null,
  oneWriter: false,
};
const NO_SUBSCRIPTION = (): (() => void) => () => undefined;

/** The page the dashboard's files make, in `#dash-root`, with the default tokens and `dash/look` applied. */
export function DashboardPage(props: DashboardPageProps): ReactElement {
  const { content, editing = false, adopt = false, notesOff = false } = props;
  const engine = props.engine ?? dataEngine();
  const rootRef = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<PageHandle | null>(null);
  const callbacks = useRef({ onLink: props.onLink, onHandle: props.onHandle });
  callbacks.current = { onLink: props.onLink, onHandle: props.onHandle };
  const applied = useMemo(() => applyStoredLook(content.look), [content.look]);
  const css = useMemo(() => getPageStyleCss() + applied.css, [applied]);
  const latest = useRef({ content, colors: applied.colors, editing });
  latest.current = { content, colors: applied.colors, editing };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const { content: initial, colors, editing: initialEditing } = latest.current;
    const page = mountDashboardPage(root, {
      files: initial.files,
      engine,
      lang: initial.lang,
      colors,
      editing: initialEditing,
      onLink: (fragment) => callbacks.current.onLink?.(fragment),
    });
    setHandle(page);
    callbacks.current.onHandle?.(page);
    return () => {
      page.dispose();
      setHandle(null);
      callbacks.current.onHandle?.(null);
    };
  }, [engine]);

  useEffect(() => {
    handle?.update({ files: content.files, lang: content.lang, colors: applied.colors, editing, adopt });
  }, [handle, content.files, content.lang, applied.colors, editing, adopt]);

  const snapshot = useSyncExternalStore(
    handle === null ? NO_SUBSCRIPTION : handle.subscribe,
    () => handle?.snapshot() ?? EMPTY_SNAPSHOT,
  );
  const awaitingEntry = editing && content.files.length > 0 && !content.files.some((file) => file.name === DASHBOARD_ENTRY_FILENAME);

  return (
    <>
      <style>{css}</style>
      {props.beforeRoot}
      <div id={DASHBOARD_ROOT_ID} ref={rootRef} />
      {snapshot.stops.length > 0 && !awaitingEntry && !(notesOff && snapshot.broke) && (
        <div className="dash-notes" data-uncommentable="">
          {snapshot.stops.map((stop) => (
            <p key={stop} className="dash-note">
              {stop}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
