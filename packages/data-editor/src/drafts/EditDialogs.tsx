/**
 * The questions edit mode and drafts ask: make an older page editable,
 * discard unsaved changes, save them before asking the agent, and save or
 * discard a draft.
 */

import { useRef, type ReactNode } from 'react';
import { Button, Dialog } from '@open-artifact/ui';
import { useDocument } from '../state/document.ts';
import { answerEdit, useEditFlow, type EditDialogKind } from './edit-flow.ts';
import { answerDraft, useDraftFlow } from './flow.ts';
import { usePersonName } from './people.ts';
import {
  ASK_AGENT_LABEL,
  ASK_TITLE,
  CONVERT_DESCRIPTION,
  CONVERT_TITLE,
  DISCARD_AND_ASK_LABEL,
  DISCARD_LABEL,
  DRAFT_DISCARD_DESCRIPTION,
  DRAFT_SAVE_DESCRIPTION,
  KEEP_DRAFT_LABEL,
  KEEP_EDITING_LABEL,
  NOT_NOW_LABEL,
  SAVE_AND_ASK_LABEL,
  SAVE_LABEL,
  askDescription,
  discardDescription,
  discardTitle,
  draftQuestionTitle,
  type DraftQuestion,
} from './words.ts';

/** Keeps a dialog's last words while it closes. */
function useLast<T>(value: T | null, initial: T): T {
  const last = useRef(initial);
  if (value !== null) last.current = value;
  return last.current;
}

/** Edit mode's dialogs; mount once beside the page. */
export function EditDialogs(): ReactNode {
  const dialog = useEditFlow((state) => state.dialog);
  const count = useEditFlow((state) => state.count);
  const title = useDocument((state) => state.title);
  const last = useLast<{ dialog: EditDialogKind; count: number }>(dialog === null ? null : { dialog, count }, { dialog: 'discard', count });
  const stay = (open: boolean): void => {
    if (!open) answerEdit('stay');
  };
  const shown = dialog !== null;
  if (last.dialog === 'convert')
    return (
      <Dialog
        open={shown}
        onOpenChange={stay}
        title={CONVERT_TITLE}
        description={CONVERT_DESCRIPTION}
        footer={
          <>
            <Button onClick={() => answerEdit('stay')}>{NOT_NOW_LABEL}</Button>
            <Button variant="primary" onClick={() => answerEdit('confirm')}>
              {ASK_AGENT_LABEL}
            </Button>
          </>
        }
      />
    );
  if (last.dialog === 'discard')
    return (
      <Dialog
        open={shown}
        onOpenChange={stay}
        title={discardTitle(title)}
        description={discardDescription(last.count)}
        footer={
          <>
            <Button autoFocus onClick={() => answerEdit('stay')}>
              {KEEP_EDITING_LABEL}
            </Button>
            <Button variant="danger" onClick={() => answerEdit('confirm')}>
              {DISCARD_LABEL}
            </Button>
          </>
        }
      />
    );
  return (
    <Dialog
      open={shown}
      onOpenChange={stay}
      title={ASK_TITLE}
      description={askDescription(last.count)}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" autoFocus onClick={() => answerEdit('stay')}>
            {KEEP_EDITING_LABEL}
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => answerEdit('other')}>{DISCARD_AND_ASK_LABEL}</Button>
            <Button variant="primary" onClick={() => answerEdit('confirm')}>
              {SAVE_AND_ASK_LABEL}
            </Button>
          </div>
        </div>
      }
    />
  );
}

/** The save / discard question for a draft; mount once beside the page. */
export function DraftDialog(): ReactNode {
  const asking = useDraftFlow((state) => state.asking);
  const view = useDraftFlow((state) => state.view);
  const someoneElse = view.head !== null && !view.mine ? view.head.by : null;
  const owner = usePersonName(someoneElse ?? '');
  const last = useLast<{ what: DraftQuestion; whose: string | null }>(asking === null ? null : { what: asking.what, whose: someoneElse === null ? null : owner }, {
    what: 'discard',
    whose: null,
  });
  const save = last.what === 'save';
  return (
    <Dialog
      open={asking !== null}
      onOpenChange={(open) => {
        if (!open) answerDraft(false);
      }}
      title={draftQuestionTitle(last.what, last.whose)}
      description={save ? DRAFT_SAVE_DESCRIPTION : DRAFT_DISCARD_DESCRIPTION}
      footer={
        <>
          <Button autoFocus onClick={() => answerDraft(false)}>
            {KEEP_DRAFT_LABEL}
          </Button>
          <Button variant={save ? 'primary' : 'danger'} onClick={() => answerDraft(true)}>
            {save ? SAVE_LABEL : DISCARD_LABEL}
          </Button>
        </>
      }
    />
  );
}
