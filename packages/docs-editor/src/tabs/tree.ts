/**
 * The doc's tabs as a tree, and where a tab goes when it is made, copied, moved or deleted: each answer is the patch of
 * the doc's tab entries (`['tabs', id]`) the page sends.
 */
import type { DocFile } from '@open-artifact/runtime/doc-api';
import { keyAfterAll, keyAmong } from './order-key.ts';

export interface TabNode {
  id: string;
  file: DocFile;
  children: TabNode[];
}

/** A tab's place: the tab it sits under (undefined: the top level) and its sort key there. */
export interface TabPlacement {
  name?: string;
  order: string;
  subtabOf?: string;
}

export interface PlacementPatch {
  op: 'set';
  path: ['tabs', string];
  value: { name?: string; order: string; subtabOf?: string };
}

/** Where a moved tab lands: under `parent`, just before `beforeId` (undefined: last). */
export interface TabMove {
  parent: string | undefined;
  beforeId: string | undefined;
}

export type MoveStep = 'up' | 'down' | 'into' | 'out';
export type DropZone = 'before' | 'into' | 'after';

/** A key the server takes for a tab: letters and digits, not ending in 0. */
const SENDABLE_KEY = /^[0-9A-Za-z]{0,127}[1-9A-Za-z]$/;

const byOrder = (a: DocFile, b: DocFile) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The tab a file sits under, when that tab is there (a tab under itself or a missing tab is top-level). */
export function parentOf(files: readonly DocFile[], id: string): string | undefined {
  const file = files.find(item => item.id === id);
  const parent = file?.subtabOf;
  return parent && parent !== id && files.some(item => item.id === parent) ? parent : undefined;
}

/** The tabs as a tree, siblings in their sort order. A tab whose parents loop back to it is shown at the top level. */
export function tabTree(files: readonly DocFile[]): TabNode[] {
  const children = new Map<string | undefined, DocFile[]>();
  for (const file of files) {
    const parent = parentOf(files, file.id);
    const list = children.get(parent) ?? [];
    list.push(file);
    children.set(parent, list);
  }
  const seen = new Set<string>();
  const build = (parent: string | undefined): TabNode[] =>
    [...(children.get(parent) ?? [])].sort(byOrder).flatMap(file => {
      if (seen.has(file.id)) return [];
      seen.add(file.id);
      return [{ id: file.id, file, children: build(file.id) }];
    });
  const roots = build(undefined);
  for (const file of [...files].sort(byOrder)) if (!seen.has(file.id)) roots.push({ id: file.id, file, children: build(file.id) });
  return roots;
}

export interface FlatTab {
  node: TabNode;
  depth: number;
  parentId: string | undefined;
}

export function flatten(nodes: readonly TabNode[], depth = 0, parentId?: string): FlatTab[] {
  return nodes.flatMap(node => [{ node, depth, parentId }, ...flatten(node.children, depth + 1, node.id)]);
}

export function findNode(nodes: readonly TabNode[], id: string): TabNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/** A tab and every tab under it. */
export function subtreeIds(node: TabNode): string[] {
  return [node.id, ...node.children.flatMap(subtreeIds)];
}

const isUntitled = (name: string | undefined) => {
  const trimmed = (name ?? '').trim();
  return trimmed === '' || trimmed === 'Untitled';
};

/** What each tab is called in the list: its name, or "Tab <n>" (its place in the list) while it has none. */
export function displayNames(nodes: readonly TabNode[]): Map<string, string> {
  const names = new Map<string, string>();
  let index = 0;
  for (const { node } of flatten(nodes)) {
    index += 1;
    names.set(node.id, isUntitled(node.file.name) ? `Tab ${index}` : node.file.name);
  }
  return names;
}

const NUMBERED = /^Tab ([1-9][0-9]*)$/;

