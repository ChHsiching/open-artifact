/** "Insert dropdown": one of the doc's lists, a new one, or one from a template, put in at the caret as a chip. */
import type { DocEnum } from '@open-artifact/runtime/doc-api';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useDocs } from '../app/store.ts';
import { insertDropdownChip } from './chips.ts';
import { createDropdown, dropdownFromTemplate } from './dropdown-calls.ts';
import { type DropdownTemplate, emptyDraft, finishDraft } from './dropdown-model.ts';
import { DropdownLibrary } from './DropdownLibrary.tsx';
import { OptionsEditor } from './OptionsEditor.tsx';
import { PickerShell } from './PickerShell.tsx';
import { closePicker } from './plugin.ts';

const NO_ENUMS: readonly DocEnum[] = [];

export function InsertDropdownPicker({ view, pos }: { view: EditorView; pos: number }): ReactNode {
  const enums = useDocs(state => state.project?.enums ?? NO_ENUMS);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!creating) panel.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [creating]);

  const insert = (id: string) => {
    view.focus();
    insertDropdownChip(view, id, { range: { from: pos, to: pos }, open: true });
  };

  const leave = () => {
    closePicker(view);
    view.focus();
  };

  const fromTemplate = async (template: DropdownTemplate) => {
    setBusy(template.name);
    try {
      insert(await dropdownFromTemplate(template));
    } catch {
      setBusy(null);
    }
  };

  return (
    <PickerShell view={view} pos={pos} onChip={false} label="Insert dropdown" onEscape={() => (creating ? setCreating(false) : leave())}>
      {creating ? (
        <OptionsEditor
          initial={emptyDraft()}
          submitLabel="Create"
          busyLabel="Creating…"
          failedLabel="Create failed — retry"
          onBack={() => setCreating(false)}
          onSubmit={async draft => insert(await createDropdown(finishDraft(draft, null)))}
        />
      ) : (
        <div
          ref={panel}
          className="max-h-80 w-64 overflow-y-auto p-1.5"
          onKeyDown={event => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
            const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            buttons[(at + step + buttons.length) % buttons.length]?.focus();
          }}
        >
          <DropdownLibrary enums={enums} busy={busy} onPick={insert} onTemplate={template => void fromTemplate(template)} onNew={() => setCreating(true)} />
        </div>
      )}
    </PickerShell>
  );
}
