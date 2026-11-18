/** Emoji reactions: the picker, a message's reaction pills, and the selection toolbar's picker for reacting to words. */
import type { CommentMessage } from '@open-artifact/runtime';
import { ChromeButton, ChromePopover, Tip } from '@open-artifact/editor-kit/react';
import { cn } from '@open-artifact/ui';
import { SmilePlus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { reactOnSelection, toggleReaction } from './actions.ts';
import { canComment, myName, setCommentUi, useCommentUi } from './store.ts';
import { reactedByMe } from './threads.ts';

export const QUICK_EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀', '🙏', '✅', '🔥', '💯', '🤔'];

export function EmojiGrid({ onPick }: { onPick(emoji: string): void }): ReactNode {
  return (
    <div role="group" aria-label="Reactions" className="grid grid-cols-6 gap-0.5">
      {QUICK_EMOJI.map(emoji => (
        <button
          key={emoji}
          type="button"
          data-emoji={emoji}
          aria-label={emoji}
          onClick={() => onPick(emoji)}
          className="flex size-8 items-center justify-center rounded-[8px] text-[18px] outline-none hover:bg-chrome-hover focus-visible:bg-chrome-hover"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** The "Add a reaction" button of a message. */
export function ReactionButton({ thread, message }: { thread: string; message: string }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <ChromePopover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      label="Add a reaction"
      className="p-1"
      trigger={
        <ChromeButton square aria-label="Add a reaction" className="size-6 text-chrome-muted" onClick={event => event.stopPropagation()}>
          <SmilePlus className="size-3.5" />
        </ChromeButton>
      }
    >
      <EmojiGrid
        onPick={emoji => {
          setOpen(false);
          void toggleReaction(thread, message, emoji);
        }}
      />
    </ChromePopover>
  );
}

/** The reactions on a message; each toggles the viewer's own. */
export function ReactionPills({ thread, message }: { thread: string; message: CommentMessage }): ReactNode {
  const reactions = (message.reactions ?? []).filter(reaction => reaction.authors.length > 0);
  if (!reactions.length) return null;
  const me = myName();
  const can = canComment();
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {reactions.map(reaction => {
        const mine = reactedByMe(reaction, me);
        const names = reaction.authors.map(author => (author.name === me && author.kind === 'person' ? 'You' : author.name)).join(', ');
        const pill = cn(
          'flex h-6 items-center gap-1 rounded-full border px-1.5 text-[12px] leading-none transition-colors',
          mine ? 'border-chrome-accent bg-chrome-pressed text-chrome-pressed-fg' : 'border-chrome-line text-chrome-muted',
          can && !mine && 'hover:bg-chrome-hover',
        );
        const body = (
          <>
            <span className="text-[13px]">{reaction.emoji}</span>
            <span>{reaction.authors.length}</span>
          </>
        );
        return (
          <Tip key={reaction.emoji} label={names} side="top">
            {can ? (
              <button
                type="button"
                aria-pressed={mine}
                aria-label={`${reaction.emoji} ${reaction.authors.length}: ${names}`}
                className={pill}
                onClick={event => {
                  event.stopPropagation();
                  void toggleReaction(thread, message.id, reaction.emoji);
                }}
              >
                {body}
              </button>
            ) : (
              <span role="img" aria-label={`${reaction.emoji} ${reaction.authors.length}: ${names}`} className={pill}>
                {body}
              </span>
            )}
          </Tip>
        );
      })}
    </div>
  );
}

/** The picker the selection toolbar's reaction button opens: the emoji picked hangs on the selected words. */
export function SelectionReactionPicker(): ReactNode {
  const spot = useCommentUi(state => state.picker);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  if (!spot) return null;
  return (
    <>
      <div ref={setAnchor} aria-hidden="true" className="pointer-events-none fixed" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} />
      {anchor ? (
        <ChromePopover
          open
          onOpenChange={open => !open && setCommentUi({ picker: null })}
          anchor={anchor}
          side="bottom"
          align="center"
          label="React to the selection"
          className="p-1"
          trigger={<span hidden />}
        >
          <EmojiGrid
            onPick={emoji => {
              setCommentUi({ picker: null });
              void reactOnSelection(emoji);
            }}
          />
        </ChromePopover>
      ) : null}
    </>
  );
}
