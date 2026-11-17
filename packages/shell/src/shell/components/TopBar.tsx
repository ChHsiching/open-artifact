/**
 * The Shell's bar: the title menu, the working indicator and the page's save
 * state on the left; History, Share, comments, Ask agent and Close on the
 * right.
 */

import { ChevronDown, CloudAlert, History, LoaderCircle, Lock, MessageSquare, RotateCw, X } from 'lucide-react';
import { Button, IconButton, Menu, MenuItem, Tooltip, cn } from '@open-artifact/ui';
import { StatusDot } from '../../components/OwnerBadge.tsx';
import { t } from '../../lib/i18n.ts';
import { command, runAction } from '../bridge.ts';
import { closeShell, openSession } from '../actions.ts';
import { useAgentName, useCanOpenSession, useOwner, useOwnerState, useWorking } from '../hooks.ts';
import { countText, saveIndicator, showsComments } from '../model.ts';
import { useShell } from '../store.ts';
import { SharePanel } from './SharePanel.tsx';
import { TitleMenu } from './TitleMenu.tsx';

/** "<Agent> is working…" while the owner session runs. */
function Working() {
  const agent = useAgentName();
  if (!useWorking()) return null;
  return (
    <span role="status" className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted">
      <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent motion-reduce:animate-none" />
      <span className="truncate max-sm:hidden">{t('working', { agent })}</span>
    </span>
  );
}

/** The page's save state (the header indicator): Saving…, a retry after a failed save, Read-only. */
function SaveState() {
  const state = useShell((s) => saveIndicator(s.report));
  const quiet = 'inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted';
  switch (state) {
    case 'saving':
    case 'reconnecting':
      return (
        <span role="status" className={quiet}>
          <LoaderCircle className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <span className="max-sm:hidden">{t(state)}</span>
        </span>
      );
    case 'unsaved':
      return (
        <span role="status" title={t('notSavedTitle')} className={cn(quiet, 'text-danger')}>
          <CloudAlert className="size-3.5 shrink-0" />
          <span className="max-sm:hidden">{t('notSaved')}</span>
        </span>
      );
    case 'retry':
      return (
        <Button size="sm" variant="ghost" className="text-danger" title={t('notSavedTitle')} icon={<RotateCw className="size-3.5" />} onClick={() => runAction('save_now')}>
          <span className="max-sm:hidden">{t('saveRetry')}</span>
        </Button>
      );
    case 'readonly':
      return (
        <span title={t('readOnlyTitle')} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
          <Lock className="size-3" />
          {t('readOnly')}
        </span>
      );
    default:
      return null;
  }
}

/** Version history (`report.history`): the page opens its own panel. */
function HistoryButton() {
  const history = useShell((state) => !!state.report.history);
  if (!history) return null;
  return <IconButton label={t('versionHistory')} icon={<History className="size-4" />} size="lg" onClick={() => command({ cmd: 'history' })} />;
}

/**
 * The comments button: comment mode on and off, a filled bubble
 * while on ("Done commenting"), an outlined one with a dot while open
 * comments wait ("N open comments"); and a caret whose menu shows the
 * comments list ("Show all comments N") or hides it ("Hide comments").
 */
function CommentsButton() {
  const comments = useShell((state) => state.report.comments);
  if (!comments || !showsComments({ comments })) return null;
  const on = comments.on;
  const count = Math.max(0, comments.count || 0);
  const waiting = !on && count > 0;
  const tip = on ? t('doneCommenting') : count === 1 ? t('openComment') : count > 0 ? t('openComments', { count: countText(count) }) : t('comments');
  return (
    <span data-comments-button="" className="inline-flex items-center">
      <Tooltip label={tip}>
        <button
          type="button"
          aria-label={t('comments')}
          aria-pressed={on}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-hover hover:text-fg',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            on && 'text-fg',
          )}
          onClick={() => command({ cmd: 'comments_mode', on: !on })}
        >
          <span className="relative inline-flex">
            <MessageSquare className="size-4" fill={on ? 'currentColor' : 'none'} />
            {waiting ? <span aria-hidden data-comments-dot="" className="absolute -right-0.5 -top-px size-1.5 rounded-full bg-accent ring-[1.5px] ring-surface" /> : null}
          </span>
        </button>
      </Tooltip>
      <Menu
        align="end"
        trigger={
          <button
            type="button"
            aria-label={t('commentOptions')}
            title={t('commentOptions')}
            className="-ml-0.5 inline-flex h-8 w-5 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent data-[popup-open]:bg-hover"
          >
            <ChevronDown className="size-3" />
          </button>
        }
      >
        {comments.open ? (
          <MenuItem onSelect={() => command({ cmd: 'comments_list', open: false })}>{t('hideComments')}</MenuItem>
        ) : (
          <MenuItem onSelect={() => command({ cmd: 'comments_list', open: true })}>
            <span className="flex items-center gap-6">
              <span className="flex-1">{t('showAllComments')}</span>
              {count ? <span className="text-xs text-fg-subtle">{countText(count)}</span> : null}
            </span>
          </MenuItem>
        )}
      </Menu>
    </span>
  );
}

/** Ask agent: shows the owner session in the host when it can, else toggles the ask pane. */
function AskButton() {
  const agent = useAgentName();
  const open = useShell((state) => state.askOpen);
  const canOpen = useCanOpenSession();
  const owner = useOwner();
  const status = useOwnerState();
  const title = canOpen && owner ? t('openHarnessSession', { harness: owner.harness }) : open ? t('hideAsk') : t('messageAgent', { agent });
  return (
    <Button
      size="lg"
      variant="ghost"
      title={title}
      aria-expanded={open}
      className={cn(open && 'bg-hover')}
      icon={
        <span className="relative">
          <MessageSquare className="size-4" />
          <StatusDot state={status} className="absolute -right-0.5 -top-0.5 size-1.5" />
        </span>
      }
      onClick={() => (canOpen && !open ? openSession() : useShell.getState().setAskOpen(!open))}
    >
      <span className="max-sm:hidden">{t('ask', { agent })}</span>
    </Button>
  );
}

/** The bar. */
export function TopBar() {
  const hostToolbar = useShell((state) => !!state.host?.caps.toolbar);
  return (
    <header aria-label={t('artifactOptions')} className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface pl-2.5 pr-2 max-sm:gap-1 max-sm:px-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <TitleMenu />
        <Working />
        <SaveState />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <HistoryButton />
        <SharePanel />
        <CommentsButton />
        <AskButton />
        {hostToolbar ? null : <IconButton label={t('close')} icon={<X className="size-4" />} size="lg" onClick={closeShell} />}
      </div>
    </header>
  );
}
