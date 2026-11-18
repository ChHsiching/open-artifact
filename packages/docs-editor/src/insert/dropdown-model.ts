/**
 * Dropdown lists as the chip menus edit them. A dropdown chip names its option by position, so options keep their
 * places: order is a separate number, a retired option stays with `disabled: true`, and new ones go at the end.
 */
import type { DocEnum, DocEnumOption } from '@open-artifact/runtime/doc-api';

export const DROPDOWN_COLORS = ['gray', 'sky', 'mineral', 'olive', 'pencil', 'poppy', 'fig', 'plum'] as const;

export type DropdownColor = (typeof DROPDOWN_COLORS)[number];

/** How each colour is drawn (the same as the chips in the text). */
export const COLOR_VALUES: Record<DropdownColor, string> = {
  gray: '#6b7280',
  sky: '#0284c7',
  mineral: '#0f766e',
  olive: '#4d7c0f',
  pencil: '#b45309',
  poppy: '#dc2626',
  fig: '#be185d',
  plum: '#7c3aed',
};

export const isDropdownColor = (value: unknown): value is DropdownColor => typeof value === 'string' && (DROPDOWN_COLORS as readonly string[]).includes(value);

/** The colour a new option at this position gets: the palette without gray, in turn. */
export const defaultColor = (index: number): DropdownColor => DROPDOWN_COLORS[1 + (index % (DROPDOWN_COLORS.length - 1))]!;

/** The colour an option is drawn in: its own, else the one its position gives. */
export const colorOf = (option: { color?: string | null } | undefined, index: number): DropdownColor =>
  isDropdownColor(option?.color) ? option.color : defaultColor(index);

export interface TemplateOption {
  name: string;
  color: DropdownColor;
}

export interface DropdownTemplate {
  name: string;
  options: readonly TemplateOption[];
}

export const DROPDOWN_TEMPLATES: readonly DropdownTemplate[] = [
  {
    name: 'Status',
    options: [
      { name: 'Not started', color: 'gray' },
      { name: 'In progress', color: 'pencil' },
      { name: 'Done', color: 'olive' },
    ],
  },
  {
    name: 'Priority',
    options: [
      { name: 'Low', color: 'sky' },
      { name: 'Medium', color: 'pencil' },
      { name: 'High', color: 'poppy' },
    ],
  },
];

const fold = (text: string) => text.trim().toLowerCase();

export const templateNamed = (name: string): DropdownTemplate | null => DROPDOWN_TEMPLATES.find(template => fold(template.name) === fold(name)) ?? null;

/** The doc's list with this name, if it has one. */
export const enumNamed = (enums: readonly DocEnum[], name: string): DocEnum | null => enums.find(item => fold(item.name) === fold(name)) ?? null;

/** The templates the doc has no list of the same name for. */
export const unusedTemplates = (enums: readonly DocEnum[]): DropdownTemplate[] => DROPDOWN_TEMPLATES.filter(template => !enumNamed(enums, template.name));

/** A list's options in the order shown, each with its position (what a chip stores). */
export function shownOptions(options: readonly DocEnumOption[]): Array<{ option: DocEnumOption; index: number }> {
  return options.map((option, index) => ({ option, index })).toSorted((a, b) => a.option.order - b.option.order || a.index - b.index);
}

/** The options a chip's menu lists: enabled ones (and the chip's own, even retired), matching the filter. */
export function pickableOptions(options: readonly DocEnumOption[], current: number | null, filter: string): Array<{ option: DocEnumOption; index: number }> {
  const wanted = fold(filter);
  return shownOptions(options).filter(({ option, index }) => (!option.disabled || index === current) && (!wanted || option.name.toLowerCase().includes(wanted)));
}

export const nextOrder = (options: readonly DocEnumOption[]): number => options.reduce((max, option) => Math.max(max, option.order), -1) + 1;

/** What the filter text does when it is entered: pick the option of that name, add it, or nothing (it is retired). */
export function resolveTyped(options: readonly DocEnumOption[], typed: string): { kind: 'pick'; index: number } | { kind: 'add'; name: string } | { kind: 'none' } {
  const name = typed.trim().slice(0, 120);
  if (!name) return { kind: 'none' };
  const same = options.map((option, index) => ({ option, index })).filter(({ option }) => fold(option.name) === fold(name));
  const enabled = same.find(({ option }) => !option.disabled);
  if (enabled) return { kind: 'pick', index: enabled.index };
  if (same.length) return { kind: 'none' };
  return { kind: 'add', name };
}

/** The list with one more option at the end (the position a chip then names). */
export function withOption(list: DocEnum, name: string): { name: string; options: DocEnumOption[]; index: number } {
  const index = list.options.length;
  return {
    name: list.name,
    options: [...list.options, { name, order: nextOrder(list.options), disabled: false, color: defaultColor(index) }],
    index,
  };
}

/** One row of the option editor. */
export interface DraftOption {
  name: string;
  order: number;
  disabled: boolean;
  color: DropdownColor;
  /** Already in the list: it can be retired, not removed. */
  saved: boolean;
}

export interface Draft {
  name: string;
  options: DraftOption[];
}

export function draftOf(list: DocEnum): Draft {
  return {
    name: list.name,
    options: list.options.map((option, index) => ({ name: option.name, order: option.order, disabled: option.disabled, color: colorOf(option, index), saved: true })),
  };
}

export const emptyDraft = (): Draft => ({ name: '', options: [{ name: '', order: 0, disabled: false, color: defaultColor(0), saved: false }] });

export function addDraftOption(draft: Draft): Draft {
  const order = draft.options.reduce((max, option) => Math.max(max, option.order), -1) + 1;
  return { ...draft, options: [...draft.options, { name: '', order, disabled: false, color: defaultColor(draft.options.length), saved: false }] };
}

/** Moves the option at `index` (a position) to `to` in the shown order; every option's order is renumbered. */
export function moveDraftOption(draft: Draft, index: number, to: number): Draft {
  const shown = draft.options.map((option, position) => ({ option, position })).toSorted((a, b) => a.option.order - b.option.order || a.position - b.position);
  const from = shown.findIndex(entry => entry.position === index);
  if (from < 0) return draft;
  const target = Math.max(0, Math.min(shown.length - 1, to));
  const [moved] = shown.splice(from, 1);
  shown.splice(target, 0, moved!);
  const orders = new Map(shown.map((entry, order) => [entry.position, order]));
  return { ...draft, options: draft.options.map((option, position) => ({ ...option, order: orders.get(position)! })) };
}

/** Where an option sits in the shown order. */
export const shownPlace = (draft: Draft, index: number): number =>
  draft.options
    .map((option, position) => ({ option, position }))
    .toSorted((a, b) => a.option.order - b.option.order || a.position - b.position)
    .findIndex(entry => entry.position === index);

/**
 * The list a finished draft saves: saved options keep their places (an emptied name keeps the old one), new ones
 * without a name are dropped.
 */
export function finishDraft(draft: Draft, before: DocEnum | null): { name: string; options: DocEnumOption[] } {
  const options: DocEnumOption[] = [];
  draft.options.forEach((option, index) => {
    const name = option.name.trim().slice(0, 120);
    if (option.saved) options.push({ name: name || before?.options[index]?.name || `Option ${index + 1}`, order: option.order, disabled: option.disabled, color: option.color });
    else if (name) options.push({ name, order: option.order, disabled: false, color: option.color });
  });
  return { name: draft.name.trim().slice(0, 120) || before?.name || '', options };
}
