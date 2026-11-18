/** Making and changing the doc's dropdown lists. The server tells other pages; this page keeps its own copy. */
import type { DocEnum, DocEnumOption, DocJsonObject } from '@open-artifact/runtime/doc-api';
import { docClient } from '../app/doc-client.ts';
import { getDocs, setDocs } from '../app/store.ts';
import { type DropdownTemplate, enumNamed } from './dropdown-model.ts';

export interface DropdownValue {
  name: string;
  options: Array<Omit<DocEnumOption, 'order' | 'disabled'> & Partial<Pick<DocEnumOption, 'order' | 'disabled'>>>;
}

const normalised = (id: string, value: DropdownValue): DocEnum => ({
  id,
  name: value.name,
  options: value.options.map((option, index) => ({
    name: option.name,
    order: option.order ?? index,
    disabled: option.disabled === true,
    ...(option.color ? { color: option.color } : {}),
  })),
});

function asJson(list: DocEnum): DocJsonObject {
  return {
    name: list.name,
    options: list.options.map(option => {
      const base = { name: option.name, order: option.order, disabled: option.disabled };
      return option.color ? { ...base, color: option.color } : base;
    }),
  };
}

/** Puts a list in the page's copy of the doc (the server's frame about it goes to the other pages only). */
function remember(item: DocEnum): void {
  const project = getDocs().project;
  if (!project) return;
  const known = project.enums.some(entry => entry.id === item.id);
  const enums = known ? project.enums.map(entry => (entry.id === item.id ? item : entry)) : [...project.enums, item];
  setDocs({ project: { ...project, enums } });
}

/** Makes a list and answers its id. */
export async function createDropdown(value: DropdownValue): Promise<string> {
  const answer = await docClient().call({ member: { verb: 'create', object: 'enum', payload: { value: asJson(normalised('', value)) } } });
  const id = typeof answer.minted === 'string' ? answer.minted : '';
  if (!id) throw new Error('the dropdown was not made');
  remember(normalised(id, value));
  return id;
}

/** Saves a list's name and options whole (one fewer option than before is refused). */
export async function saveDropdown(id: string, value: DropdownValue): Promise<void> {
  const list = normalised(id, value);
  await docClient().call({ member: { verb: 'update', ref: { object: 'enum', id }, payload: { kind: 'value', value: asJson(list) } } });
  remember(list);
}

/** The doc's list named like the template, made from it when there is none. */
export async function dropdownFromTemplate(template: DropdownTemplate): Promise<string> {
  const existing = enumNamed(getDocs().project?.enums ?? [], template.name);
  if (existing) return existing.id;
  return createDropdown({ name: template.name, options: template.options.map(option => ({ ...option })) });
}
