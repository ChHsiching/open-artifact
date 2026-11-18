import type { Dynamic } from '../dynamic.ts';
import { foldLabelCase, MAX_DROPDOWN_OPTIONS, isSameOptionLabel, MAX_OPTION_LABEL_LENGTH } from './dropdown-options.ts';
import { colorForAddedOption, isDropdownDeliberatelyUncolored } from './dropdown-colors.ts';
import { dropdownEditorOfPane } from '../state/queries.ts';
import { commitDropdownOptions } from './dropdown-editor.ts';
import { sanitizeCellText } from '../model/cell-text.ts';
import { colorsEqual } from '../model/colors.ts';
import { parseTsvCells } from '../clipboard/formats.ts';
import { unescapeClipboardText } from '../clipboard/text-escaping.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
export function pasteOptionLabels(options?: Dynamic, atIndex?: Dynamic, pastedLabels?: Dynamic, firstColor?: Dynamic) {
  let [replaced, others] = [options[atIndex], options.filter((option?: Dynamic, index?: Dynamic) => index !== atIndex)];
  let takenLabels = new (Set as Dynamic)(others.map((option?: Dynamic) => foldLabelCase(option.label)));
  let added: Dynamic = [];
  let [skipped, isFull]: Dynamic = [0, false];
  for (let [labelIndex, pastedLabel] of pastedLabels.entries() as Dynamic) {
    if (added.length >= MAX_DROPDOWN_OPTIONS - others.length) {
      [skipped, isFull] = [skipped + pastedLabels.length - labelIndex, true];
      break;
    }
    let label = cleanOptionLabel(pastedLabel).trim();
    let isNew = label !== '' && !takenLabels.has(foldLabelCase(label));
    if (!isNew) skipped += 1;
    if (labelIndex === 0 && replaced !== undefined)
      added.push(
        isNew
          ? {
              ...replaced,
              label: label,
            }
          : replaced,
      );
    else if (isNew) {
      let color = (added.length === 0 ? firstColor : null) ?? colorForAddedOption(label, [...others, ...added]);
      added.push({
        optionId: null,
        label: label,
        color: color,
      });
    }
    takenLabels.add(foldLabelCase(added.at(-1)?.label ?? ''));
  }
  return {
    pasted: [...options.slice(0, atIndex), ...added, ...options.slice(atIndex + 1)],
    count: added.length - (replaced === undefined ? 0 : 1),
    skipped: skipped,
    isFull: isFull,
  };
}
export function optionsWithTyped(editor?: Dynamic) {
  let [options, { typed: typed }] = [editorOptionsOf(editor), editor];
  if (typed === null) return [...options];
  if (typed.optionId !== null)
    return options.map(
      (option?: Dynamic) =>
        option.optionId === typed.optionId
          ? {
              ...option,
              label: typed.label,
            }
          : option,
    );
  let color = typed.pickedColor ?? colorForAddedOption(typed.label, options);
  return [
    ...options,
    {
      optionId: null,
      label: typed.label,
      color: color,
    },
  ];
}
export function everyOptionColorOffer(editor?: Dynamic) {
  let options = optionsWithTyped(editor);
  if (options.some(({ color: color }: Dynamic) => color.kind !== 'none')) return 'none';
  return isDropdownDeliberatelyUncolored(options) ? 'automatic' : null;
}
export function isTypedOptionLabelUnsaved(state: PageState) {
  let editor = dropdownEditorOfPane(state);
  let typed = editor?.typed ?? null;
  if (editor === null || typed === null) return false;
  let saved = editor.options.find(({ optionId: optionId }: Dynamic) => optionId === typed.optionId);
  return typed.label.trim() !== (saved?.label ?? '');
}
export function hasUnsavedSidePaneTyping(state: PageState) {
  switch (state.sidePane?.kind) {
    case 'dropdown':
      return hasUnsavedDropdownTyping(state);
    case 'conditionalFormats':
      return (state.sidePane.rules.editor?.typed ?? null) !== null;
    case 'sort':
      return state.sidePane.sort.cellsTyped !== undefined && state.sidePane.sort.areCellsTypedRefused !== true;
    case 'versionHistory':
    case undefined:
      return false;
  }
}
export function changedCellsTyped(editor?: Dynamic) {
  let typedCells = editor.cellsTyped?.trim() ?? '';
  let ownRange = editor.stretches[editor.indexOfOwnStretch]?.range;
  return typedCells === '' || typedCells.toUpperCase() === ownRange ? null : typedCells;
}
export function hasUnsavedDropdownEdits(state: PageState) {
  let editor = dropdownEditorOfPane(state);
  return isTypedOptionLabelUnsaved(state) || (editor !== null && changedCellsTyped(editor) !== null);
}
export function optionsAfterTypedLabel(editor?: Dynamic) {
  let { typed: typed } = editor;
  if (typed === null) return null;
  let label = typed.label.trim();
  let saved = editorOptionsOf(editor).find((option?: Dynamic) => option.optionId === typed.optionId);
  if (label === '' || label === saved?.label || optionWithTypedLabel(editor) !== null) return null;
  return optionsWithTyped({
    ...editor,
    typed: {
      ...typed,
      label: label,
    },
  });
}
export function commitTypedOption(state: PageState, reads: WorkbookReads, editor?: Dynamic) {
  let options = optionsAfterTypedLabel(editor);
  if (options === null) return null;
  let { effects: effects } = commitDropdownOptions(state, reads, editor, options, 'entered');
  return effects.some((effect?: Dynamic) => effect.kind === 'queueEdit' && (effect.ifQueued.undoOffer ?? null) !== null)
    ? null
    : {
        named: options,
        effects: effects,
      };
}
export function optionWithTypedLabel(editor?: Dynamic) {
  let [options, { typed: typed }] = [editorOptionsOf(editor), editor];
  if (typed === null) return null;
  let label = typed.label.trim();
  let isOtherOption = (option?: Dynamic) => option.optionId !== typed.optionId;
  return options.find((option?: Dynamic) => isOtherOption(option) && isSameOptionLabel(option.label, label)) ?? null;
}
export const DROPDOWN_SCROLL_SLOP = 8;
export const isFormulaText = (text?: Dynamic) => text.startsWith('=');
export const EMPTY_TYPED_OPTION = {
  optionId: null,
  label: '',
  pickedColor: null,
};
export const cleanOptionLabel = (text?: Dynamic) =>
  Array.from<Dynamic>(sanitizeCellText(text.replace(/\p{Cc}/gu, ' ')))
    .slice(0, MAX_OPTION_LABEL_LENGTH)
    .join('');
