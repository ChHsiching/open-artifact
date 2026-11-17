/**
 * Peers as the top bar draws them. Pure. The colors are the shared ones
 * (`@open-artifact/editor-kit`, presence), so one person has the same color
 * in every editor.
 */

import type { Peer } from '@open-artifact/runtime';
import { AGENT_COLOR, peerColor } from '@open-artifact/editor-kit';

export { AGENT_COLOR, PEER_COLORS, peerColor } from '@open-artifact/editor-kit';

/** What a design-system page publishes about where its viewer is. */
export interface SystemPresence {
  /** The section shown (`colors`, `typography`…). */
  section: string | null;
  /** The focused item's label (`Color ink`). */
  focus: string | null;
}

/** A peer as drawn. */
export interface PeerView {
  id: string;
  name: string;
  kind: 'person' | 'agent';
  color: string;
  /** Read from the peer's `viewContext` (written by its browser; checked and clipped). */
  where: SystemPresence | null;
}

const str = (value: unknown, max = 120): string | null => (typeof value === 'string' && value.length <= max ? value : null);

/** Reads a peer's `viewContext` key (see `services/agent.ts`); anything malformed is dropped. */
export function parseSystemPresence(value: unknown): SystemPresence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const focus = v.focus && typeof v.focus === 'object' ? (v.focus as Record<string, unknown>) : null;
  return { section: str(v.section, 40), focus: focus ? str(focus.name) : null };
}

/** Peers other than this page (people first, then agents), at most one entry per id. */
export function peerViews(peers: readonly Peer[], self: string | null): PeerView[] {
  const seen = new Set<string>();
  return peers
    .filter((p) => p.id !== self && !seen.has(p.id) && Boolean(seen.add(p.id)))
    .map((p) => ({
      id: p.id,
      name: (p.name || (p.kind === 'agent' ? 'Agent' : 'Guest')).slice(0, 60),
      kind: p.kind,
      color: p.kind === 'agent' ? AGENT_COLOR : peerColor(p.id),
      where: parseSystemPresence(p.state?.viewContext),
    }))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'person' ? -1 : 1));
}

/** Initials for an avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[words.length - 1]![0]}`).toUpperCase();
}
