/** The menu under a `/`, `@` or `:` being typed: its rows follow the query, the keys stay in the text. */
import { cn } from '@open-artifact/ui';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Fragment, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import { ItemIcon } from './icons.tsx';
import { PLACED, usePlaceAt } from './placement.ts';
import { type MenuOption, type Trigger, activeTrigger, canWrite, insertState, optionsFor, pickOption, setMenuIndex } from './plugin.ts';
import { FEATURED_COUNT } from './slash-items.ts';

const LABELS: Record<Trigger['kind'], string> = { slash: 'Insert block', mention: 'Mention', emoji: 'Emoji' };

const EMPTY: Record<Trigger['kind'], string | null> = { slash: 'No matches', mention: 'No matches — insert blocks with /', emoji: null };

export function TypeaheadMenu(): ReactNode {
  const view = useEditor(state => state.view);
  const state = useEditor(state => state.state);
  const focused = useEditor(state => state.focused);
  const writable = useDocs(state => state.writable);
  const trigger = activeTrigger(state);
  if (!view || !state || !trigger || !focused || !writable || !canWrite(view)) return null;
  return <TypeaheadPanel view={view} state={state} trigger={trigger} />;
}

function TypeaheadPanel({ view, state, trigger }: { view: EditorView; state: EditorState; trigger: Trigger }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const options = useMemo(() => optionsFor(trigger, state), [trigger, state]);
  const index = Math.max(0, Math.min(insertState(state)?.index ?? 0, options.length - 1));
  usePlaceAt(view, trigger.from, ref);

  useEffect(() => {
    ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, options]);

  const empty = EMPTY[trigger.kind];
  if (!options.length && (empty === null || trigger.query.includes(' '))) return null;
  const divideAt = trigger.kind === 'slash' && trigger.query === '' ? FEATURED_COUNT : -1;

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={LABELS[trigger.kind]}
      className={cn(PLACED, 'max-h-80 overflow-y-auto rounded-[12px] bg-chrome p-1.5 text-[14px] leading-5 text-chrome-fg shadow-chrome-popup', trigger.kind === 'emoji' ? 'w-56' : 'w-64')}
      onMouseDown={event => event.preventDefault()}
    >
      {options.length ? (
        options.map((option, at) => (
          <Fragment key={option.id}>
            {at === divideAt ? <div className="mx-2 my-1 h-px bg-chrome-line" aria-hidden="true" /> : null}
            {option.section && option.section !== options[at - 1]?.section ? (
              <div className="px-2.5 pt-1.5 pb-0.5 text-[12px] font-medium text-chrome-muted">{option.section}</div>
            ) : null}
            <OptionRow option={option} active={at === index} onHover={() => at !== index && setMenuIndex(view, at)} onPick={() => pickOption(view, option, trigger)} />
          </Fragment>
        ))
      ) : (
        <div className="px-2.5 py-1.5 text-chrome-muted" role="option" aria-disabled="true" aria-selected="false">
          {empty}
        </div>
      )}
    </div>
  );
}

function OptionRow({ option, active, onHover, onPick }: { option: MenuOption; active: boolean; onHover: () => void; onPick: () => void }): ReactNode {
  return (
    <div
      role="option"
      aria-selected={active}
      className={cn('flex h-8 cursor-default select-none items-center gap-2 rounded-[8px] px-2.5', active && 'bg-chrome-hover')}
      onMouseMove={onHover}
      onClick={onPick}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-chrome-muted" aria-hidden="true">
        {option.glyph ? <span className="text-[16px] leading-none">{option.glyph}</span> : option.icon ? <ItemIcon icon={option.icon} /> : null}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', option.glyph && 'text-chrome-muted')}>{option.label}</span>
      {option.detail ? <span className="shrink-0 text-[13px] text-chrome-muted">{option.detail}</span> : null}
    </div>
  );
}
