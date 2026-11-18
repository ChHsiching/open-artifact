/** One message of a thread: who wrote it and when, its text (long ones folded), its reactions and what can be done with it. */
import type { CommentMessage, CommentThread } from '@open-artifact/runtime';
import { ChromeButton, ChromeMenu, ChromeMenuItem, ChromeMenuSeparator, Tip } from '@open-artifact/editor-kit/react';
import { ConfirmDialog, cn } from '@open-artifact/ui';
import { Check, Ellipsis, RotateCcw } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { copyLink, editMessage, remove, removePlace, resolve } from './actions.ts';
import { Composer, Initial, useMentionCandidates } from './Composer.tsx';
import { splitMentions } from './mentions.ts';
import { ReactionButton, ReactionPills } from './Reactions.tsx';
import { canComment, canRemoveAny, myName, setCommentUi, useCommentUi } from './store.ts';
import { canDeleteMessage, canDeleteThread, canEditMessage } from './threads.ts';
import { commentDate, commentTime } from './time.ts';

/** The text of a message, its @mentions marked; past a few lines it folds behind "Show more". */
export function MessageText({ text, lines = 6 }: { text: string; lines?: number }): ReactNode {
  const candidates = useMentionCandidates();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || open) return;
    setLong(element.scrollHeight > element.clientHeight + 1);
  }, [text, lines, open]);
  const pieces = splitMentions(text, candidates.map(candidate => candidate.name));
  return (
    <div>
      <div ref={box} className="whitespace-pre-wrap break-words text-[13px] leading-5 text-chrome-fg" style={open ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }}>
        {pieces.map((piece, index) =>
          piece.mention ? (
            <span key={index} className="font-medium text-chrome-accent">
              {piece.text}
            </span>
          ) : (
            piece.text
          ),
        )}
      </div>
      {long || open ? (
        <button
          type="button"
          className="mt-0.5 text-[12px] font-medium text-chrome-muted hover:text-chrome-fg"
          onClick={event => {
            event.stopPropagation();
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

export interface MessageProps {
  thread: CommentThread;
  message: CommentMessage;
  /** The thread's first message: it carries the thread's actions. */
  root: boolean;
  /** The card is open: actions stay shown and the text is not folded as tightly. */
  open: boolean;
  /** Which place of the thread was clicked, when it has more than one live (it can be taken off those words). */
  removablePlace: string | null | undefined;
}

export function Message({ thread, message, root, open, removablePlace }: MessageProps): ReactNode {
  const me = myName();
  const editing = useCommentUi(state => state.editing?.thread === thread.id && state.editing.message === message.id);
  const [draft, setDraft] = useState(message.text);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'discard' | null>(null);
  const commenting = canComment();
  const resolved = thread.status === 'resolved';
  const editable = canEditMessage(message, me, commenting);
  const deletable = root ? canDeleteThread(thread, me, commenting, canRemoveAny()) : canDeleteMessage(message, me, commenting, canRemoveAny());
  const agent = message.author.kind === 'agent';
  const name = message.author.kind === 'person' && message.author.name === me && me !== 'You' ? `${message.author.name} (you)` : message.author.name;

  const stopEditing = () => setCommentUi({ editing: null });
  const startEditing = () => {
    setDraft(message.text);
    setCommentUi({ editing: { thread: thread.id, message: message.id } });
  };

  return (
    <div className="group/message" data-comment-message={message.id}>
      <div className="flex items-center gap-1.5">
        <Initial name={message.author.name} agent={agent} size="md" />
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-[13px] font-medium text-chrome-fg">{name}</span>
          <Tip label={commentDate(message.editedAt ?? message.at)} side="top">
            <span className="shrink-0 text-[12px] text-chrome-muted">
              {commentTime(message.at)}
              {message.editedAt ? ' (edited)' : ''}
            </span>
          </Tip>
        </div>
        <div className={cn('flex shrink-0 items-center gap-0.5', !open && 'opacity-0 group-hover/message:opacity-100 focus-within:opacity-100')}>
          {commenting && !editing ? <ReactionButton thread={thread.id} message={message.id} /> : null}
          <ChromeMenu
            align="end"
            tip={{ label: 'More options', side: 'top' }}
            trigger={
              <ChromeButton square aria-label="More options" className="size-6 text-chrome-muted" onClick={event => event.stopPropagation()}>
                <Ellipsis className="size-3.5" />
              </ChromeButton>
            }
          >
            <ChromeMenuItem onSelect={() => void copyLink(thread)}>Copy link</ChromeMenuItem>
            {editable ? <ChromeMenuItem onSelect={startEditing}>Edit</ChromeMenuItem> : null}
            {root && removablePlace !== undefined && commenting && !resolved ? (
              <ChromeMenuItem onSelect={() => void removePlace(thread, removablePlace)}>Remove from these words</ChromeMenuItem>
            ) : null}
            {root && resolved && commenting ? <ChromeMenuItem onSelect={() => void resolve(thread.id, false)}>Reopen</ChromeMenuItem> : null}
            {deletable ? (
              <>
                <ChromeMenuSeparator />
                <ChromeMenuItem danger onSelect={() => setConfirm('delete')}>
                  {root && thread.messages.length > 1 ? 'Delete thread' : 'Delete comment'}
                </ChromeMenuItem>
              </>
            ) : null}
          </ChromeMenu>
          {root && commenting ? (
            resolved ? (
              <Tip label="Reopen" side="top">
                <ChromeButton
                  square
                  aria-label="Reopen"
                  className="size-6 text-chrome-accent"
                  onClick={event => {
                    event.stopPropagation();
                    void resolve(thread.id, false);
                  }}
                >
                  <RotateCcw className="size-3.5" />
                </ChromeButton>
              </Tip>
            ) : (
              <Tip label="Resolve" side="top">
                <ChromeButton
                  square
                  aria-label="Resolve"
                  className="size-6 text-chrome-muted hover:text-chrome-accent"
                  onClick={event => {
                    event.stopPropagation();
                    void resolve(thread.id, true);
                  }}
                >
                  <Check className="size-4" />
                </ChromeButton>
              </Tip>
            )
          ) : null}
        </div>
      </div>
      <div className="mt-1 pl-[30px]" onClick={editing ? event => event.stopPropagation() : undefined}>
        {editing ? (
          <Composer
            label="Edit comment"
            placeholder="Edit comment"
            submitLabel="Save"
            value={draft}
            onChange={setDraft}
            busy={busy}
            autoFocus
            onSubmit={text => {
              setBusy(true);
              void editMessage(thread.id, message.id, text).finally(() => setBusy(false));
            }}
            onCancel={() => (draft.trim() !== message.text.trim() ? setConfirm('discard') : stopEditing())}
          />
        ) : (
          <MessageText text={message.text} lines={open ? 12 : 4} />
        )}
        <ReactionPills thread={thread.id} message={message} />
      </div>
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={next => !next && setConfirm(null)}
        title={root && thread.messages.length > 1 ? 'Delete this thread?' : 'Delete this comment?'}
        description={root && thread.messages.length > 1 ? 'The comment and its replies will be deleted for everyone.' : 'It will be deleted for everyone.'}
        confirmLabel="Delete"
        danger
        onConfirm={() => void remove(thread.id, root ? undefined : message.id)}
      />
      <ConfirmDialog
        open={confirm === 'discard'}
        onOpenChange={next => !next && setConfirm(null)}
        title="Discard changes?"
        description="What you have typed in this comment will be lost."
        confirmLabel="Discard"
        danger
        onConfirm={stopEditing}
      />
    </div>
  );
}
