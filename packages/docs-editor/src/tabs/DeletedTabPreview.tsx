/**
 * "Deleted tab": a deleted tab's content as it was deleted, read-only, in a bordered frame, with Restore. Opened from a
 * row of "Deleted tabs"; it reads the tab from the server (`read project`, payload `{kind: 'deleted', id}`).
 */
import { type DiskDoc, type DocState, docFromDisk } from '@open-artifact/docs-core';
import { Button, Dialog } from '@open-artifact/ui';
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react';
import { docClient } from '../app/doc-client.ts';
import { VersionText } from '../history/VersionText.tsx';
import { DELETED_TABS_WORDS, type DeletedTab, hasEmbeds, previewDescription } from './deleted.ts';

/** Reads a deleted tab's content as it was deleted. */
export async function readDeletedTab(id: string): Promise<DocState> {
  const answer = await docClient().call({ member: { verb: 'read', object: 'project', payload: { kind: 'deleted', id } } });
  const value = answer.value as { doc?: unknown } | undefined;
  if (!value || typeof value.doc !== 'object' || value.doc === null) throw new Error('No content');
  return docFromDisk(value.doc as DiskDoc);
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; doc: DocState; drawn: boolean };

interface DeletedTabPreviewProps {
  tab: DeletedTab;
  /** It is a subtab listed under the deleted tab it was deleted with. */
  nested: boolean;
  /** It couldn't come back itself: Restore adds its content as a new tab. */
  asNew?: boolean;
  /** A restore is on its way (this one or another). */
  restoring: boolean;
  onRestore: () => void;
  onClose: () => void;
}

export function DeletedTabPreview({ tab, nested, asNew = false, restoring, onRestore, onClose }: DeletedTabPreviewProps): ReactNode {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    readDeletedTab(tab.id).then(
      doc => live && setLoad({ state: 'ready', doc, drawn: true }),
      () => live && setLoad({ state: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [tab.id, attempt]);

  // A picture whose bytes are gone says so in its place.
  useEffect(() => {
    const host = frame.current;
    if (!host) return;
    const onError = (event: Event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const box = img.closest<HTMLElement>('.doc-media') ?? img;
      const miss = document.createElement('span');
      miss.className = 'inline-flex min-h-16 w-full items-center justify-center rounded border border-dashed border-line px-3 py-4 text-[12px] text-fg-muted';
      miss.textContent = DELETED_TABS_WORDS.imageMiss;
      miss.dataset.testid = 'deleted-tab-image-miss';
      box.replaceChildren(miss);
    };
    host.addEventListener('error', onError, true);
    return () => host.removeEventListener('error', onError, true);
  }, []);

  const retry = () => {
    frame.current?.focus();
    setAttempt(count => count + 1);
  };
  const undrawn = load.state === 'ready' && !load.drawn;
  const canRestore = load.state === 'ready' && !restoring;

  return (
    <Dialog
      open
      onOpenChange={next => (next ? undefined : onClose())}
      title={DELETED_TABS_WORDS.previewTitle}
      description={previewDescription(tab, nested, new Date(), asNew)}
      className="flex h-[calc(100dvh-4rem)] w-[min(56rem,calc(100vw-2rem))] flex-col"
      footer={
        <>
          <Button onClick={onClose}>{DELETED_TABS_WORDS.close}</Button>
          <Button variant="primary" disabled={!canRestore} aria-busy={restoring || undefined} onClick={() => canRestore && onRestore()} data-testid="deleted-tab-restore">
            {restoring ? DELETED_TABS_WORDS.restoring : asNew ? DELETED_TABS_WORDS.asNew : DELETED_TABS_WORDS.restore}
          </Button>
        </>
      }
    >
      <div
        ref={frame}
        tabIndex={-1}
        role="region"
        aria-label={`${tab.name} ${DELETED_TABS_WORDS.previewLabel}`}
        className="relative min-h-48 flex-1 overflow-hidden rounded border border-line focus-visible:outline-none"
        data-testid="deleted-tab-preview"
      >
        {load.state === 'ready' && load.drawn ? (
          <div className="absolute inset-0 overflow-y-auto overscroll-contain px-8 py-6">
            {hasEmbeds(load.doc) ? <p className="mb-4 text-[12px] text-fg-muted">{DELETED_TABS_WORDS.embedNote}</p> : null}
            <Drawn onError={() => setLoad(now => (now.state === 'ready' ? { ...now, drawn: false } : now))}>
              <VersionText doc={load.doc} base={null} />
            </Drawn>
          </div>
        ) : null}
        {load.state === 'loading' ? (
          <p role="status" className="absolute inset-x-0 top-12 animate-pulse text-center text-[13px] text-fg-muted">
            {DELETED_TABS_WORDS.previewLoading}
          </p>
        ) : null}
        {load.state === 'error' || undrawn ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6" data-testid="deleted-tab-preview-error">
            <p role="alert" className="text-center text-[13px] text-fg-muted">
              {load.state === 'error' ? DELETED_TABS_WORDS.previewFailed : DELETED_TABS_WORDS.previewUndrawn}
            </p>
            <Button onClick={retry}>{DELETED_TABS_WORDS.retry}</Button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Catches a tab the preview can't draw, so the dialog says so (and Restore still works). */
class Drawn extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