/** The name of a new tab: "Tab <n>", one past the highest such name (or the tab count, when some tab is unnamed). */
export function newTabName(files: readonly DocFile[], parent?: string): string {
  let highest = 0;
  let unnamed = false;
  for (const file of files) {
    const match = NUMBERED.exec((file.name ?? '').trim());
    if (match && Number(match[1]) > highest) highest = Number(match[1]);
    if (isUntitled(file.name)) unnamed = true;
  }
  // A subtab of the last tab in the list is shown last; anywhere else it takes a place before the end.
  const placedLast = parent === undefined || isLastInList(tabTree(files), parent);
  const count = files.length + (parent !== undefined && !placedLast ? 1 : 0);
  if (unnamed && count > highest) highest = count;
  return `Tab ${highest + 1}`;
}

function isLastInList(nodes: readonly TabNode[], id: string): boolean {
  for (let node = nodes.at(-1); node; node = node.children.at(-1)) if (node.id === id) return true;
  return false;
}

/** The sort keys of the tabs under `parent`, in order. */
function siblingsOf(nodes: readonly TabNode[], parent: string | undefined): TabNode[] {
  if (parent === undefined) return [...nodes];
  return findNode(nodes, parent)?.children ?? [];
}

/** A new tab's place: last under `parent` (or at the top level). */
export function newTabPlacement(files: readonly DocFile[], parent?: string): TabPlacement {
  const siblings = siblingsOf(tabTree(files), parent);
  return { order: keyAfterAll(siblings.map(node => node.file.order)), ...(parent ? { subtabOf: parent } : {}) };
}

/** A copy's place: right after the tab it copies, beside it. */
export function copyPlacement(files: readonly DocFile[], id: string): TabPlacement | null {
  const tree = tabTree(files);
  if (!findNode(tree, id)) return null;
  const parent = parentOf(files, id);
  const siblings = siblingsOf(tree, parent);
  const index = siblings.findIndex(node => node.id === id);
  const order = keyAmong(
    siblings.map(node => node.file.order),
    index,
    index + 1,
  );
  return { order, ...(parent ? { subtabOf: parent } : {}) };
}

