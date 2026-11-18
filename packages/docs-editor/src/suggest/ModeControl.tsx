/** The page bar's mode menu: Editing or Suggesting, and every open suggestion accepted or rejected at once. */
import { ChromeButton, ChromeMenu, ChromeMenuItem, ChromeMenuSeparator } from '@open-artifact/editor-kit/react';
import { Check, ChevronDown, Pencil, PenLine, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDocs } from '../app/store.ts';
import { decideAll } from './decide.ts';
import { MODE_WORDS, setSuggesting, useSuggestMode } from './mode.ts';
import { useOpenSuggestions } from './model.ts';
import { useSuggest } from './store.ts';

const icon = 'size-4';

export function SuggestModeControl(): ReactNode {
  const writable = useDocs(state => state.writable);
  const ready = useDocs(state => state.phase.kind === 'ready');
  const suggesting = useSuggestMode(state => state.suggesting);
  const count = useOpenSuggestions(state => state.cards.length);
  const busy = useSuggest(state => state.busy);
  // Someone who can't edit has nothing to switch: a commenter's page writes no suggestions.
  if (!writable || !ready) return null;
  const label = suggesting ? MODE_WORDS.suggesting : MODE_WORDS.editing;
  const Icon = suggesting ? PenLine : Pencil;
  const trigger = (
    <ChromeButton aria-label={`${label}, ${MODE_WORDS.what}`} pressed={suggesting} className="gap-1 px-2 data-[popup-open]:bg-chrome-hover">
      <Icon className={icon} strokeWidth={1.75} />
      <span>{label}</span>
      <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
    </ChromeButton>
  );
  return (
    <ChromeMenu trigger={trigger} tip={{ label: `${MODE_WORDS.tip}: ${label}` }} align="end">
      <div role="group" aria-label={MODE_WORDS.tip}>
        <ChromeMenuItem
          checked={!suggesting}
          icon={<Pencil className={icon} strokeWidth={1.75} />}
          description={MODE_WORDS.editingHint}
          onSelect={() => setSuggesting(false)}
        >
          {MODE_WORDS.editing}
        </ChromeMenuItem>
        <ChromeMenuItem
          checked={suggesting}
          icon={<PenLine className={icon} strokeWidth={1.75} />}
          description={MODE_WORDS.suggestingHint}
          onSelect={() => setSuggesting(true)}
        >
          {MODE_WORDS.suggesting}
        </ChromeMenuItem>
      </div>
      {count > 0 ? (
        <>
          <ChromeMenuSeparator />
          <ChromeMenuItem icon={<Check className={icon} strokeWidth={1.75} />} disabled={busy} onSelect={() => void decideAll('accept')}>
            {`Accept all ${count}`}
          </ChromeMenuItem>
          <ChromeMenuItem icon={<X className={icon} strokeWidth={1.75} />} disabled={busy} onSelect={() => void decideAll('reject')}>
            {`Reject all ${count}`}
          </ChromeMenuItem>
        </>
      ) : null}
    </ChromeMenu>
  );
}
