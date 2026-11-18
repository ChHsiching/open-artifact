/**
 * One suggestion's card: who made it and when, what it does, Accept and Reject (Withdraw for your own), Reply, and,
 * while it is the looked-at one, the way to the previous and next suggestion and Accept all / Reject all.
 */
import { ChromeMenu, ChromeMenuItem, TipButton, TipGroup, timeAgo } from '@open-artifact/editor-kit/react';
import { cn } from '@open-artifact/ui';
import { Bot, Check, ChevronDown, ChevronUp, MessageSquareReply, MoreHorizontal, Undo2, User, X } from 'lucide-react';
import { type CSSProperties, forwardRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useDocs } from '../app/store.ts';
import { currentView } from '../editor/format.ts';
import { decide, decideAll, revealSuggestion, stepSuggestion } from './decide.ts';
import type { SuggestionCard as CardModel } from './model.ts';
import { useSuggestionReply } from './reply.ts';
import { setSuggest, useSuggest, type Verdict } from './store.ts';
import { sentenceText, type Sentence } from './summary.ts';

const ICON = { className: 'size-4', strokeWidth: 1.75 } as const;

/** The card element of a suggestion, for moving the keyboard between cards. */
export const cardSelector = (id: string) => `[data-suggest-card="${id}"]`;

/** Gives the keyboard to a suggestion's card once it has been drawn. */
export function focusCard(id: string): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(cardSelector(id))?.focus({ preventScroll: false }));
}

export function SentenceView({ sentence }: { sentence: Sentence }): ReactNode {
  return (
    <p className="text-[13px] leading-5 [overflow-wrap:anywhere]">
      {sentence.map((part, index) => {
        const gap = index > 0 && !part.text.startsWith(',') ? ' ' : '';
        return part.quote ? (
          <span key={index}>
            {gap}
            <span className="font-semibold italic text-chrome-fg">“{part.text}”</span>
          </span>
        ) : (
          <span key={index} className="text-chrome-muted">
            {gap}
            {part.text}
          </span>
        );
      })}
    </p>
  );
}

function author(card: CardModel, me: { id: string; name: string } | null): string {
  if (card.agent) return 'Agent';
  if (me && card.by === me.id) return me.name || 'You';
  return 'Suggestion';
}

export interface SuggestionCardProps {
  card: CardModel;
  tab: string;
  index: number;
  total: number;
  selected: boolean;
  /** Drawn on its own over the page (no room beside the text): it has a close button and no hover reveal. */
  floating?: boolean;
  onClose?(): void;
  className?: string;
  style?: CSSProperties;
}

