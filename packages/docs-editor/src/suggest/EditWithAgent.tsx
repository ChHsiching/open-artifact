/** Edit with Agent's prompt over the selected words: three ready asks and a field of the person's own, then the agent at work. */
import { ChromeButton, TipButton } from '@open-artifact/editor-kit/react';
import { cn } from '@open-artifact/ui';
import { ArrowUp, LoaderCircle, WandSparkles, X } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import { type FocusEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../editor/format.ts';
import { useLayerPlacement } from '../selbar/use-placement.ts';
import { targetOf } from './plugin.ts';
import { REWRITE_PRESETS, REWRITE_TITLE } from './request.ts';
import { closeEditWithAgent, sendEditWithAgent, stopEditWithAgent } from './rewrite.ts';
import { type Rewrite, useSuggest } from './store.ts';

const ICON = { className: 'size-4', strokeWidth: 1.75 } as const;

export function EditWithAgentPrompt(): ReactNode {
  const rewrite = useSuggest(state => state.rewrite);
  const view = useEditor(state => state.view);
  const tab = useEditor(state => state.tab);
  if (!rewrite || !view || tab !== rewrite.tab) return null;
  return <Prompt view={view} rewrite={rewrite} />;
}

function Prompt({ view, rewrite }: { view: EditorView; rewrite: Rewrite }): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const state = useEditor(hold => hold.state);
  const [ask, setAsk] = useState('');
  const mapped = state ? targetOf(state) : null;
  const from = mapped?.from ?? rewrite.from;
  const to = mapped?.to ?? rewrite.to;
  const range = useMemo(() => ({ from, to }), [from, to]);
  const placement = useLayerPlacement(view, range, root, `${state?.doc.content.size ?? 0}:${rewrite.phase}`);
  const asking = rewrite.phase === 'prompt';

  useEffect(() => {
    if (asking) field.current?.focus();
    else root.current?.focus();
  }, [asking]);

  const send = (text: string) => void sendEditWithAgent(text);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (asking) closeEditWithAgent(true);
      else stopEditWithAgent();
    }
  };

  // A press elsewhere closes the prompt; once sent, the words stay marked until the agent answers.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!asking) return;
    const next = event.relatedTarget;
    if (next instanceof Node && root.current?.contains(next)) return;
    if (next instanceof Element && next.closest('[data-base-ui-portal], [role="tooltip"]')) return;
    closeEditWithAgent();
  };

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={REWRITE_TITLE}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onMouseDown={event => {
        if (!(event.target as Element).closest('input')) event.preventDefault();
      }}
      className={cn(
        'pointer-events-auto absolute z-40 flex w-[min(360px,calc(100%-1rem))] flex-col gap-2 rounded-[12px] bg-chrome p-2 text-chrome-fg shadow-chrome outline-none',
        !placement && 'invisible',
      )}
      style={placement ? { left: placement.left, top: placement.top } : { left: 0, top: 0 }}
    >
      {asking ? (
        <>
          <form
            className="flex items-center gap-1.5 rounded-[8px] bg-chrome-hover pl-2"
            onSubmit={event => {
              event.preventDefault();
              send(ask);
            }}
          >
            <WandSparkles aria-hidden="true" className="size-4 shrink-0 text-chrome-muted" strokeWidth={1.75} />
            <input
              ref={field}
              value={ask}
              onChange={event => setAsk(event.target.value)}
              placeholder="Tell Agent what to change"
              aria-label="Ask Agent to edit the selected text"
              className="h-8 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-chrome-muted"
            />
            <TipButton square tip="Send" aria-label="Send" type="submit" disabled={!ask.trim()}>
              <ArrowUp {...ICON} />
            </TipButton>
          </form>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Suggested edits">
            {REWRITE_PRESETS.map(preset => (
              <ChromeButton key={preset.key} className="h-7 rounded-full border border-chrome-line px-2.5 text-[13px]" onClick={() => send(preset.label)}>
                {preset.label}
              </ChromeButton>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 pl-1" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-chrome-accent" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 text-[13px] leading-5">
            {rewrite.phase === 'sending' ? 'Sending to Agent…' : 'Agent is editing the selected text. Press Escape to stop.'}
          </span>
          <TipButton square tip="Stop" aria-label="Stop" onClick={stopEditWithAgent}>
            <X {...ICON} />
          </TipButton>
        </div>
      )}
    </div>
  );
}