/** A tab's name as a file name: no slashes or control characters, one space between words, at most 120 characters. */
export function cleanTabName(name: string, fallback = 'Untitled'): string {
  const words = name
    .replace(/[/\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(words).slice(0, 120).join('').trim();
  return cut || fallback;
}

/** Which moves a tab's menu offers. */
export function moveChoices(nodes: readonly TabNode[], id: string): Record<MoveStep, boolean> & { intoName?: string } {
  const place = siblingPlace(nodes, id);
  if (!place) return { up: false, down: false, into: false, out: false };
  const above = place.siblings[place.index - 1];
  return {
    up: place.index > 0,
    down: place.index < place.siblings.length - 1,
    into: above !== undefined,
    out: place.parentId !== undefined,
    ...(above ? { intoName: displayNames(nodes).get(above.id) } : {}),
  };
}

interface SiblingPlace {
  siblings: readonly TabNode[];
  index: number;
  parentId: string | undefined;
}

function siblingPlace(nodes: readonly TabNode[], id: string, parentId?: string): SiblingPlace | undefined {
  const index = nodes.findIndex(node => node.id === id);
  if (index >= 0) return { siblings: nodes, index, parentId };
  for (const node of nodes) {
    const found = siblingPlace(node.children, id, node.id);
    if (found) return found;
  }
  return undefined;
}

/** Where a step from the tab's menu (or its keys) takes it. */
export function stepMove(nodes: readonly TabNode[], id: string, step: MoveStep): TabMove | undefined {
  const place = siblingPlace(nodes, id);
  if (!place) return undefined;
  const { siblings, index, parentId } = place;
  if (step === 'up') return index > 0 ? { parent: parentId, beforeId: siblings[index - 1]!.id } : undefined;
  if (step === 'down') return index < siblings.length - 1 ? { parent: parentId, beforeId: siblings[index + 2]?.id } : undefined;
  if (step === 'into') return index > 0 ? { parent: siblings[index - 1]!.id, beforeId: undefined } : undefined;
  if (parentId === undefined) return undefined;
  const outer = siblingPlace(nodes, parentId);
  return outer ? { parent: outer.parentId, beforeId: outer.siblings[outer.index + 1]?.id } : undefined;
}

/** Where a tab dropped on `targetId` lands: before it, after it (first under it when it has subtabs), or inside it. */
export function dropMove(nodes: readonly TabNode[], targetId: string, zone: DropZone): TabMove | undefined {
  const flat = flatten(nodes);
  const target = flat.find(item => item.node.id === targetId);
  if (!target) return undefined;
  if (zone === 'into') return { parent: targetId, beforeId: undefined };
  if (zone === 'before') return { parent: target.parentId, beforeId: targetId };
  if (target.node.children.length > 0) return { parent: targetId, beforeId: target.node.children[0]!.id };
  const siblings = siblingsOf(nodes, target.parentId);
  const index = siblings.findIndex(node => node.id === targetId);
  return { parent: target.parentId, beforeId: siblings[index + 1]?.id };
}

/** Whether a tab may go to `move`: never under itself or under a tab it holds. */
export function canMove(nodes: readonly TabNode[], id: string, move: TabMove): boolean {
  const node = findNode(nodes, id);
  if (!node) return false;
  if (move.parent !== undefined && subtreeIds(node).includes(move.parent)) return false;
  return move.beforeId !== id;
}

/** The patch that puts tab `id` at `move`, or null when it is there already (or may not go there). */
export function movePatch(files: readonly DocFile[], id: string, move: TabMove): PlacementPatch | null {
  const nodes = tabTree(files);
  if (!canMove(nodes, id, move)) return null;
  const siblings = siblingsOf(nodes, move.parent).filter(node => node.id !== id);
  const index = move.beforeId === undefined ? siblings.length : siblings.findIndex(node => node.id === move.beforeId);
  if (index < 0) return null;
  const current = siblingPlace(nodes, id);
  if (current && current.parentId === move.parent && current.index === index) return null;
  const order = keyAmong(
    siblings.map(node => node.file.order),
    index - 1,
    index,
  );
  return placementPatch(id, { order, ...(move.parent ? { subtabOf: move.parent } : {}) });
}

export function placementPatch(id: string, placement: TabPlacement): PlacementPatch {
  const value: PlacementPatch['value'] = { order: placement.order };
  if (placement.name) value.name = placement.name;
  if (placement.subtabOf) value.subtabOf = placement.subtabOf;
  return { op: 'set', path: ['tabs', id], value };
}

/** What deleting a tab takes: the tabs whose files go, and the subtabs it hands up a level when they are kept. */
export interface DeletePlan {
  patch: PlacementPatch[];
  deleteIds: string[];
}

/**
 * Deleting tab `id`: with `keepSubtabs`, its subtabs move up to where it sat (keeping their sort keys) and only it goes;
 * without, it goes with every tab under it.
 */
export function deletePlan(files: readonly DocFile[], id: string, keepSubtabs: boolean): DeletePlan {
  const nodes = tabTree(files);
  const node = findNode(nodes, id);
  if (!node) return { patch: [], deleteIds: [] };
  if (!keepSubtabs) return { patch: [], deleteIds: subtreeIds(node) };
  const parent = parentOf(files, id);
  const keys = siblingsOf(nodes, parent).map(sibling => sibling.file.order);
  const patch = node.children.map(child => {
    const order = SENDABLE_KEY.test(child.file.order) ? child.file.order : keyAfterAll(keys);
    keys.push(order);
    return placementPatch(child.id, { order, ...(parent ? { subtabOf: parent } : {}) });
  });
  return { patch, deleteIds: [id] };
}

/** Whether the doc would be left with no tab. */
export const leavesNoTab = (files: readonly DocFile[], plan: DeletePlan) => files.length > 0 && files.every(file => plan.deleteIds.includes(file.id));

/** Where a tab sits among its siblings, for what a screen reader is told after a move. */
export function positionOf(nodes: readonly TabNode[], id: string): { parentId: string | undefined; pos: number; size: number } | undefined {
  const place = siblingPlace(nodes, id);
  return place ? { parentId: place.parentId, pos: place.index + 1, size: place.siblings.length } : undefined;
}
