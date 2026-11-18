import { create } from 'zustand';
import type { Peer } from '@open-artifact/runtime';
import { maybeSession } from '../services/session.ts';

interface PeopleState {
  peers: readonly Peer[];
}

/** The people present on the artifact, for naming who made a draft or a version. */
export const usePeople = create<PeopleState>()(() => ({ peers: [] }));

let users = 0;
let stopPeers: () => void = () => {};

/** Follows the room's peers while anything needs names; returns a stop function. */
export function followPeople(): () => void {
  users += 1;
  if (users === 1) {
    const room = maybeSession()?.room ?? null;
    if (room !== null) {
      void room.peers().then(
        (peers) => usePeople.setState({ peers }),
        () => {},
      );
      stopPeers = room.onPeers((peers) => usePeople.setState({ peers }));
    }
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    users -= 1;
    if (users === 0) {
      stopPeers();
      stopPeers = () => {};
    }
  };
}

/** The name of the person `id`, or "" when no one present goes by it. */
export function nameOfPerson(id: string, peers: readonly Peer[] = usePeople.getState().peers): string {
  if (id === '') return '';
  const viewer = maybeSession()?.viewer;
  if (viewer !== undefined && viewer.id === id) return viewer.name;
  const peer = peers.find((item) => item.kind === 'person' && (item.id === id || item.state['viewer'] === id));
  return peer?.name ?? '';
}

/** {@link nameOfPerson} for a component. */
export function usePersonName(id: string): string {
  const peers = usePeople((state) => state.peers);
  return nameOfPerson(id, peers);
}
