/** A comment's text box: grows with its text, Enter sends, Shift-Enter or Alt-Enter breaks the line, Escape cancels, `@` offers people and the agent. */
import { ChromeButton, Tip } from '@open-artifact/editor-kit/react';
import { COMMENT_TEXT_MAX, MOD } from '@open-artifact/editor-kit';
import { cn } from '@open-artifact/ui';
import { ArrowUp, Bot } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type MentionCandidate, insertMention, matchCandidates, mentionQuery } from './mentions.ts';
import { agentName, canAskAgent, mentionCandidates, myName, useCommentUi, useThreads } from './store.ts';

/** Who the viewer can @mention now. */
export function useMentionCandidates(): MentionCandidate[] {
  const threads = useThreads(state => state.threads);
  const peers = useCommentUi(state => state.peers);
  const agent = useCommentUi(state => state.agent);
  return useMemo(() => mentionCandidates(threads, peers, myName(), canAskAgent() ? { name: agentName() } : null), [threads, peers, agent]);
}

export interface ComposerProps {
  value: string;
  onChange(text: string): void;
  onSubmit(text: string): void;
  onCancel(): void;
  label: string;
  placeholder: string;
  submitLabel: string;
  busy?: boolean;
  autoFocus?: boolean;
  /** Buttons only while it has focus or text (a reply box under a thread). */
  compact?: boolean;
}

const MAX_HEIGHT = 240;
/** From here on the composer counts what is left. */
const COUNT_FROM = COMMENT_TEXT_MAX - 500;

export function Composer({ value, onChange, onSubmit, onCancel, label, placeholder, submitLabel, busy = false, autoFocus = false, compact = false }: ComposerProps): ReactNode {
  const field = useRef<HTMLTextAreaElement>(null);
  const candidates = useMentionCandidates();
  const [caret, setCaret] = useState(value.length);
  const [focused, setFocused] = useState(autoFocus);
  const [picked, setPicked] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  const query = focused ? mentionQuery(value, caret) : null;
  const matches = query && query.start !== dismissed ? matchCandidates(candidates, query.query) : [];
  const listOpen = matches.length > 0;

  // A card is hidden until it has its place, and a hidden field takes no focus, so this tries for a few frames.
  useEffect(() => {
    if (!autoFocus) return;
    let frame = 0;
    let tries = 0;
    const take = () => {
      const element = field.current;
      if (!element) return;
      element.focus({ preventScroll: true });
      if (document.activeElement === element) {
        element.setSelectionRange(element.value.length, element.value.length);
        return;
      }
      if (++tries < 20) frame = requestAnimationFrame(take);
    };
    take();
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  useEffect(() => setPicked(0), [query?.query, query?.start]);

  const pick = (candidate: MentionCandidate) => {
    if (!query) return;
    const next = insertMention(value, query.start, caret, candidate.name);
    onChange(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const over = value.length > COMMENT_TEXT_MAX;
  const submit = () => {
    if (busy || !value.trim() || over) return;
    onSubmit(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (listOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setPicked(index => (index + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if ((event.key === 'Enter' && !event.metaKey && !event.ctrlKey) || event.key === 'Tab') {
        event.preventDefault();
        pick(matches[picked] ?? matches[0]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(query!.start);
        return;
      }
    }
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      const box = event.currentTarget;
      const caret = box.selectionStart + 1;
      onChange(value.slice(0, box.selectionStart) + '\n' + value.slice(box.selectionEnd));
      requestAnimationFrame(() => box.setSelectionRange(caret, caret));
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const showButtons = !compact || focused || value.length > 0;
  return (
    <div className="relative" data-comment-composer="">
      <textarea
        ref={field}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        rows={1}
        disabled={busy}
        onChange={event => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setDismissed(null);
        }}
        onSelect={event => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="block w-full resize-none rounded-[8px] bg-chrome-field px-2.5 py-1.5 text-[13px] leading-5 text-chrome-fg shadow-[inset_0_0_0_1px_var(--color-chrome-ring)] outline-none placeholder:text-chrome-muted focus:shadow-[inset_0_0_0_1px_var(--color-chrome-accent)]"
        style={{ maxHeight: MAX_HEIGHT }}
      />
      {listOpen ? (
        <ul role="listbox" aria-label="People to mention" className="absolute top-full left-0 z-20 mt-1 w-full rounded-[10px] bg-chrome p-1 shadow-chrome-popup">
          {matches.map((candidate, index) => (
            <li
              key={candidate.key}
              role="option"
              aria-selected={index === picked}
              onMouseDown={event => {
                event.preventDefault();
                pick(candidate);
              }}
              onMouseEnter={() => setPicked(index)}
              className={cn('flex h-7 cursor-default items-center gap-2 rounded-[6px] px-2 text-[13px]', index === picked && 'bg-chrome-hover')}
            >
              <Initial name={candidate.name} agent={candidate.kind === 'agent'} />
              <span className="truncate">{candidate.name}</span>
              {candidate.kind === 'agent' ? <span className="ml-auto text-[12px] text-chrome-muted">Hands the thread to the agent</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {showButtons ? (
        <div className="mt-1.5 flex items-center justify-end gap-1">
          {value.length >= COUNT_FROM ? (
            <span className={cn('mr-auto text-[12px] tabular-nums', over ? 'text-red-600 dark:text-red-400' : 'text-chrome-muted')} aria-live="polite" data-testid="comment-count">
              {over ? `${(value.length - COMMENT_TEXT_MAX).toLocaleString()} characters too long` : `${(COMMENT_TEXT_MAX - value.length).toLocaleString()} characters left`}
            </span>
          ) : null}
          <ChromeButton className="h-6 px-2 text-[13px] text-chrome-muted" onMouseDown={event => event.preventDefault()} onClick={onCancel}>
            Cancel
          </ChromeButton>
          <Tip label={submitLabel} shortcut={`${MOD}↵`} side="bottom">
            <ChromeButton
              square
              aria-label={submitLabel}
              disabled={busy || !value.trim() || over}
              onMouseDown={event => event.preventDefault()}
              onClick={submit}
              className="h-6 w-6 rounded-full bg-chrome-accent text-white hover:bg-chrome-accent hover:brightness-110"
            >
              <ArrowUp className="size-3.5" strokeWidth={2.25} />
            </ChromeButton>
          </Tip>
        </div>
      ) : null}
    </div>
  );
}

/** A person's first letter, or the agent's mark. */
export function Initial({ name, agent = false, size = 'sm' }: { name: string; agent?: boolean; size?: 'sm' | 'md' }): ReactNode {
  const box = size === 'md' ? 'size-6 text-[12px]' : 'size-5 text-[11px]';
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-medium', box, agent ? 'bg-chrome-pressed text-chrome-pressed-fg' : 'bg-chrome-hover text-chrome-fg')}>
      {agent ? <Bot className="size-3.5" /> : (name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
