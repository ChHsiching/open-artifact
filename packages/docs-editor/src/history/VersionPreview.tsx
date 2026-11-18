/** A past version shown read-only in place of the tab's text: compare it with the one before, restore it, or go back. */
import { Button } from '@open-artifact/ui';
import { History, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo } from 'react';
import { useDocs } from '../app/store.ts';
import { compareVersions, hasChanges } from './compare.ts';
import { canRestoreVersions, clearPreview, loadVersion, setCompare } from './data.ts';
import { fullTime, whenLabel, whoOf } from './groups.ts';
import { type Preview, setHistory, useVersionHistory, versionKey } from './store.ts';
import { VersionText } from './VersionText.tsx';

/** Drawn by the page in place of the editor while {@link useVersionPreviewing} is true. */
export function VersionPreview(): ReactNode {
  const preview = useVersionHistory(state => state.preview);
  if (!preview) return null;
  return <PreviewPane key={`${preview.tab}:${preview.rev}:${preview.base ?? ''}`} preview={preview} />;
}

function PreviewPane({ preview }: { preview: Preview }): ReactNode {
  const compare = useVersionHistory(state => state.compare);
  const confirming = useVersionHistory(state => state.confirmRestore);
  const doc = useVersionHistory(state => state.docs[versionKey(preview.tab, preview.rev)] ?? null);
  const docError = useVersionHistory(state => state.docErrors[versionKey(preview.tab, preview.rev)] ?? null);
  const base = useVersionHistory(state => (preview.base === null ? null : (state.docs[versionKey(preview.tab, preview.base)] ?? null)));
  const baseFailed = useVersionHistory(state => preview.base !== null && versionKey(preview.tab, preview.base) in state.docErrors);
  const comparing = compare && preview.base !== null;

  useEffect(() => {
    void loadVersion(preview.tab, preview.rev);
  }, [preview.tab, preview.rev]);
  useEffect(() => {
    if (comparing && preview.base !== null) void loadVersion(preview.tab, preview.base);
  }, [comparing, preview.tab, preview.base]);

  useEffect(() => {
    if (confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      clearPreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const waitingForBase = comparing && !base && !baseFailed;
  const unchanged = useMemo(() => (comparing && doc && base ? !hasChanges(compareVersions(base, doc)) : false), [comparing, doc, base]);

  return (
    <div className="relative" role="region" aria-label="Version preview, read-only" data-testid="version-preview">
      <PreviewBar preview={preview} comparing={comparing} unchanged={unchanged} />
      {docError ? (
        <div role="alert" className="py-10 text-center text-sm text-chrome-muted">
          This version could not be read: {docError}
        </div>
      ) : !doc || waitingForBase ? (
        <div className="grid place-items-center py-16 text-chrome-muted">
          <Loader2 className="size-5 animate-spin" aria-label="Loading the version" />
        </div>
      ) : (
        <VersionText doc={doc} base={comparing && base ? base : null} />
      )}
    </div>
  );
}

function PreviewBar({ preview, comparing, unchanged }: { preview: Preview; comparing: boolean; unchanged: boolean }): ReactNode {
  const me = useDocs(state => state.me);
  const writable = useDocs(state => state.writable);
  const busy = useVersionHistory(state => state.busy);
  const version = useVersionHistory(state => state.versions?.find(item => item.rev === preview.rev) ?? null);
  const when = whenLabel(preview.at);
  const title = preview.current ? 'Current version' : preview.count > 1 ? `Newest of ${preview.count} versions · ${when}` : when;
  const restorable = writable && !preview.current && canRestoreVersions();
  return (
    <div className="sticky top-0 z-20 -mx-2 mb-6 flex flex-wrap items-center gap-2 rounded-b-lg border-b border-chrome-line bg-page/95 px-2 py-2 backdrop-blur" data-testid="version-bar">
      <History className="size-4 flex-none text-chrome-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-chrome-fg" title={fullTime(preview.at)}>
          {title}
        </div>
        <div className="truncate text-[11px] text-chrome-muted">
          {[version ? whoOf(version, me) : null, 'Read-only', comparing ? (unchanged ? 'No changes' : 'Compared with the previous version') : null].filter(Boolean).join(' · ')}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={comparing}
        disabled={preview.base === null}
        title={preview.base === null ? 'This is the oldest version kept' : undefined}
        onClick={() => setCompare(!comparing)}
        data-testid="version-compare"
      >
        {comparing ? 'Hide changes' : 'Compare with previous'}
      </Button>
      {restorable ? (
        <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => setHistory({ confirmRestore: true })} data-testid="version-restore">
          {busy === 'restoring' ? 'Restoring…' : 'Restore this version'}
        </Button>
      ) : null}
      <Button size="sm" variant="secondary" onClick={clearPreview} data-testid="version-back">
        Back to editing
      </Button>
    </div>
  );
}
