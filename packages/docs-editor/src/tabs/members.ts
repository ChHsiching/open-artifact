/** The calls the tab list makes on the doc, as members of one call each. */
import { type DiskDoc, committed, docFromDisk, docToJson } from '@open-artifact/docs-core';
import type { DocFile, DocJsonObject, DocMember } from '@open-artifact/runtime/doc-api';
import { type DeletePlan, type PlacementPatch, type TabPlacement, cleanTabName, copyPlacement, displayNames, newTabName, newTabPlacement, placementPatch, tabTree } from './tree.ts';

/** The alias the new tab goes by inside its own call. */
const NEW_TAB = 'tab';

const projectPatch = (patch: readonly PlacementPatch[] | readonly DocJsonObject[]): DocMember => ({
  verb: 'update',
  object: 'project',
  payload: { kind: 'patch', patch: patch as unknown as DocJsonObject[] },
});

/** A new, empty tab named `name` at `placement`: its file, then its entry in the doc's tab list. */
function birth(name: string, placement: TabPlacement): DocMember[] {
  return [
    { verb: 'create', object: 'file', $lid: NEW_TAB, payload: { birthName: name } },
    projectPatch([placementPatch(`$lid:${NEW_TAB}`, { ...placement, name })]),
  ];
}

export interface NewTab {
  name: string;
  members: DocMember[];
}

/** A new tab, last under `parent` (or at the top level), named "Tab <n>". */
export function newTabMembers(files: readonly DocFile[], parent?: string): NewTab {
  const name = newTabName(files, parent);
  return { name, members: birth(name, newTabPlacement(files, parent)) };
}

/** A copy of tab `id` beside it, holding `source` (the tab as the server has it) with no suggestion taken. */
export function duplicateMembers(files: readonly DocFile[], id: string, source: DiskDoc): NewTab | null {
  const placement = copyPlacement(files, id);
  if (!placement) return null;
  const shown = displayNames(tabTree(files)).get(id) ?? 'Untitled';
  const name = cleanTabName(`${shown} (copy)`, 'Untitled (copy)');
  const doc = docToJson(committed(docFromDisk(source))) as DocJsonObject;
  return {
    name,
    members: [
      ...birth(name, placement),
      { verb: 'create', object: 'node', payload: { parent: { object: 'file', id: `$lid:${NEW_TAB}` }, doc } },
    ],
  };
}

export const renameMember = (id: string, name: string): DocMember => projectPatch([{ op: 'set', path: ['tabs', id, 'name'], value: name }]);

export const moveMember = (patch: PlacementPatch): DocMember => projectPatch([patch]);

/** The subtabs handed up first, then each file that goes. */
export function deleteMembers(plan: DeletePlan): DocMember[] {
  return [...(plan.patch.length ? [projectPatch(plan.patch)] : []), ...plan.deleteIds.map((id): DocMember => ({ verb: 'delete', ref: { object: 'file', id } }))];
}

/** The id the new tab got, from the answer to a batch that began with its birth. */
export function mintedTab(answer: Record<string, unknown>): string | null {
  const acks = Array.isArray(answer.acks) ? answer.acks : [];
  const first: unknown = acks[0];
  if (typeof first === 'object' && first !== null && 'minted' in first && typeof first.minted === 'string') return first.minted;
  return null;
}
