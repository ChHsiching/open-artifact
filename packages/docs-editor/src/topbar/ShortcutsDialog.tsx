/** The keyboard shortcuts sheet: ⌘/ (or ?) and the More menu open it. */
import { isApplePlatform } from '@open-artifact/editor-kit';
import { Dialog } from '@open-artifact/ui';
import { Fragment, type ReactNode } from 'react';
import { setDocs, useDocs } from '../app/store.ts';
import { SHORTCUT_GROUPS, type ShortcutRow, keyLabel } from './shortcuts.ts';

function Keys({ row, apple }: { row: ShortcutRow; apple: boolean }): ReactNode {
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {row.keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 ? <span className="text-[11px] text-fg-muted">{row.range ? 'to' : 'or'}</span> : null}
          <kbd className={`rounded-[4px] bg-hover px-1.5 py-0.5 text-[12px] leading-4 ${row.typed ? 'font-mono whitespace-pre' : 'font-sans'}`}>
            {row.typed ? key : keyLabel(key, apple)}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsDialog(): ReactNode {
  const open = useDocs(state => state.shortcuts);
  const apple = isApplePlatform();
  return (
    <Dialog open={open} onOpenChange={next => setDocs({ shortcuts: next })} title="Keyboard shortcuts" className="w-[min(48rem,calc(100vw-2rem))]">
      <div className="max-h-[min(70vh,40rem)] overflow-y-auto pr-1">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map(group => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-[12px] font-semibold text-fg-muted">{group.title}</h3>
              <dl className="flex flex-col">
                {group.rows.map(row => (
                  <div key={`${row.label}${row.where ?? ''}`} className="flex items-start justify-between gap-3 py-1 text-[13px]">
                    <dt className="min-w-0">
                      {row.label}
                      {row.where ? <span className="text-fg-muted"> · {row.where}</span> : null}
                    </dt>
                    <dd>
                      <Keys row={row} apple={apple} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/** ⌘/ shows or hides the sheet. */
export function toggleShortcuts(): boolean {
  setDocs(state => ({ shortcuts: !state.shortcuts }));
  return true;
}
