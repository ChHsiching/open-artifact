/** The people (and the agent) here, as the avatars, tab dots and carets draw them. */
import { AGENT_COLOR, peerColorFor, type PeerView } from '@open-artifact/editor-kit';
import type { AgentPresenceState } from './agent-presence.ts';
import type { DocsPresence } from './places.ts';

/** Id of the agent's entry when it is not in the room itself. */
export const AGENT_ENTRY = 'agent';

export interface Person {
  /** The page's peer id (the first page of a person with several), or {@link AGENT_ENTRY}. */
  id: string;
  name: string;
  kind: 'person' | 'agent';
  color: string;
  /** The tab they show (the agent: the one it wrote last). */
  tab: string | null;
  /** The agent: writing now or moments ago; else idle. A person is always active. */
  active: boolean;
}

export const colorOf = (peer: PeerView<DocsPresence>): string => (peer.kind === 'agent' ? AGENT_COLOR : peerColorFor(peer.state?.color?.c, peer.id));

/**
 * The others here: people one entry each however many pages they have open (this person's other pages left out),
 * then the agent, as a peer of the room or as the page's agent while it can be reached or has just written.
 */
export function peopleHere(peers: readonly PeerView<DocsPresence>[], agent: AgentPresenceState, selfWho: string | null): Person[] {
  const people: Person[] = [];
  const seen = new Set<string>();
  let agentPeer: PeerView<DocsPresence> | null = null;
  for (const peer of peers) {
    if (peer.kind === 'agent') {
      agentPeer ??= peer;
      continue;
    }
    const who = peer.state?.who ?? peer.id;
    if ((selfWho !== null && who === selfWho) || seen.has(who)) continue;
    seen.add(who);
    people.push({ id: peer.id, name: peer.name, kind: 'person', color: colorOf(peer), tab: peer.state?.tab ?? null, active: true });
  }
  const active = agent.busy || agent.wrote !== null;
  if (agentPeer) {
    people.push({ id: agentPeer.id, name: agentPeer.name, kind: 'agent', color: AGENT_COLOR, tab: agent.wrote?.tab ?? agentPeer.state?.tab ?? null, active: true });
  } else if (agent.available || active) {
    people.push({ id: AGENT_ENTRY, name: agent.name, kind: 'agent', color: AGENT_COLOR, tab: agent.wrote?.tab ?? null, active });
  }
  return people;
}

/** The others on one tab (the agent while it is writing there). */
export const peopleOnTab = (people: readonly Person[], tab: string): Person[] => people.filter(person => person.tab === tab && person.active);
