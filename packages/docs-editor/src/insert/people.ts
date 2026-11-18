/** The people `@` can name: whoever is viewing, and the others with the doc open. */
import type { Peer } from '@open-artifact/runtime';
import { maybeSession } from '../app/session.ts';
import type { Person } from './mentions.ts';

let peers: readonly Peer[] = [];
let listening = false;

function listen(): void {
  const room = maybeSession()?.room;
  if (listening || !room) return;
  listening = true;
  room.onPeers(next => (peers = next));
  room.peers().then(
    next => (peers = next),
    () => undefined,
  );
}

const userOf = (peer: Peer): string => {
  const user = peer.state.userId ?? peer.state.user;
  return typeof user === 'string' && user ? user : peer.id;
};

/** The viewer first, then the other people in the room (by name, once each). */
export function knownPeople(): Person[] {
  listen();
  const session = maybeSession();
  const out: Person[] = [];
  const names = new Set<string>();
  const add = (person: Person) => {
    const key = person.name.trim().toLowerCase();
    if (!key || names.has(key)) return;
    names.add(key);
    out.push(person);
  };
  if (session) add({ id: session.viewer.id, name: session.viewer.name });
  for (const peer of peers) if (peer.kind === 'person' && peer.id !== session?.peerId) add({ id: userOf(peer), name: peer.name });
  return out;
}
