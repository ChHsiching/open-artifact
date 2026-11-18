/** The agent as the page shows it among the people here: whether it can be asked, and where it wrote last. */
import { AGENT_SHOWN_MS } from '@open-artifact/editor-kit';
import type { AgentCapability, DocCapability } from '@open-artifact/runtime';
import { create } from 'zustand';

export interface AgentWrite {
  tab: string;
  /** The blocks the write changed. */
  blocks: string[];
  at: number;
}

export interface AgentPresenceState {
  /** The page can reach an agent. */
  available: boolean;
  /** The agent is changing the doc now. */
  busy: boolean;
  name: string;
  /** Its last write, while it is fresh (or the agent is still at work). */
  wrote: AgentWrite | null;
}

export const useAgentPresence = create<AgentPresenceState>(() => ({ available: false, busy: false, name: 'Agent', wrote: null }));

/** Listens to the agent's status and to its writes; returns a function that stops. */
export function startAgentPresence(doc: DocCapability, agent: AgentCapability | null): () => void {
  const stops: Array<() => void> = [];
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const expire = () => {
    clearTimeout(expiry);
    expiry = setTimeout(() => {
      if (useAgentPresence.getState().busy) expire();
      else useAgentPresence.setState({ wrote: null });
    }, AGENT_SHOWN_MS);
  };
  stops.push(() => clearTimeout(expiry));

  if (agent) {
    const heard = (status: { available: boolean; busy: boolean; name: string }) =>
      useAgentPresence.setState({ available: status.available, busy: status.busy, name: status.name || 'Agent' });
    agent.status().then(heard, () => undefined);
    stops.push(agent.onStatus(heard));
  }

  stops.push(
    doc.onFrame(frame => {
      if (frame.kind !== 'tab' || frame.by !== 'agent') return;
      const before = useAgentPresence.getState().wrote;
      const blocks = frame.blocks?.length ? frame.blocks.slice(0, 200) : before?.tab === frame.tab ? before.blocks : [];
      useAgentPresence.setState({ wrote: { tab: frame.tab, blocks, at: Date.now() } });
      expire();
    }),
  );
  return () => stops.forEach(stop => stop());
}
