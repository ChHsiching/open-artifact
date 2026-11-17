/**
 * Who else has this design system open, over the `room` capability (the
 * page's own `viewContext` key is published by `services/agent.ts`). Same
 * store shape as the Design editor's `services/presence.ts`
 * (`available`, `peers`).
 */

import { create } from 'zustand';
import { peerViews, type PeerView } from '../lib/peers.ts';
import { session } from './session.ts';

interface PresenceState {
  available: boolean;
  peers: PeerView[];
}

export const usePresence = create<PresenceState>()(() => ({ available: false, peers: [] }));

/** Starts following the peer list; returns a function that stops it. */
export async function startCollabPresence(): Promise<() => void> {
  const room = session().room;
  if (!room) return () => undefined;
  usePresence.setState({ available: true });
  const self = await room.self().catch(() => null);
  const heard = (peers: Parameters<typeof peerViews>[0]): void => usePresence.setState({ peers: peerViews(peers, self) });
  room.peers().then(heard, () => undefined);
  return room.onPeers(heard);
}
