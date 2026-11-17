/** The home page's pure logic: ordering, what can be created, owner badges. No DOM. */

import type { ArtifactView, TypeView } from '@open-artifact/protocol';
import type { BadgeState } from '../components/OwnerBadge.tsx';

/** Types the home page can create artifacts of, in this first batch. */
export const CREATABLE_TYPES: readonly string[] = ['design'];

/** When an artifact's content last changed, for ordering. */
export function contentTime(a: Pick<ArtifactView, 'contentAt' | 'updatedAt' | 'createdAt'>): number {
  return Date.parse(a.contentAt || a.updatedAt || a.createdAt || '') || 0;
}

/** Pinned first, then the most recently changed. */
export function sortArtifacts(list: readonly ArtifactView[]): ArtifactView[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || contentTime(b) - contentTime(a));
}

/** A type runs here and is not overridden by another of the same id. */
export function isUsable(type: TypeView): boolean {
  return type.enabled && type.runnable && !type.shadowedBy;
}

/** The home page offers "New" for this type. */
export function isCreatable(type: TypeView): boolean {
  return isUsable(type) && CREATABLE_TYPES.includes(type.id);
}

/** The type "New artifact" creates, or `null` when none is installed and usable. */
export function defaultCreatable(types: readonly TypeView[]): TypeView | null {
  return types.find(isCreatable) ?? null;
}

/** The badge state of an artifact's owner session. */
export function ownerBadge(owner: ArtifactView['owner']): BadgeState {
  if (!owner) return 'none';
  if (!owner.live) return 'offline';
  return owner.status === 'running' ? 'working' : 'idle';
}

/** Replaces one artifact in a list (after rename or pin), keeping the order. */
export function replaceArtifact(list: readonly ArtifactView[], next: ArtifactView): ArtifactView[] {
  return list.map((a) => (a.id === next.id ? next : a));
}

/** Removes one artifact from a list. */
export function withoutArtifact(list: readonly ArtifactView[], id: string): ArtifactView[] {
  return list.filter((a) => a.id !== id);
}
