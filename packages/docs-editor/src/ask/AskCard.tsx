/** The ask card under a line: a prompt for the agent, then "Agent is writing…" until it has. */
import { ChromeButton } from '@open-artifact/editor-kit/react';
import { ArrowUp, LoaderCircle, Sparkles, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useEditor } from '../editor/format.ts';
import { closeAsk, sendAsk, stopAsk } from './actions.ts';
import { ASK_PLACEHOLDER } from './request.ts';
import { useAsk } from './store.ts';

interface Seat {
  left: number;
  top: number;
  width: number;
}

/** Under the block, against `.doc-page`. */
function seatOf(block: string): Seat | null {
  const view = useEditor.getState().view;
  if (!view) return null;
  let pos = -1;
  view.state.doc.forEach((node, offset) => {
    if (node.attrs.bid === block) pos = offset;
  });
  if (pos < 0) return null;
  const dom = view.nodeDOM(pos);
  const page = view.dom.closest('.doc-page');
  if (!(dom instanceof HTMLElement) || !page) return null;
  const pageBox = page.getBoundingClientRect();
  const box = dom.getBoundingClientRect();
  const text = view.dom.getBoundingClientRect();
  return { left: text.left - pageBox.left, top: box.bottom - pageBox.top + 6, width: Math.min(text.width, 560) };
}

export function AskCard(): ReactNode {
  const open = useAsk(state => state.open);
  const tab = useEditor(state => state.tab);
  useEditor(state => state.state);
  const [ask, setAskText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  // Measured as drawn: the editor's state (subscribed above) redraws the card when the text moves.
  const seat = open ? seatOf(open.block) : null;
  useEffect(() => {
    if (open?.phase === 'prompt') {
      setAskText('');
      requestAnimationFrame(() => field.current?.focus());
    }
  }, [open?.block, open?.phase === 'prompt']);

  if (!open || open.tab !== tab || !seat) return null;
  const working = open.phase !== 'prompt';

  return (
    <div
      className="absolute z-20 flex items-center gap-2 rounded-[10px] border border-chrome-line bg-chrome px-2.5 py-1.5 text-chrome-fg shadow-chrome-popup"
      style={{ left: seat.left, top: seat.top, width: seat.width }}
      data-testid="ask-card"
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (working) stopAsk();
          else closeAsk();
        }
      }}
    >
      {working ? <LoaderCircle className="size-4 flex-none animate-spin text-chrome-accent" aria-hidden /> : <Sparkles className="size-4 flex-none text-chrome-accent" aria-hidden />}
      {working ? (
        <span className="flex-1 text-[13px] text-chrome-muted" role="status">
          {open.phase === 'sending' ? 'Sending to Agent…' : 'Agent is writing…'}
        </span>
      ) : (
        <input
          ref={field}
          value={ask}
          onChange={event => setAskText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void sendAsk(ask);
            }
          }}
          placeholder={ASK_PLACEHOLDER}
          aria-label={ASK_PLACEHOLDER}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-chrome-muted"
        />
      )}
      {working ? (
        <ChromeButton className="h-6 px-2 text-[12px] text-chrome-muted" onClick={stopAsk}>
          Stop
        </ChromeButton>
      ) : (
        <>
          <ChromeButton square aria-label="Close" className="h-6 w-6 text-chrome-muted" onClick={() => closeAsk()}>
            <X className="size-3.5" />
          </ChromeButton>
          <ChromeButton
            square
            aria-label="Send to Agent"
            disabled={!ask.trim()}
            onMouseDown={event => event.preventDefault()}
            onClick={() => void sendAsk(ask)}
            className="h-6 w-6 rounded-full bg-chrome-accent text-white hover:bg-chrome-accent hover:brightness-110"
          >
            <ArrowUp className="size-3.5" strokeWidth={2.25} />
          </ChromeButton>
        </>
      )}
    </div>
  );
}
