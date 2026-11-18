/**
 * "Deleted tabs": the tabs deleted from this doc, newest first, each with its first line of text, when and by whom.
 * Up and down move between the rows; a row opens a read-only preview of the tab with Restore. A restored tab comes back
 * with its comments and version history, where it was (or last, when the tab it sat under is gone); its subtabs
 * deleted with it come back under it. Editors only (the server says so too).
 */
import { Button, Dialog, toast } from '@open-artifact/ui';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { CallDenied, docClient } from '../app/doc-client.ts';
import { showTab } from '../app/start.ts';
import { useDocs } from '../app/store.ts';
import { agentName } from '../comments/store.ts';
import { DeletedTabPreview } from './DeletedTabPreview.tsx';
import { DELETED_TABS_PAGE, DELETED_TABS_WORDS, type DeletedRow, type DeletedTab, deletedRows, deletedWhen, type RestoreOutcome, restoreRefusal, rowLine, stepRow } from './deleted.ts';
import { setTabsUi, useTabsUi } from './state.ts';

/** Asks the server for the deleted tabs. */
export async function readDeletedTabs(): Promise<DeletedTab[]> {
  const answer = await docClient().call({ member: { verb: 'read', object: 'project', payload: { kind: 'deleted' } } });
  const value = answer.value as { deleted?: unknown } | undefined;
  return Array.isArray(value?.deleted) ? (value.deleted as DeletedTab[]) : [];
}

/**
 * Brings a deleted tab back and shows it: itself (`undelete`, with its comments and history) or, `asNew`, its content as
 * a new tab (`copyOf`). Answers how it went: a tab that can't come back itself can still come back as a new one.
 */
export async function restoreDeletedTab(id: string, asNew = false): Promise<RestoreOutcome> {
  try {
    const answer = await docClient().call({ member: { verb: 'create', object: 'file', payload: asNew ? { copyOf: id } : { undelete: id } } });
    const minted = typeof answer.minted === 'string' ? answer.minted : id;
    toast.add({ title: DELETED_TABS_WORDS.restored, type: 'success' });
    showTab(minted);
    return 'back';
  } catch (error) {
    const refused = restoreRefusal(error instanceof CallDenied ? error.reason : null);
    // As a new tab already: nothing further to offer.
    const outcome = asNew && refused.outcome === 'copyOnly' ? 'failed' : refused.outcome;
    const message = outcome === 'failed' && refused.outcome === 'copyOnly' ? null : refused.message;
    toast.add({ title: message ?? (error instanceof Error && error.message ? error.message : 'Couldn’t restore the tab.'), type: 'error' });
    return outcome;
  }
}

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; tabs: DeletedTab[] };

export function DeletedTabsDialog(): ReactNode {
  const open = useTabsUi(state => state.deletedOpen);
  const writable = useDocs(state => state.writable);
  if (!open || !writable) return null;
  return <DeletedTabsList />;
}

