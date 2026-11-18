import { useState, type ReactElement } from 'react';
import { MessageSquare, TriangleAlert, X } from 'lucide-react';
import { Button, IconButton, cn } from '@open-artifact/ui';
import type { ConnectionFix, DashboardNotice, Dataset } from '@open-artifact/data-core';
import { connectionFixAriaLabel, connectionFixLabel } from './fixes.ts';

export const ASK_AGENT_LABEL = 'Ask your agent';

export interface SourcesNoticeProps {
  notice: DashboardNotice;
  /** Opens the Sources panel. */
  onSources?: () => void;
  onFix: (connector: string, fix: ConnectionFix) => unknown;
  /** Asks the agent why these sources failed. */
  onAskWhy?: (datasets: Dataset[]) => void;
  onRetry: () => void;
  loading?: boolean;
  onDismiss?: () => void;
  canAskAgent: boolean;
}

/** The dashboard's notice about its sources, with the one action that helps most. */
export function SourcesNotice({
  notice,
  onSources,
  onFix,
  onAskWhy,
  onRetry,
  loading = false,
  onDismiss,
  canAskAgent,
}: SourcesNoticeProps): ReactElement {
  const [busy, setBusy] = useState(false);
  const { fix, ask } = notice;
  const quiet = notice.quiet === true;

  const runFix = (connector: string, which: ConnectionFix): void => {
    setBusy(true);
    void Promise.resolve()
      .then(() => onFix(connector, which))
      .finally(() => setBusy(false));
  };

  const action =
    fix !== undefined ? (
      <Button
        size="sm"
        disabled={busy || loading}
        aria-label={connectionFixAriaLabel(fix.fix, fix.connector, canAskAgent)}
        onClick={() => runFix(fix.connector, fix.fix)}
      >
        {connectionFixLabel(fix.fix, canAskAgent)}
      </Button>
    ) : ask !== undefined && onAskWhy !== undefined ? (
      <Button size="sm" icon={<MessageSquare className="size-3.5" aria-hidden />} onClick={() => onAskWhy(ask)}>
        {ASK_AGENT_LABEL}
      </Button>
    ) : ask !== undefined ? (
      <Button size="sm" disabled={loading} onClick={onRetry}>
        Retry
      </Button>
    ) : quiet || onSources === undefined ? null : (
      <Button size="sm" onClick={onSources}>
        See sources
      </Button>
    );

  return (
    <div
      role="none"
      className={cn(
        'flex items-center gap-2 rounded-control border px-3 py-2 text-[13px] text-fg',
        quiet ? 'border-line bg-surface' : 'border-warning/40 bg-warning/10',
      )}
    >
      {quiet ? null : <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />}
      <span className="min-w-0 flex-1">{notice.text}</span>
      {action}
      {onDismiss === undefined ? null : <IconButton size="sm" label="Dismiss" icon={<X className="size-3.5" />} onClick={onDismiss} />}
    </div>
  );
}
