/**
 * Collaboration UI beside the content: who else is here (avatars), the
 * history panel and the bars of a version preview and of overwritten
 * changes ("Bring back").
 */

import { Bot, Eye, History, Loader2, RotateCcw, Undo2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, ConfirmDialog, HistoryPanel, IconButton, Tooltip, cn } from '@open-artifact/ui';
import { initials } from '../lib/peers.ts';
import { bringBack, dismissNotice, historyCapability, previewVersion, restoreVersion, toggleHistory, useHistory } from '../services/history.ts';
import { usePresence } from '../services/presence.ts';
import { session } from '../services/session.ts';
import { useFiles } from '../state/files.ts';

/** Avatars of the others who have this design system open. */
export function PeerAvatars(): ReactNode {
  const peers = usePresence((s) => s.peers);
  if (!peers.length) return null;
  const shown = peers.slice(0, 4);
  return (
    <div className="flex items-center -space-x-1.5" aria-label={`${peers.length} others here`}>
      {shown.map((peer) => {
        const focus = peer.where?.focus;
        const where = peer.where?.section ? ` · ${focus ?? peer.where.section}` : '';
        return (
          <Tooltip key={peer.id} label={`${peer.name}${where}`}>
            <span
              className="flex size-6 items-center justify-center rounded-full border-2 bg-surface text-[10px] font-semibold text-fg"
              style={{ borderColor: peer.color }}
              aria-label={peer.name}
            >
              {peer.kind === 'agent' ? <Bot className="size-3" style={{ color: peer.color }} /> : initials(peer.name)}
            </span>
          </Tooltip>
        );
      })}
      {peers.length > shown.length ? (
        <span className="flex size-6 items-center justify-center rounded-full border-2 border-line bg-surface-2 text-[10px] text-fg-muted">+{peers.length - shown.length}</span>
      ) : null}
    </div>
  );
}

/** The history panel, on the right. */
export function HistoryAside(): ReactNode {
  const previewing = useHistory((s) => s.previewing);
  const history = historyCapability();
  if (!history) return null;
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface" aria-label="Version history">
      <HistoryPanel
        className="min-h-0 flex-1"
        history={history}
        viewerId={session().viewer.id}
        previewing={previewing}
        onPreview={(n) => void previewVersion(n)}
        onRestored={() => void previewVersion(null)}
        onClose={() => toggleHistory(false)}
      />
    </aside>
  );
}

/** The bar over a previewed version: what it is, restore it (all, or the file shown), back to now. */
export function PreviewBar(): ReactNode {
  const previewing = useHistory((s) => s.previewing);
  const label = useHistory((s) => s.previewLabel);
  const loading = useHistory((s) => s.loading);
  const canRestore = useHistory((s) => s.canRestore);
  const [confirm, setConfirm] = useState(false);
  if (previewing === null && !loading) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-accent/30 bg-accent-soft px-4 py-1.5 text-[12px] text-fg">
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5 text-accent" />}
      <span className="min-w-0 flex-1 truncate">{loading ? 'Opening the version…' : `${label}. Read-only preview.`}</span>
      {previewing !== null && canRestore ? (
        <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirm(true)}>
          Restore this version
        </Button>
      ) : null}
      <Button size="sm" variant="primary" icon={<Undo2 className="size-3.5" />} onClick={() => void previewVersion(null)}>
        Back to current
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Restore version ${previewing ?? ''}?`}
        description="Every file goes back to how this version left it. The current files stay in the history, so this can be undone by restoring again."
        confirmLabel="Restore"
        onConfirm={() => {
          if (previewing !== null) void restoreVersion(previewing);
        }}
      />
    </div>
  );
}

/** Someone else's change overwrote the viewer's: one row each, with "Bring back". */
export function NoticesBar(): ReactNode {
  const notices = useHistory((s) => s.notices);
  const readOnly = useFiles((s) => s.readOnly && s.preview === null);
  if (!notices.length) return null;
  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-line bg-surface-2 px-4 py-1.5 text-[12px] text-fg">
      {notices.slice(0, 3).map((notice) => {
        const path = notice.path.replace(/^project\//, '');
        const who = notice.author.kind === 'agent' ? notice.author.name || 'The agent' : notice.author.name || 'Someone';
        return (
          <div key={notice.id} className="flex items-center gap-2">
            <History className="size-3.5 shrink-0 text-warning" />
            <span className="min-w-0 flex-1 truncate">
              {who} {notice.lost.deleted ? 'brought back a file you deleted:' : 'overwrote your change to'} <span className="font-mono">{path}</span>.
            </span>
            {!readOnly ? (
              <Button size="sm" onClick={() => void bringBack(notice)}>
                Bring back
              </Button>
            ) : null}
            <IconButton size="sm" label="Dismiss" icon={<X className="size-3.5" />} onClick={() => void dismissNotice(notice.id)} />
          </div>
        );
      })}
      {notices.length > 3 ? <span className="pl-5 text-fg-subtle">and {notices.length - 3} more in the history.</span> : null}
    </div>
  );
}

/** A small "History" icon button, for the top bar outside a Shell. */
export function HistoryButton({ className }: { className?: string }): ReactNode {
  const available = useHistory((s) => s.available);
  const open = useHistory((s) => s.open);
  if (!available) return null;
  return <IconButton className={cn(className)} label="Version history" icon={<History className="size-4" />} active={open} onClick={() => toggleHistory(!open)} />;
}