function DeletedTabsList(): ReactNode {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [restoring, setRestoring] = useState<string | null>(null);
  const [shown, setShown] = useState(DELETED_TABS_PAGE);
  /** The row that takes Tab (the one last focused), and the one whose preview is open. */
  const [stop, setStop] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<DeletedRow | null>(null);
  /** Tabs that couldn't come back themselves: their preview offers "Restore as new tab". */
  const [copyOnly, setCopyOnly] = useState<ReadonlySet<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // Another page deleting or restoring a tab changes the doc's head: the list is read again.
  const head = useDocs(state => state.project?.head);
  const asked = useRef(0);
  const close = () => setTabsUi({ deletedOpen: false });

  const reload = useCallback(async (quiet: boolean) => {
    const ask = ++asked.current;
    if (!quiet) setLoad({ state: 'loading' });
    try {
      const tabs = await readDeletedTabs();
      if (ask === asked.current) setLoad({ state: 'ready', tabs });
    } catch {
      if (ask === asked.current) setLoad({ state: 'failed' });
    }
  }, []);

  const first = useRef(true);
  useEffect(() => {
    void reload(!first.current);
    first.current = false;
  }, [head, reload]);

  const rows = load.state === 'ready' ? deletedRows(load.tabs, shown) : [];
  const more = load.state === 'ready' && load.tabs.length > shown;
  const stopId = rows.some(row => row.tab.id === stop) ? stop : (rows[0]?.tab.id ?? null);

  // A tab restored elsewhere leaves the list: its preview closes.
  useEffect(() => {
    if (previewing && load.state === 'ready' && !deletedRows(load.tabs, Number.POSITIVE_INFINITY).some(row => row.tab.id === previewing.tab.id)) setPreviewing(null);
  }, [load, previewing]);

  const restore = async (id: string) => {
    if (restoring) return;
    setRestoring(id);
    const outcome = await restoreDeletedTab(id, copyOnly.has(id));
    setRestoring(null);
    if (outcome === 'copyOnly') setCopyOnly(now => new Set([...now, id]));
    if (outcome === 'back' || outcome === 'gone') setPreviewing(null);
    await reload(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = rows.findIndex(row => rowRefs.current.get(row.tab.id) === event.target);
    if (index < 0) return;
    const next = stepRow(index, rows.length, event.key);
    if (next === null) return;
    event.preventDefault();
    const id = rows[next]!.tab.id;
    setStop(id);
    rowRefs.current.get(id)?.focus();
  };

  const closePreview = () => {
    const id = previewing?.tab.id;
    setPreviewing(null);
    if (id) requestAnimationFrame(() => rowRefs.current.get(id)?.focus());
  };

  return (
    <Dialog open onOpenChange={next => (next ? undefined : close())} title={DELETED_TABS_WORDS.title} description={DELETED_TABS_WORDS.note}>
      <div className="-mx-2 max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain px-2" data-testid="deleted-tabs">
        {load.state === 'loading' ? (
          <Loading />
        ) : load.state === 'failed' ? (
          <div role="alert" className="flex items-center justify-between gap-3 py-2 text-[13px]">
            <span className="text-danger">{DELETED_TABS_WORDS.failed}</span>
            <Button size="sm" onClick={() => void reload(false)} data-testid="deleted-tabs-retry">
              {DELETED_TABS_WORDS.retry}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-2 text-[13px] text-fg-muted">{DELETED_TABS_WORDS.none}</p>
        ) : (
          <>
            <ul aria-label={DELETED_TABS_WORDS.list} className="flex flex-col" onKeyDown={onKeyDown}>
              {rows.map((row, index) => (
                <Row
                  key={row.tab.id}
                  row={row}
                  rule={index > 0 && row.depth === 0}
                  stop={row.tab.id === stopId}
                  rowRef={button => {
                    if (button) rowRefs.current.set(row.tab.id, button);
                    else rowRefs.current.delete(row.tab.id);
                  }}
                  onFocus={() => setStop(row.tab.id)}
                  onPick={() => setPreviewing(row)}
                />
              ))}
            </ul>
            {more ? (
              <div className="py-2">
                <Button size="sm" variant="ghost" onClick={() => setShown(count => count + DELETED_TABS_PAGE)} data-testid="deleted-tabs-more">
                  {DELETED_TABS_WORDS.more}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {previewing ? (
        <DeletedTabPreview
          key={previewing.tab.id}
          tab={previewing.tab}
          nested={previewing.depth > 0}
          asNew={copyOnly.has(previewing.tab.id)}
          restoring={restoring !== null}
          onRestore={() => void restore(previewing.tab.id)}
          onClose={closePreview}
        />
      ) : null}
    </Dialog>
  );
}

interface RowProps {
  row: DeletedRow;
  /** A line above it, between deleted tabs (not between a tab and its subtabs). */
  rule: boolean;
  /** It is the row Tab reaches. */
  stop: boolean;
  rowRef: (button: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onPick: () => void;
}

function Row({ row: { tab, depth }, rule, stop, rowRef, onFocus, onPick }: RowProps): ReactNode {
  const me = useDocs(state => state.me);
  const by = tab.by ? (tab.by.agent ? agentName() : me && tab.by.id === me.id ? 'you' : tab.by.name) : null;
  const { line, text } = rowLine(tab);
  return (
    <li className={`relative py-0.5${rule ? " before:absolute before:top-0 before:right-2 before:left-2 before:h-px before:bg-line before:content-['']" : ''}`} style={{ paddingLeft: depth * 16 }}>
      <button
        ref={rowRef}
        type="button"
        tabIndex={stop ? 0 : -1}
        onClick={onPick}
        onFocus={onFocus}
        className="flex w-full flex-col rounded-md px-2 py-2.5 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        data-deleted-tab={tab.id}
        data-testid="deleted-tab-row"
      >
        <span title={text ? line : undefined} className={`line-clamp-2 text-[13px] ${text ? 'text-fg' : 'text-fg-muted'}`} data-testid="deleted-tab-line">
          {line}
        </span>
        <span className="sr-only">, </span>
        <span className="mt-1 truncate text-[12px] text-fg-muted" data-testid="deleted-tab-when">
          {tab.name} · {deletedWhen(tab.deletedAt)}
          {by ? ` by ${by}` : ''}
        </span>
        <span className="sr-only">, {DELETED_TABS_WORDS.rowAction}</span>
      </button>
    </li>
  );
}

function Loading(): ReactNode {
  return (
    <div role="status" aria-label={DELETED_TABS_WORDS.loading} className="flex flex-col gap-4 py-2" data-testid="deleted-tabs-loading">
      {[0, 1, 2].map(row => (
        <div key={row} className="flex flex-col gap-1.5">
          <div className="h-3 w-2/3 animate-pulse rounded bg-hover" />
          <div className="h-2.5 w-1/3 animate-pulse rounded bg-hover" />
        </div>
      ))}
    </div>
  );
}
