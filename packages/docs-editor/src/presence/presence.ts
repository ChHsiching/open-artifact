/**
 * This page's presence in the doc's room: it publishes its person, tab, selection and color claim under `docs`, and
 * keeps the other pages' as they publish theirs.
 */
import {
  createPeerColorKeeper,
  createPresence,
  keptPeerColor,
  normalizePeerColor,
  PEER_COLOR_TIMERS,
  type PeerColorClaim,
  type PeerColorKeeper,
  type PeerView,
  type PublishedPeerColor,
} from '@open-artifact/editor-kit';
import type { Peer } from '@open-artifact/runtime';
import { create } from 'zustand';
import { docClient } from '../app/doc-client.ts';
import { session } from '../app/session.ts';
import { getDocs, useDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import { publishViewContext } from './view-context.ts';
import { startAgentPresence } from './agent-presence.ts';
import { type DocsPresence, PRESENCE_KEY, type PeerSelection, parseDocsPresence, selectionPlaces } from './places.ts';

/** Least time between two sends of this page's place, ms. */
const SEND_MS = 100;

const COLOR_STORAGE_KEY = 'open-artifact.docs.peer-color';

export type DocsPeer = PeerView<DocsPresence>;

/** This page as it shows itself among the others. */
export interface SelfState {
  name: string;
  color: string;
}

export const useSelf = create<SelfState>(() => ({ name: '', color: '' }));

let viewerId: string | null = null;
let colorClaim: PublishedPeerColor | null = null;
let colorChanged: (() => void) | null = null;
let rawPeers: readonly Peer[] = [];
let selfPeer: string | null = null;

/** The last place this page published on its tab: kept while the editor can't name one (it lost focus, it is composing). */
let last: { tab: string | null; sel: PeerSelection | null; node: string | null } = { tab: null, sel: null, node: null };

function ownPlace(): { tab: string | null; sel: PeerSelection | null; node: string | null } {
  const tab = getDocs().activeTab;
  if (last.tab !== tab) last = { tab, sel: null, node: null };
  const editor = useEditor.getState();
  const view = editor.view;
  if (!tab || !view || editor.tab !== tab || view.composing) return last;
  if (!editor.focused && last.sel === null && last.node === null) return last;
  const open = docClient().openTabOf(tab);
  // The ids name the text only while the view shows exactly the tab's shadow.
  if (!open || open.binding.doc !== view.state.doc) return last;
  const places = selectionPlaces(view.state.doc, open.binding.shadow, view.state.selection);
  if (places.sel || places.node) last = { tab, ...places };
  return last;
}

function colorClaims(): PeerColorClaim[] {
  const claims: PeerColorClaim[] = [];
  for (const peer of rawPeers) {
    if (peer.id === selfPeer || peer.kind !== 'person') continue;
    const raw = peer.state?.[PRESENCE_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const value = parseDocsPresence(raw as Record<string, unknown>);
    const c = normalizePeerColor(value.color?.c);
    if (!c || typeof value.color?.t !== 'number') continue;
    const key = value.who ?? peer.id;
    claims.push({ key, peer: peer.id, own: key === viewerId, c, t: value.color.t });
  }
  return claims;
}

export const docsPresence = createPresence<DocsPresence>({
  key: PRESENCE_KEY,
  snapshot: () => ({ who: viewerId, ...ownPlace(), color: colorClaim }),
  parse: parseDocsPresence,
  watch(changed) {
    colorChanged = changed;
    const stopEditor = useEditor.subscribe((state, before) => {
      if (state.state !== before.state || state.tab !== before.tab || state.focused !== before.focused) changed();
    });
    const stopDocs = useDocs.subscribe((state, before) => {
      if (state.activeTab !== before.activeTab) changed();
    });
    return () => {
      colorChanged = null;
      stopEditor();
      stopDocs();
    };
  },
  sendMs: SEND_MS,
  onPeers(peers, self) {
    rawPeers = peers;
    selfPeer = self;
    keeper?.heard();
  },
});

export const usePresence = docsPresence.store;

let keeper: PeerColorKeeper | null = null;

/** Starts publishing and listening, once the doc is open; returns a function that stops. */
export async function startPresence(): Promise<() => void> {
  const current = session();
  viewerId = current.viewer.id;
  const name = getDocs().me?.name || current.viewer.name || 'You';
  const made = createPeerColorKeeper(
    {
      id: current.viewer.id,
      peer: current.peerId,
      publish(claim) {
        colorClaim = claim;
        colorChanged?.();
      },
      claims: colorClaims,
      kept: keptPeerColor(COLOR_STORAGE_KEY),
      ...PEER_COLOR_TIMERS,
    },
    () => useSelf.setState({ color: made.worn() }),
  );
  keeper = made;
  useSelf.setState({ name, color: made.worn() });
  const onVisibility = () => (document.visibilityState === 'hidden' ? made.away() : made.here());
  if (document.visibilityState !== 'hidden') made.here();
  document.addEventListener('visibilitychange', onVisibility);
  const stopName = useDocs.subscribe(state => {
    const next = state.me?.name;
    if (next && next !== useSelf.getState().name) useSelf.setState({ name: next });
  });
  const stopAgent = startAgentPresence(current.doc, current.agent);
  const stopContext = current.room ? publishViewContext(current.room) : () => {};
  const stopRoom = await docsPresence.start({ room: current.room });
  return () => {
    stopContext();
    stopRoom();
    stopAgent();
    stopName();
    document.removeEventListener('visibilitychange', onVisibility);
    made.dispose();
    keeper = null;
  };
}
