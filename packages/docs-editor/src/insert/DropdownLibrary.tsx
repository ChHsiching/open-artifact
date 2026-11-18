/** The doc's dropdown lists to choose from, "New dropdown…", and the templates the doc has no list for yet. */
import type { DocEnum } from '@open-artifact/runtime/doc-api';
import { cn } from '@open-artifact/ui';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { type DropdownTemplate, unusedTemplates } from './dropdown-model.ts';

export interface DropdownLibraryProps {
  enums: readonly DocEnum[];
  /** The list left out (the chip's own). */
  current?: string | null;
  /** A template being made into a list. */
  busy?: string | null;
  onPick(id: string): void;
  onTemplate(template: DropdownTemplate): void;
  onNew(): void;
}

const SECTION = 'px-2.5 pt-1.5 pb-0.5 text-[12px] font-medium text-chrome-muted';

export function LibraryRow({ name, count, onClick, disabled, icon }: { name: string; count?: number; onClick(): void; disabled?: boolean; icon?: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseDown={event => event.preventDefault()}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left outline-none hover:bg-chrome-hover focus-visible:bg-chrome-hover',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {icon ? <span className="flex size-4 shrink-0 items-center justify-center text-chrome-muted">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {count !== undefined ? <span className="shrink-0 text-[13px] text-chrome-muted">{count}</span> : null}
    </button>
  );
}

export function DropdownLibrary({ enums, current, busy, onPick, onTemplate, onNew }: DropdownLibraryProps): ReactNode {
  const others = enums.filter(list => list.id !== current);
  const templates = unusedTemplates(enums);
  return (
    <div>
      {others.length ? <div className={SECTION}>Document dropdowns</div> : null}
      {others.map(list => (
        <LibraryRow key={list.id} name={list.name || 'Untitled dropdown'} count={list.options.filter(option => !option.disabled).length} onClick={() => onPick(list.id)} />
      ))}
      <LibraryRow name="New dropdown…" icon={<Plus className="size-4" />} onClick={onNew} />
      {templates.length ? (
        <>
          <div className="mx-2 my-1 h-px bg-chrome-line" aria-hidden="true" />
          <div className={SECTION}>Templates</div>
          {templates.map(template => (
            <LibraryRow
              key={template.name}
              name={busy === template.name ? 'Creating…' : template.name}
              count={template.options.length}
              disabled={busy === template.name}
              onClick={() => onTemplate(template)}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
