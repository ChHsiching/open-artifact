/** What an ask from a line of the text sends the agent. Pure. */
import { fenceUntrusted } from '@open-artifact/runtime';

export const ASK_TITLE = 'Ask Agent';
export const ASK_PLACEHOLDER = 'Ask Agent to write or edit here';

export interface LineAsk {
  tab: string;
  /** The block the person asked from. */
  block: string;
  /** Whether that line is empty: the agent writes there. */
  empty: boolean;
  ask: string;
}

/** The ask without a leading "@agent" the person typed out of habit. */
export const cleanAsk = (ask: string) => ask.replace(/^\s*@(agent)\b[\s,:]*/i, '').trim();

export function lineAskText({ tab, block, empty, ask }: LineAsk): string {
  const where = empty
    ? `The person asked from the empty line block ${block} in tab ${tab} of this doc: write there, replacing that empty paragraph with what they ask for (as many blocks as it needs), and leave the blocks around it as they are.`
    : `The person asked from block ${block} in tab ${tab} of this doc: write right after that block, or edit it, as they ask.`;
  return [where, 'If what they ask is about the rest of the doc, edit the doc as they ask instead.', fenceUntrusted(cleanAsk(ask), { label: 'the ask' })].join('\n\n');
}

export const lineAskContext = ({ tab, block, empty, ask }: LineAsk): Record<string, unknown> => ({ tab, block, empty, ask: cleanAsk(ask) });
