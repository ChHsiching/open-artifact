/** The card of a thread being written: the words it will hang on (what the cells are, on several), and its text box. */
import { ConfirmDialog } from '@open-artifact/ui';
import { type ReactNode, type Ref, useState } from 'react';
import { cancelComposer, createThread } from './actions.ts';
import { Composer } from './Composer.tsx';
import { canAskAgent, setCommentUi, useCommentUi } from './store.ts';

export function NewThreadCard({ cardRef }: { cardRef?: Ref<HTMLDivElement> }): ReactNode {
  const composer = useCommentUi(state => state.composer);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  if (!composer) return null;
  const setText = (text: string) => {
    const current = useCommentUi.getState().composer;
    if (current) setCommentUi({ composer: { ...current, text } });
  };
  return (
    <div ref={cardRef} className="pointer-events-auto rounded-[12px] bg-chrome p-3 text-chrome-fg shadow-chrome-popup ring-1 ring-chrome-accent/50" data-comment-card="new">
      {composer.clamped ? <div className="mb-2 text-[12px] text-chrome-muted">Long selection — your comment will attach to the beginning of it.</div> : null}
      {composer.anchor.kind === 'cells' ? <div className="mb-2 truncate border-l-2 border-[rgb(255_196_0/0.8)] pl-2 text-[12px] text-chrome-muted">{composer.label}</div> : null}
      <Composer
        autoFocus
        label="Add a comment"
        placeholder={canAskAgent() ? 'Comment, or @ to mention someone or the agent' : 'Comment, or @ to mention someone'}
        submitLabel="Comment"
        value={composer.text}
        onChange={setText}
        busy={busy}
        onSubmit={text => {
          setBusy(true);
          void createThread(text).finally(() => setBusy(false));
        }}
        onCancel={() => (composer.text.trim() ? setDiscard(true) : cancelComposer())}
      />
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title="Discard comment?"
        description="Your unsent comment will be lost."
        confirmLabel="Discard"
        danger
        onConfirm={cancelComposer}
      />
    </div>
  );
}
