import type { Dynamic } from '../../dynamic.ts';
import { sheetCommandSynonyms, blankSheetWord, sheetWord } from '../../messages/sheet-command-words.ts';
import { shortcutActionLabel } from '../../messages/shortcut-labels.ts';
import { shortcutKeysFor } from '../../keys/shortcut-list.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { versionHistoryMessages } from '../../history/version-text.ts';
import { functionListLabel } from '../../messages/formula-autocomplete.ts';
import { FILE_UPLOAD_ICON } from '../../import/file-sources.ts';
import { importFileChoices } from '../../import/csv-file.ts';
import { shortcutFor } from '../../keys/key-press.ts';
import { copiedSheetNameAffixes } from '../../i18n/sheet-names.ts';
import { toolLabelWithValue } from '../../tools/search-words.ts';
export function sheetSearchCommands(state?: Dynamic, actions?: Dynamic) {
  let { sheetId: sheetId, canBeDeleted: canBeDeleted } = state.sheet;
  let { index: tabIndex, count: tabCount } = state.placeAmongTabs;
  let { onAllSheetsAsked: onAllSheetsAsked } = actions;
  let canEdit = state.viewOnlyBecause === null;
  let moveCommand = (id?: Dynamic, label?: Dynamic, icon?: Dynamic, toIndex?: Dynamic) => ({
    id: id,
    label: sheetCommandLabel(label),
    otherWords: sheetCommandSynonyms('move'),
    icon: icon,
    actsOn: 'file',
    whyNot: null,
    isWeighty: true,
    run: () =>
      actions.dispatch({
        kind: 'sheetMoveChosen',
        sheetId: sheetId,
        toIndex: toIndex,
      }),
  });
  let copyLinkCommand = {
    id: 'sheet.tab.copyLink',
    label: sheetCommandLabel(shortcutActionLabel('copyLinkToSheet')),
    otherWords: sheetCommandSynonyms('copyLink'),
    icon: 'Link',
    keys: shortcutKeysFor('copyLinkToSheet'),
    actsOn: 'sheet',
    whyNot: null,
    run: () =>
      actions.dispatch({
        kind: 'sheetLinkCopyChosen',
        sheetId: sheetId,
      }),
  };
  let allSheetsCommands =
    onAllSheetsAsked === null
      ? []
      : [
          {
            id: 'sheet.allSheets',
            label: sheetMessages.allSheets(),
            otherWords: sheetCommandSynonyms('allSheets'),
            icon: 'ListBullet',
            actsOn: 'opens',
            home: 'sheetTab',
            whyNot: null,
            run: onAllSheetsAsked,
          },
        ];
  if (!canEdit) return [...allSheetsCommands, copyLinkCommand];
  return [
    {
      id: 'sheet.versionHistory',
      label: versionHistoryMessages.title(),
      otherWords: sheetCommandSynonyms('versionHistory'),
      icon: 'History',
      isTicked: state.isVersionHistoryOpen,
      actsOn: 'opens',
      home: 'pane',
      whyNot: null,
      run: actions.onVersionHistoryAsked,
    },
    {
      id: 'sheet.functions',
      label: functionListLabel(),
      otherWords: sheetCommandSynonyms('functions'),
      icon: 'Function',
      actsOn: 'activeCell',
      whyNot: null,
      run: actions.onAllFunctionsAsked,
    },
    ...allSheetsCommands,
    ...importFileChoices.map(
      (input?: Dynamic, options?: Dynamic) => ({
        id: options === 0 ? 'sheet.add.importCsv' : `sheet.add.import${options}`,
        label: addSheetCommandLabel(input.inMenu()),
        otherWords: sheetCommandSynonyms('addFromFile'),
        icon: FILE_UPLOAD_ICON,
        actsOn: 'opens',
        isWeighty: true,
        whyNot: null,
        run: () => actions.onImportChosen([input]),
      }),
    ),
    {
      id: 'sheet.add.blank',
      label: addSheetCommandLabel(blankSheetWord()),
      otherWords: sheetCommandSynonyms('addBlank'),
      icon: 'File',
      keys: shortcutFor('addSheet'),
      actsOn: 'file',
      isWeighty: true,
      whyNot: null,
      run: actions.onBlankChosen,
    },
    {
      id: 'sheet.tab.rename',
      label: sheetCommandLabel(sheetMessages.renameSheet()),
      otherWords: sheetCommandSynonyms('rename'),
      icon: 'Edit',
      actsOn: 'opens',
      home: 'sheetTab',
      whyNot: null,
      run: () =>
        actions.dispatch({
          kind: 'sheetRenameChosen',
          sheetId: sheetId,
        }),
    },
    {
      id: 'sheet.tab.duplicate',
      label: sheetCommandLabel(sheetMessages.duplicateSheet()),
      otherWords: sheetCommandSynonyms('duplicate'),
      icon: 'Copy',
      actsOn: 'file',
      isWeighty: true,
      whyNot: null,
      run: () =>
        actions.dispatch({
          kind: 'sheetDuplicateChosen',
          sheetId: sheetId,
          wordsAroundName: copiedSheetNameAffixes(),
        }),
    },
    copyLinkCommand,
    ...(tabIndex > 0 ? [moveCommand('sheet.tab.moveLeft', sheetMessages.moveSheetLeft(), 'ArrowLeft', tabIndex - 1)] : []),
    ...(tabIndex < tabCount - 1 ? [moveCommand('sheet.tab.moveRight', sheetMessages.moveSheetRight(), 'ArrowRight', tabIndex + 1)] : []),
    ...(canBeDeleted || state.isOnlySheet
      ? [
          {
            id: 'sheet.tab.delete',
            label: sheetCommandLabel(sheetMessages.deleteSheet()),
            otherWords: sheetCommandSynonyms('delete'),
            icon: 'Trash',
            actsOn: 'file',
            whyNot: canBeDeleted ? null : sheetMessages.onlySheet(),
            isWeighty: true,
            run: () =>
              actions.dispatch({
                kind: 'sheetDeleteChosen',
                sheetId: sheetId,
              }),
          },
        ]
      : []),
    ...FILL_COMMANDS.map(
      ({ id: id, does: does, key: key }: Dynamic) => ({
        id: id,
        label: shortcutActionLabel(does),
        otherWords: sheetCommandSynonyms('fill'),
        icon: null,
        keys: shortcutKeysFor(does),
        actsOn: 'cells',
        whyNot: state.whyNoToolForCells,
        isWeighty: true,
        run: () => actions.dispatch(modifierKeyPressedAction(key)),
      }),
    ),
  ];
}
export const modifierKeyPressedAction = (key?: Dynamic) => ({
  kind: 'keyPressed',
  key: key,
  isShiftHeld: false,
  isModifierHeld: true,
  isAltHeld: false,
  isRepeat: false,
});
export const sheetCommandLabel = (label?: Dynamic) => toolLabelWithValue(sheetWord(), label);
export const addSheetCommandLabel = (label?: Dynamic) => toolLabelWithValue(sheetMessages.addSheet(), label);
export const FILL_COMMANDS = [
  {
    id: 'sheet.fillDown',
    does: 'fillDown',
    key: 'd',
  },
  {
    id: 'sheet.fillRight',
    does: 'fillRight',
    key: 'r',
  },
];
