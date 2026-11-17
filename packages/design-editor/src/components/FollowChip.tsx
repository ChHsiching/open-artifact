/**
 * The chip over the canvas while the agent works: "Following the agent" with
 * Stop while the camera follows its new work, or "{n} new" with the side the
 * unseen work lies on, a button that goes there, and Hide. A polite live
 * region says the same for screen readers.
 */

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, X } from 'lucide-react';
import { useAgent } from '../services/agent.ts';
import { dismissAgentWork, showAgentWork, stopFollowingAgent, useFollow } from '../services/follow.ts';
import type { FollowState, Heading } from '../lib/follow.ts';
import { Card, ChromeButton, ChromeDivider, Tip } from '@open-artifact/editor-kit/react';

const ARROWS: Record<Heading, typeof ArrowUp> = { n: ArrowUp, e: ArrowRight, s: ArrowDown, w: ArrowLeft };
const WHERE: Record<Heading, string> = { n: 'above', e: 'to the right', s: 'below', w: 'to the left' };

/** "artboard" / "artboards", "note" / "notes". */
const noun = (state: FollowState) => `${state.of === 'artboards' ? 'artboard' : 'note'}${state.unseen === 1 ? '' : 's'}`;

/** What a screen reader hears for a state. */
export function followAnnouncement(state: FollowState): string {
  const parts: string[] = [];
  if (state.following) parts.push('Following the agent. Press Escape to stop.');
  if (state.unseen > 0) parts.push(`${state.unseen} new ${noun(state)} ${WHERE[state.heading]}, out of view.`);
  return parts.join(' ');
}

export function FollowChip() {
  const state = useFollow();
  const name = useAgent((s) => (s.status.available ? s.status.name : 'the agent'));
  const Arrow = ARROWS[state.heading];
  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {followAnnouncement(state).replace(/the agent/g, name)}
      </div>
      {state.following || state.unseen > 0 ? (
        <Card data-follow-chip="" className="p-1 text-[13px]">
          {state.following ? (
            <>
              <span className="flex items-center gap-1.5 pl-2 pr-1">
                <Eye className="size-3.5 shrink-0" aria-hidden />
                Following {name}
              </span>
              <Tip label={`Stop following ${name}. Touching the canvas stops it too.`} shortcut="esc">
                <ChromeButton onClick={() => stopFollowingAgent()}>Stop</ChromeButton>
              </Tip>
            </>
          ) : (
            <>
              <span className="pl-2 pr-1 text-chrome-muted">New while {name} works</span>
              <Tip label={`Go to the ${state.unseen} new ${noun(state)} ${WHERE[state.heading]}, and follow ${name} for the rest of this request`}>
                <ChromeButton onClick={showAgentWork} aria-label={`Show ${state.unseen} new ${noun(state)} ${WHERE[state.heading]}`}>
                  <Arrow className="size-3.5" aria-hidden />
                  {state.unseen} new
                </ChromeButton>
              </Tip>
              <ChromeDivider />
              <Tip label="Hide this. The view stays where it is.">
                <ChromeButton square aria-label="Hide" onClick={dismissAgentWork}>
                  <X className="size-3.5" aria-hidden />
                </ChromeButton>
              </Tip>
            </>
          )}
        </Card>
      ) : null}
    </>
  );
}
