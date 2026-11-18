import type { Dynamic } from '../dynamic.ts';
import { stripTextPrefixQuote } from '../model/cell-text.ts';
import { isFormulaCell } from '../model/workbook.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function isOptionText({ options: options }: Dynamic, text?: Dynamic) {
  let candidates = [text, stripTextPrefixQuote(text)].flatMap((candidate?: Dynamic) => [candidate, candidate.trim()]);
  return options.some(({ label: label }: Dynamic) => candidates.some((candidate?: Dynamic) => isSameOptionLabel(label, candidate)));
}
export function dropdownMenuItems(options?: Dynamic, typed?: Dynamic, cellText?: Dynamic, canStartFromSet: Dynamic = false) {
  let filter = cleanTypedLabel(typed ?? '');
  let matchingItems = options.flatMap(
    (option?: Dynamic) =>
      foldLabelCase(option.label).includes(foldLabelCase(filter))
        ? [
            {
              kind: 'option',
              optionId: option.optionId,
              label: option.label,
              color: option.color,
            },
          ]
        : [],
  );
  let labelToAdd = typed === null ? cleanTypedLabel(cellText) : filter;
  let canAdd =
    isValidOptionLabel(labelToAdd) &&
    options.length < MAX_DROPDOWN_OPTIONS &&
    !options.some(({ label: label }: Dynamic) => isSameOptionLabel(label, labelToAdd));
  return [
    ...matchingItems,
    ...(canAdd
      ? [
          {
            kind: 'add',
            label: labelToAdd,
          },
        ]
      : []),
    ...(typed === null && !canAdd && options.length < MAX_DROPDOWN_OPTIONS
      ? [
          {
            kind: 'addOption',
          },
        ]
      : []),
    {
      kind: 'editOptions',
    },
    ...(canStartFromSet && typed === null
      ? [
          {
            kind: 'startFromSet',
          },
        ]
      : []),
  ];
}
export function itemToHighlightForTyped(items?: Dynamic, typed?: Dynamic) {
  let cleaned = cleanTypedLabel(typed);
  let [firstItem] = items;
  if (cleaned === '' || firstItem === undefined || firstItem.kind === 'editOptions') return null;
  return items.find((item?: Dynamic) => item.kind === 'option' && isSameOptionLabel(item.label, cleaned)) ?? firstItem;
}
export const MAX_DROPDOWN_OPTIONS = 100;
export const MAX_OPTION_LABEL_LENGTH = 100;
export const OPTION_LABEL_SHOWN_LENGTH = 40;
export const dropdownAtCell = (reads: WorkbookReads, cellId?: Dynamic) =>
  isFormulaCell(reads, cellId) ? null : reads.dropdownOf(cellId);
export const optionMenuKey = (optionId?: Dynamic) => `option ${optionId}`;
export const menuItemKey = (item?: Dynamic) => (item.kind === 'option' ? optionMenuKey(item.optionId) : item.kind);
export const optionIdOfMenuKey = (key?: Dynamic) => (key?.startsWith('option ') === true ? key.slice(7) : null);
export const foldLabelCase = (label?: Dynamic) =>
  Array.from<Dynamic, Dynamic>(label, (char?: Dynamic) => char.toLowerCase()).join('');
export const isValidOptionLabel = (label?: Dynamic) =>
  label !== '' && Array.from<Dynamic>(label).length <= MAX_OPTION_LABEL_LENGTH && !/\p{Cc}/u.test(label);
export const isSameOptionLabel = (label?: Dynamic, otherLabel?: Dynamic) => foldLabelCase(label) === foldLabelCase(otherLabel);
export const cleanTypedLabel = (text?: Dynamic) => stripTextPrefixQuote(text).trim();
