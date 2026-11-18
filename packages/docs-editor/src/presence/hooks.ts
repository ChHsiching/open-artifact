/** The people here, for views. */
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { session } from '../app/session.ts';
import { useAgentPresence } from './agent-presence.ts';
import { type Person, peopleHere, peopleOnTab } from './people.ts';
import { usePresence } from './presence.ts';

function selfWho(): string | null {
  try {
    return session().viewer.id;
  } catch {
    return null;
  }
}

/** Everyone else here: people first, then the agent. */
export function usePeople(): Person[] {
  const peers = usePresence(state => state.peers);
  const agent = useAgentPresence(useShallow(state => ({ available: state.available, busy: state.busy, name: state.name, wrote: state.wrote })));
  return useMemo(() => peopleHere(peers, agent, selfWho()), [peers, agent]);
}

/** The others whose page shows tab `tabId` (and the agent while it writes there), for a dot on the tab. */
export function usePeersOnTab(tabId: string): Person[] {
  const people = usePeople();
  return useMemo(() => peopleOnTab(people, tabId), [people, tabId]);
}