export const SuggestionCardView = forwardRef<HTMLDivElement, SuggestionCardProps>(function SuggestionCardView(
  { card, tab, index, total, selected, floating, onClose, className, style },
  ref,
) {
  const me = useDocs(state => state.me);
  const writable = useDocs(state => state.writable);
  const commentable = useDocs(state => state.commentable);
  const busy = useSuggest(state => state.busy);
  const reply = useSuggestionReply(state => state.handler);
  const text = sentenceText(card.sentence);
  const withdraws = card.mine && !card.agent;
  const shown = selected || floating;

  const run = (verdict: Verdict) => (event: MouseEvent) => {
    event.stopPropagation();
    void decide(tab, [card.id], verdict);
  };

  const step = (by: 1 | -1) => (event: MouseEvent) => {
    event.stopPropagation();
    const next = stepSuggestion(by);
    if (next && !floating) focusCard(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (floating && onClose) onClose();
      currentView()?.focus();
      return;
    }
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      revealSuggestion(card.id, true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = stepSuggestion(event.key === 'ArrowDown' ? 1 : -1);
      if (next) focusCard(next);
    }
  };

  const onClick = (event: MouseEvent) => {
    if ((event.target as Element).closest('button, [role="menu"]')) return;
    revealSuggestion(card.id);
  };

  const Avatar = card.agent ? Bot : User;
  return (
    <div
      ref={ref}
      data-suggest-card={card.id}
      tabIndex={0}
      role="group"
      aria-label={`Suggestion ${index + 1} of ${total}: ${text}`}
      aria-current={selected ? 'true' : undefined}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onMouseEnter={() => setSuggest({ hoveredCard: card.id })}
      onMouseLeave={() => setSuggest(state => (state.hoveredCard === card.id ? { hoveredCard: null } : state))}
      style={style}
      className={cn(
        'doc-suggest-card group pointer-events-auto flex flex-col gap-1.5 rounded-[12px] bg-chrome p-2.5 pl-3 text-chrome-fg shadow-chrome outline-none transition-[box-shadow,transform] duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-focus',
        selected && 'doc-suggest-card-selected',
        className,
      )}
    >
      <div className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-chrome-hover text-chrome-muted">
          <Avatar className="size-3.5" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-4">
          <span className="truncate text-[13px] font-medium">{author(card, me)}</span>
          <span className="truncate text-[12px] text-chrome-muted" title={card.at ? new Date(card.at).toLocaleString() : undefined}>
            {[card.agent && card.mine ? 'for you' : '', card.at ? timeAgo(card.at) : ''].filter(Boolean).join(' · ')}
          </span>
        </span>
        {writable ? (
          <TipGroup>
            <div
              role="toolbar"
              aria-label="Suggestion actions"
              className={cn('flex items-center gap-0.5 transition-opacity', !shown && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100')}
            >
              <TipButton square tip="Accept suggestion" aria-label="Accept suggestion" disabled={busy} onClick={run('accept')}>
                <Check {...ICON} />
              </TipButton>
              {withdraws ? (
                <TipButton square tip="Withdraw suggestion" aria-label="Withdraw suggestion" disabled={busy} onClick={run('withdraw')}>
                  <Undo2 {...ICON} />
                </TipButton>
              ) : (
                <TipButton square tip="Reject suggestion" aria-label="Reject suggestion" disabled={busy} onClick={run('reject')}>
                  <X {...ICON} />
                </TipButton>
              )}
              {total > 1 ? <AllMenu total={total} /> : null}
            </div>
          </TipGroup>
        ) : null}
        {floating && onClose ? (
          <TipButton square tip="Close suggestion" aria-label="Close suggestion" onClick={onClose}>
            <X {...ICON} />
          </TipButton>
        ) : null}
      </div>
      <SentenceView sentence={card.sentence} />
      {shown && (total > 1 || (reply && commentable)) ? (
        <div className="-mb-1 -ml-1 flex items-center gap-0.5">
          {total > 1 ? (
            <>
              <TipButton square tip="Previous suggestion" aria-label="Previous suggestion" onClick={step(-1)}>
                <ChevronUp {...ICON} />
              </TipButton>
              <TipButton square tip="Next suggestion" aria-label="Next suggestion" onClick={step(1)}>
                <ChevronDown {...ICON} />
              </TipButton>
              <span className="px-1 text-[12px] tabular-nums text-chrome-muted">
                {index + 1} of {total}
              </span>
            </>
          ) : null}
          {reply && commentable ? (
            <TipButton
              tip="Reply"
              className="ml-auto text-[13px]"
              onClick={event => {
                event.stopPropagation();
                reply({ tab, suggestId: card.id, summary: text });
              }}
            >
              <MessageSquareReply {...ICON} />
              Reply
            </TipButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

function AllMenu({ total }: { total: number }): ReactNode {
  return (
    <ChromeMenu
      align="end"
      tip={{ label: 'More' }}
      trigger={
        <button
          type="button"
          aria-label="More suggestion actions"
          className="inline-flex size-7 items-center justify-center rounded-[8px] text-chrome-fg outline-none hover:bg-chrome-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-chrome-focus"
          onClick={event => event.stopPropagation()}
        >
          <MoreHorizontal {...ICON} />
        </button>
      }
    >
      <ChromeMenuItem icon={<Check {...ICON} />} onSelect={() => void decideAll('accept')}>
        Accept all {total}
      </ChromeMenuItem>
      <ChromeMenuItem icon={<X {...ICON} />} onSelect={() => void decideAll('reject')}>
        Reject all {total}
      </ChromeMenuItem>
    </ChromeMenu>
  );
}
