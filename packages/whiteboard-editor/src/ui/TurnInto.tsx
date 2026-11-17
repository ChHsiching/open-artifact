/**
 * "Turn into": asks the agent to make another kind of artifact from the
 * board (a slide deck from the sticky notes, a design from the wireframes).
 * The board itself stays as it is; the agent creates the new artifact.
 */

import { Presentation, PenTool, Repeat2 } from 'lucide-react';
import { agentResultMessage } from '@open-artifact/editor-kit';
import { toast } from '@open-artifact/ui';
import { sendToAgent, useAgent } from '../services/agent.ts';
import { useBoard } from '../state/board.ts';
import { ChromeButton, ChromeMenu, ChromeMenuItem, ChromeMenuLabel } from './chrome.tsx';

/** What the board can be turned into. */
const TARGETS = [
  { type: 'slides', label: 'Slides', description: 'A deck that walks through the board', icon: <Presentation aria-hidden="true" /> },
  { type: 'design', label: 'Design', description: 'Screens or layouts drawn from the board', icon: <PenTool aria-hidden="true" /> },
] as const;

/** Sends the "turn into" request. */
async function turnInto(target: (typeof TARGETS)[number]): Promise<void> {
  const title = useBoard.getState().board.title || 'Untitled board';
  const result = await sendToAgent({
    title: `Turn into ${target.label}`,
    text: `Make a new ${target.label} artifact from the whiteboard "${title}". Read the board first; keep the board unchanged.`,
    context: { action: 'turn_into', target: target.type, board: title },
  });
  if (result.status === 'failed') toast.add({ title: 'Could not reach the agent', description: result.reason, type: 'error' });
  else if (result.status === 'queued') toast.add(agentResultMessage(result, 'this board', useAgent.getState()));
  else toast.add({ title: `Asked the agent for ${target.label}` });
}

/** The Turn into button and its menu. */
export function TurnIntoButton() {
  return (
    <ChromeMenu
      side="top"
      align="center"
      tip={{ label: 'Turn into…', side: 'top' }}
      trigger={
        <ChromeButton square size="xl" aria-label="Turn into">
          <Repeat2 aria-hidden="true" />
        </ChromeButton>
      }
    >
      <ChromeMenuLabel>Turn this board into</ChromeMenuLabel>
      {TARGETS.map((target) => (
        <ChromeMenuItem key={target.type} icon={target.icon} description={target.description} onSelect={() => void turnInto(target)}>
          {target.label}
        </ChromeMenuItem>
      ))}
    </ChromeMenu>
  );
}
