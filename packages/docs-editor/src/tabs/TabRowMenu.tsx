/** A tab's menu in the list: rename, duplicate, add a subtab, copy its link, move it, delete it. */
import { ChromeMenu, ChromeMenuItem, ChromeMenuSeparator, ChromeSubmenu } from '@open-artifact/editor-kit/react';
import { cn } from '@open-artifact/ui';
import { Ellipsis } from 'lucide-react';
import type { ReactNode } from 'react';
import { copyTabLink, createTab, duplicateTab, LAST_TAB_WORDS, stepTab } from './actions.ts';
import { setTabsUi, useTabsUi } from './state.ts';
import { type MoveStep, moveChoices, type TabNode } from './tree.ts';

const MOVE_STEPS: readonly MoveStep[] = ['up', 'down', 'into', 'out'];
const MOVE_WORDS: Record<MoveStep, string> = { up: 'Move up', down: 'Move down', into: 'Move into a tab', out: 'Move out one level' };

export interface TabRowMenuProps {
  tree: readonly TabNode[];
  id: string;
  name: string;
  writable: boolean;
  /** The doc has this one tab only. */
  onlyTab: boolean;
}

export function TabRowMenu({ tree, id, name, writable, onlyTab }: TabRowMenuProps): ReactNode {
  const busy = useTabsUi(state => state.busy);
  const moves = moveChoices(tree, id);
  const trigger = (
    <button
      type="button"
      aria-label={`More actions for ${name}`}
      data-tab-menu=""
      tabIndex={-1}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-[6px] text-chrome-muted outline-none hover:bg-chrome-hover hover:text-chrome-fg focus-visible:outline-2 focus-visible:outline-chrome-focus',
        'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[popup-open]:opacity-100 pointer-coarse:opacity-100',
      )}
      onClick={event => event.stopPropagation()}
    >
      <Ellipsis className="size-4" strokeWidth={1.75} />
    </button>
  );
  return (
    <ChromeMenu trigger={trigger} side="bottom" align="start">
      {writable ? (
        <>
          <ChromeMenuItem disabled={busy} onSelect={() => setTabsUi({ renaming: { id, draft: name } })}>
            Rename
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} onSelect={() => void duplicateTab(id)}>
            Duplicate
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} onSelect={() => void createTab(id)}>
            Add subtab
          </ChromeMenuItem>
        </>
      ) : null}
      <ChromeMenuItem onSelect={() => void copyTabLink(id)}>Copy link</ChromeMenuItem>
      {writable ? (
        <>
          <ChromeSubmenu label="Move" disabled={busy || !MOVE_STEPS.some(step => moves[step])}>
            {MOVE_STEPS.map(step => (
              <ChromeMenuItem key={step} disabled={busy || !moves[step]} onSelect={() => void stepTab(id, step)}>
                {step === 'into' && moves.intoName ? `Move into “${moves.intoName}”` : MOVE_WORDS[step]}
              </ChromeMenuItem>
            ))}
          </ChromeSubmenu>
          <ChromeMenuSeparator />
          <ChromeMenuItem danger disabled={busy || onlyTab} description={onlyTab ? LAST_TAB_WORDS : undefined} onSelect={() => setTabsUi({ deleting: id })}>
            Delete tab
          </ChromeMenuItem>
        </>
      ) : null}
    </ChromeMenu>
  );
}
