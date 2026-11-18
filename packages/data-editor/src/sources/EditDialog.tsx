import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Button, Dialog, cn } from '@open-artifact/ui';
import { DISCARD_LABEL, KEEP_EDITING_LABEL } from '../drafts/words.ts';
import { holdLeaveLosesWork } from '../sync/index.ts';
import { discardChangesQuestion } from './words.ts';

export const EDIT_DIALOG_CLASS = 'w-[min(44rem,calc(100vw-2rem))]! max-h-[calc(100dvh-2rem)] flex flex-col';

export interface EditDialogProps {
  /** The source's name (for the discard question). */
  name: string;
  title: ReactNode;
  description?: ReactNode;
  saving: boolean;
  unsaved: boolean;
  /** What is lost on discard ("What you typed hasn’t been saved."). */
  unsavedWords: string;
  /** Closes the editor (after a discard too). */
  onLeave: () => void;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A source editor's dialog. While it saves or holds unsaved work, leaving the page warns; closing it waits for a save
 * to finish, and asks before unsaved work is discarded.
 */
export function EditDialog({ name, title, description, saving, unsaved, unsavedWords, onLeave, footer, children, className }: EditDialogProps): ReactElement {
  const [asking, setAsking] = useState(false);
  const [closeAfterSave, setCloseAfterSave] = useState(false);
  const holding = saving || unsaved;
  useEffect(() => (holding ? holdLeaveLosesWork() : undefined), [holding]);
  useEffect(() => {
    if (!closeAfterSave || saving) return;
    setCloseAfterSave(false);
    onLeave();
  }, [closeAfterSave, saving, onLeave]);
  const requestClose = (): void => {
    if (saving) setCloseAfterSave(true);
    else if (unsaved) setAsking(true);
    else onLeave();
  };
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
        title={title}
        description={description}
        className={cn(EDIT_DIALOG_CLASS, className)}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        {footer}
      </Dialog>
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={discardChangesQuestion(name)}
        description={unsavedWords}
        footer={
          <>
            <Button autoFocus onClick={() => setAsking(false)}>
              {KEEP_EDITING_LABEL}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setAsking(false);
                onLeave();
              }}
            >
              {DISCARD_LABEL}
            </Button>
          </>
        }
      />
    </>
  );
}