export const isOptionColorSameAs = (color?: Dynamic, other?: Dynamic) =>
  colorsEqual(color, other) || (color.kind === 'standard' && other.kind === 'standard' && color.hue === other.hue && color.shade === 100);
export const isOptionSetSameAs = (options?: Dynamic, set?: Dynamic) =>
  set.options.length === options.length &&
  set.options.every(({ label: label, color: color }: Dynamic, index?: Dynamic) => {
    let option = options[index];
    return option !== undefined && option.label === label && isOptionColorSameAs(option.color, color);
  });
export const readySetKeyOf = ({ readySets: readySets }: Dynamic, options?: Dynamic) =>
  readySets?.find(({ set: set }: Dynamic) => isOptionSetSameAs(options, set))?.set.key ?? null;
export const optionsFromReadySet = (options?: Dynamic, set?: Dynamic) =>
  set.options.map(
    (setOption?: Dynamic) => ({
      optionId: options.find(({ label: label }: Dynamic) => isSameOptionLabel(label, setOption.label))?.optionId ?? null,
      ...setOption,
    }),
  );
export const chosenOptionSetKey = (editor: Dynamic, { isCustom: isCustom, options: options }: Dynamic) =>
  (isCustom ? null : readySetKeyOf(editor, options)) ?? 'custom';
export const QUOTED_FORMULA_PREFIX_PATTERN = /^'(?=\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/;
export const labelsOfPastedText = (text?: Dynamic, dropsQuotedFormulaMark: Dynamic = false) =>
  parseTsvCells(text)
    .flat()
    .map(
      (label?: Dynamic) => (dropsQuotedFormulaMark ? unescapeClipboardText(label).replace(QUOTED_FORMULA_PREFIX_PATTERN, '') : label).trim(),
    )
    .filter((label?: Dynamic) => label !== '');
export const editorOptionsOf = ({ options: options, isCustom: isCustom }: Dynamic) => (isCustom ? [] : options);
export const hasUnsavedDropdownTyping = (state: PageState) =>
  isTypedOptionLabelUnsaved(state) || dropdownEditorOfPane(state)?.cellsTyped !== undefined;
