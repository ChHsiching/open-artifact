/**
 * Where a design-system comment sits. Pure (no stores), the counterpart of
 * the Design editor's `lib/comment-anchors.ts`.
 *
 * A thread's `anchor` (a JSON string the host stores as is) has the shape
 * of the view context's focus:
 *
 * - a token: `{"kind":"token","family":"color","name":"ink"}`
 * - a text style: `{"kind":"style","name":"body"}`
 * - a component: `{"kind":"component","name":"Button"}`
 * - an asset: `{"kind":"asset","name":"Logos/mark.svg"}`
 * - a brand-book section or an asset group's note: `{"kind":"section","name":"README.md"}`
 *   (`assets/<group>` for a group)
 * - a file: `{"kind":"file","name":"components/Button/README.md"}`
 * - the whole system: `{}`
 */

import type { CommentThread } from '@open-artifact/runtime';

/** What a comment can be on. Structurally the view's `Focus`. */
export interface SystemItem {
  kind: 'token' | 'style' | 'component' | 'asset' | 'section' | 'file' | 'cover';
  name: string;
  family?: string;
}

/** Where a thread sits (`null`: the whole system). */
export type SystemAnchor = SystemItem | null;

const KINDS = new Set<SystemItem['kind']>(['token', 'style', 'component', 'asset', 'section', 'file', 'cover']);

/** Serializes an anchor (stable key order, so equal anchors compare equal). */
export function serializeAnchor(anchor: SystemAnchor): string {
  if (!anchor) return '{}';
  return JSON.stringify(anchor.family ? { kind: anchor.kind, family: anchor.family, name: anchor.name } : { kind: anchor.kind, name: anchor.name });
}

/** Reads a stored anchor; anything unreadable is the whole system. */
export function parseAnchor(text: string): SystemAnchor {
  try {
    const value = JSON.parse(text) as Partial<SystemItem> | null;
    if (!value || typeof value !== 'object' || typeof value.name !== 'string' || value.name.length > 512 || !KINDS.has(value.kind as SystemItem['kind'])) return null;
    return { kind: value.kind as SystemItem['kind'], name: value.name, ...(typeof value.family === 'string' && value.family.length <= 64 ? { family: value.family } : {}) };
  } catch {
    return null;
  }
}

const KIND_LABEL: Record<SystemItem['kind'], string> = {
  token: 'Token',
  style: 'Text style',
  component: 'Component',
  asset: 'Asset',
  section: 'Section',
  file: 'File',
  cover: 'Cover',
};

/** A short label: `Color ink`, `Text style body`, `Component Button`. */
export function anchorLabel(anchor: SystemAnchor): string {
  if (!anchor) return 'Whole design system';
  if (anchor.kind === 'token' && anchor.family) return `${anchor.family.charAt(0).toUpperCase()}${anchor.family.slice(1)} ${anchor.name}`;
  if (anchor.kind === 'cover') return 'Cover';
  if (anchor.kind === 'section' && anchor.name.startsWith('assets/')) return `Asset group ${anchor.name.slice(7)}`;
  return `${KIND_LABEL[anchor.kind]} ${anchor.name}`;
}

/** Open (or, with `resolved`, all) threads per serialized anchor. */
export function threadsByAnchor(threads: readonly Pick<CommentThread, 'anchor' | 'status'>[], resolved = false): Map<string, CommentThread[]> {
  const out = new Map<string, CommentThread[]>();
  for (const thread of threads) {
    if (!resolved && thread.status !== 'open') continue;
    const key = serializeAnchor(parseAnchor(thread.anchor));
    out.set(key, [...(out.get(key) ?? []), thread as CommentThread]);
  }
  return out;
}

/** Open (unresolved) thread count. */
export function openCount(threads: readonly Pick<CommentThread, 'status'>[]): number {
  return threads.filter((t) => t.status === 'open').length;
}
