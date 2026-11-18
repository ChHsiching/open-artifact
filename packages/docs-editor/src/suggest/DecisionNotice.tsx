/** The line at the foot of the page after a decision ("Suggestion accepted"), with Undo while it can be taken back. */
import { ChromeButton } from '@open-artifact/editor-kit/react';
import { type ReactNode, useEffect, useState } from 'react';
import { formatChord } from '../selbar/chords.ts';
import { undoLastDecision } from './decide.ts';
import { setSuggest, useSuggest } from './store.ts';

const SHOWN_MS = 8000;

export function DecisionNotice(): ReactNode {
  const notice = useSuggest(state => state.notice);
  const canUndo = useSuggest(state => state.last !== null && !state.busy);
  const busy = useSuggest(state => state.busy);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!notice || busy || held) return undefined;
    const serial = notice.serial;
    const timer = window.setTimeout(() => setSuggest(state => (state.notice?.serial === serial ? { notice: null } : state)), SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [notice, busy, held]);

  if (!notice) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4" data-suggest-notice="">
      <div
        className="pointer-events-auto flex min-h-10 max-w-full items-center gap-3 rounded-[12px] bg-tip py-1.5 pl-4 pr-1.5 text-[13px] leading-5 text-tip-fg shadow-chrome"
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        <span className="min-w-0 truncate">{notice.text}</span>
        {notice.undo && canUndo ? (
          <ChromeButton className="text-tip-fg hover:bg-white/15" title={`Undo (${formatChord('Mod-z')})`} onClick={() => void undoLastDecision()}>
            Undo
          </ChromeButton>
        ) : (
          <span className="w-1.5" />
        )}
      </div>
    </div>
  );
}
