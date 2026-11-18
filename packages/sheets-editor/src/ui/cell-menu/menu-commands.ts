import type { Dynamic } from '../../dynamic.ts';
import { oneRangeActOfCommand } from '../../selection/several-ranges.ts';
import { commandSearchSynonyms } from '../../messages/command-search.ts';
import { oneRangeNeededText, pasteFromMenuHint, pasteValuesFromMenuHint } from '../../i18n/notice-labels.ts';
import {
  sortTableUnclearHint,
  ascendingLabel,
  descendingLabel,
  freezeRowsLabel,
  freezeColumnsLabel,
  insertRowsAboveLabel,
  insertRowsBelowLabel,
  insertColumnsLeftLabel,
  insertColumnsRightLabel,
  moveRowsUpLabel,
  moveRowsDownLabel,
  moveColumnsLeftLabel,
  moveColumnsRightLabel,
  deleteRowsLabel,
  deleteColumnsLabel,
  resizeRowsLabel,
  resizeColumnsLabel,
  sortMenuLabel,
  sortRangeLabel,
  sortSheetLabel,
  rowsFromFirstLabel,
  columnsFromFirstLabel,
} from '../../i18n/grid-action-labels.ts';
import { toolLabelWithValue } from '../../tools/search-words.ts';
import { customSortMessages, sortAndFilterMessages } from '../../tables/sort-filter-labels.ts';
import { sheetMessages, textStyleLabel } from '../../i18n/sheet-messages.ts';
import { shortcutKeysFor } from '../../keys/shortcut-list.ts';
import { expandGroupsLabel, collapseGroupsLabel, groupLinesLabel, ungroupLinesLabel } from '../../messages/line-groups.ts';
import { shortcutFor } from '../../keys/key-press.ts';
import { linkEditMessages } from '../../links/link-hover-card.ts';
import { OPEN_LINK_SHORTCUT } from '../../links/cell-links-view.ts';
import { suggestedFreezeChoice } from '../../grid/freeze.ts';
import { filterMessages, showOnlyValueLabel, leaveOutValueLabel } from '../../tables/filter-messages.ts';
import { FONT_MARKS } from '../../editor/text-looks.ts';
import { formatToggleShortcut } from '../toolbar/text-menus.ts';
import { CONDITIONAL_FORMATTING_WORDS } from '../../messages/conditional-format.ts';
import { cellHistoryMessages } from '../../history/cell-history-popover.ts';
export function cellMenuCommands(props?: Dynamic) {
  let { selectionIsOf: selectionIsOf, selectedRowCount: selectedRowCount, selectedColumnCount: selectedColumnCount } = props;
  let {
    isOneRangeNeeded: isOneRangeNeeded,
    heldToPaste: heldToPaste,
    keyThatPastes: keyThatPastes,
    formatOfSelection: formatOfSelection,
  } = props;
  let changeCommand = (change?: Dynamic, label?: Dynamic, { whyNot = null, actsOn = 'cells', ...rest }: Dynamic = {}) => {
    let oneRangeAct = isOneRangeNeeded ? oneRangeActOfCommand(change) : null;
    let otherWordsKey = OTHER_WORDS_KEYS_OF_CHANGES[change];
    return {
      id: `menu.${change}`,
      label: label,
      ...(otherWordsKey !== undefined && {
        otherWords: commandSearchSynonyms(otherWordsKey),
      }),
      icon: props.iconOfChange(change),
      actsOn: actsOn,
      whyNot: oneRangeAct === null ? whyNot : oneRangeNeededText(oneRangeAct),
      ...rest,
      run: () => props.onChangeChosen(change),
    };
  };
  let sortCommands = (scope?: Dynamic, heading?: Dynamic, needsTable: Dynamic = false) => {
    let shared = {
      isWeighty: true,
      actsOn: scope === 'sheet' ? 'sheet' : 'cells',
      ...(needsTable &&
        !props.canSortTableAtCell && {
          whyNot: sortTableUnclearHint(),
        }),
    };
    return [
      changeCommand(SORT_CHANGES[scope].ascending, toolLabelWithValue(heading, ascendingLabel()), shared),
      changeCommand(SORT_CHANGES[scope].descending, toolLabelWithValue(heading, descendingLabel()), shared),
    ];
  };
  let customSortCommand = (scope?: Dynamic, heading?: Dynamic) => ({
    id: `menu.customSort.${scope}`,
    label: heading === null ? customSortMessages.customSort() : toolLabelWithValue(heading, customSortMessages.customSort()),
    otherWords: commandSearchSynonyms('customSort'),
    icon: 'Sort',
    actsOn: 'opens',
    home: 'pane',
    whyNot: isOneRangeNeeded && scope === 'range' ? oneRangeNeededText(oneRangeActOfCommand(SORT_CHANGES.range.ascending) ?? 'sortCells') : null,
    run: () => props.onSortPaneAsked(scope),
  });
  let freezeCommand = (lines: Dynamic, { count: count, isRoom: isRoom }: Dynamic, labelled?: Dynamic) => ({
    id: `menu.freeze.${lines}.${count}`,
    ...labelled,
    otherWords: commandSearchSynonyms(FREEZE_OTHER_WORDS_KEYS[lines][count === 0 ? 'none' : 'some']),
    actsOn: 'sheet',
    whyNot: isRoom ? null : lines === 'rows' ? sheetMessages.tooManyRowsToFreeze() : sheetMessages.tooManyColumnsToFreeze(),
    run: () => props.onFreezeChosen(lines, count),
  });
  let groupCommand = (change?: Dynamic, label?: Dynamic, shortcutName?: Dynamic) =>
    changeCommand(change, label, {
      keys: shortcutKeysFor(shortcutName),
      isWeighty: true,
    });
  let groupCommandsOf = ({
    of: lines,
    canUngroup: canUngroup,
    collapseCount: collapseCount,
    expandCount: expandCount,
  }: Dynamic) => {
    let { group: groupChange, ungroup: ungroupChange, collapse: collapseChange, expand: expandChange } = GROUP_CHANGES[lines];
    return [
      ...(expandCount > 0 ? [groupCommand(expandChange, expandGroupsLabel(expandCount), 'expandGroup')] : []),
      ...(collapseCount > 0 ? [groupCommand(collapseChange, collapseGroupsLabel(collapseCount), 'collapseGroup')] : []),
      groupCommand(groupChange, groupLinesLabel(lines, lines === 'rows' ? selectedRowCount : selectedColumnCount), 'group'),
      ...(canUngroup ? [groupCommand(ungroupChange, ungroupLinesLabel(lines), 'ungroup')] : []),
    ];
  };
  let isSelectionOf = (input?: Dynamic) => selectionIsOf === input;
  let shortcutUnlessCells = (input?: Dynamic) =>
    isSelectionOf('cells')
      ? {}
      : {
          keys: shortcutFor(input),
        };
  let canActOnRows = isSelectionOf('cells') || isSelectionOf('rows');
  let canActOnColumns = isSelectionOf('cells') || isSelectionOf('columns');
  let { linkUrl: linkUrl, linkInWordsUrl: linkInWordsUrl } = props;
  let isLinkEdit = isSelectionOf('cells') && props.linkByHandOffered === 'edit';
  let linkByHandCommand = {
    id: 'menu.linkByHand',
    label: isLinkEdit ? sheetMessages.editLink() : linkEditMessages.insertLink(),
    otherWords: commandSearchSynonyms('linkByHand'),
    icon: isLinkEdit ? 'Edit' : 'Link',
    ...(props.doesKeyOpenLinkForm && {
      keys: shortcutKeysFor('addLink'),
    }),
    actsOn: 'opens',
    whyNot: props.linkByHandOffered === 'notOnFormula' ? linkEditMessages.whyNoLinkByHand() : null,
    run: props.onLinkFormAsked,
  };
  let ownFilter = props.ownFilterOffers?.filter;
  let valueOfCellToFilter = props.ownFilterOffers?.valueOfCell ?? null;
  let { formatAsTableOffer: formatAsTableOffer } = props;
  let formatAsTableCommands =
    formatAsTableOffer === null
      ? []
      : [
          {
            id: 'menu.formatAsTable',
            label: sheetMessages.formatAsTable(),
            otherWords: commandSearchSynonyms('formatAsTable'),
            icon: 'Table',
            isTicked: formatAsTableOffer.isOn,
            ...(formatAsTableOffer.isForEveryone
              ? {
                  actsOn: 'sheet',
                  isWeighty: true,
                }
              : {
                  actsOn: 'view',
                }),
            whyNot: null,
            run: () => props.onFormatAsTableChosen(!formatAsTableOffer.isOn),
          },
        ];
  return [
    ...(props.isCommentOffered
      ? [
          {
            id: 'menu.comment',
            label: sheetMessages.comment(),
            otherWords: commandSearchSynonyms('comment'),
            icon: 'Comment',
            keys: 'alt+cmd+m',
            actsOn: 'handsOver',
            whyNot: null,
            run: props.onCommentChosen,
          },
        ]
      : []),
    ...(linkUrl === null
      ? []
      : [
          {
            id: 'menu.openLink',
            label: sheetMessages.openLink(),
            otherWords: commandSearchSynonyms('openLink'),
            icon: 'ArrowOutSquare',
            keys: OPEN_LINK_SHORTCUT,
            actsOn: 'opens',
            whyNot: null,
            isWeighty: true,
            run: () => props.onLinkOpened(linkUrl),
          },
        ]),
    ...(linkInWordsUrl === null
      ? []
      : [
          {
            id: 'menu.copyLinkAddress',
            label: sheetMessages.copyLinkAddress(),
            otherWords: commandSearchSynonyms('copyLinkAddress'),
            icon: 'Copy',
            actsOn: 'cells',
            whyNot: null,
            run: () => props.onLinkCopied(linkInWordsUrl),
          },
        ]),
    ...(isLinkEdit ? [linkByHandCommand] : []),
    {
      id: 'menu.cut',
      label: sheetMessages.cut(),
      otherWords: commandSearchSynonyms('cut'),
      icon: 'Scissors',
      keys: 'cmd+x',
      actsOn: 'cells',
      whyNot: isOneRangeNeeded ? oneRangeNeededText('cut') : null,
      run: () => props.onCopyOrCutChosen('cut'),
    },
    {
      id: 'menu.copy',
      label: sheetMessages.copy(),
      otherWords: commandSearchSynonyms('copy'),
      icon: 'Copy',
      keys: 'cmd+c',
      actsOn: 'cells',
      whyNot: null,
      run: () => props.onCopyOrCutChosen('copy'),
    },
    {
      id: 'menu.paste',
      label: sheetMessages.paste(),
      otherWords: commandSearchSynonyms('paste'),
      icon: 'Clipboard',
      keys: 'cmd+v',
      actsOn: 'cells',
      whyNot: heldToPaste === null ? pasteFromMenuHint(keyThatPastes) : null,
      isWeighty: true,
      run: () => props.onPasteChosen('all'),
    },
    {
      id: 'menu.pasteValuesOnly',
      label: sheetMessages.pasteValuesOnly(),
      otherWords: commandSearchSynonyms('pasteValuesOnly'),
      icon: 'PasteValues',
      keys: 'shift+cmd+v',
      actsOn: 'cells',
      whyNot: heldToPaste === 'copiedCells' ? null : pasteValuesFromMenuHint(heldToPaste, keyThatPastes),
      isWeighty: true,
      run: () => props.onPasteChosen('valuesOnly'),
    },
    ...['rows', 'columns'].flatMap((input?: Dynamic) => {
      let value = isSelectionOf(input) ? suggestedFreezeChoice(props.freezeChoices?.[input] ?? []) : null;
      if (value === null) return [];
      let value2 = (input === 'rows' ? freezeRowsLabel : freezeColumnsLabel)(value.count);
      return [
        freezeCommand(input, value, {
          label: value2,
          icon: value.count === 0 ? 'PinSlash' : 'Pin',
        }),
      ];
    }),
    ...(canActOnRows
      ? [
          changeCommand('insertRowAbove', insertRowsAboveLabel(selectedRowCount), {
            isWeighty: true,
            ...shortcutUnlessCells('insertRowsOrColumns'),
          }),
          changeCommand('insertRowBelow', insertRowsBelowLabel(selectedRowCount), {
            isWeighty: true,
          }),
        ]
      : []),
    ...(canActOnColumns
      ? [
          changeCommand('insertColumnLeft', insertColumnsLeftLabel(selectedColumnCount), {
            isWeighty: true,
            ...shortcutUnlessCells('insertRowsOrColumns'),
          }),
          changeCommand('insertColumnRight', insertColumnsRightLabel(selectedColumnCount), {
            isWeighty: true,
          }),
        ]
      : []),
    ...(isSelectionOf('cells') && !isLinkEdit && props.linkByHandOffered !== null ? [linkByHandCommand] : []),
    ...(isSelectionOf('rows') && props.canMoveSelectionBack
      ? [
          changeCommand('moveRowsUp', moveRowsUpLabel(selectedRowCount), {
            isWeighty: true,
          }),
        ]
      : []),
    ...(isSelectionOf('rows') && props.canMoveSelectionOn
      ? [
          changeCommand('moveRowsDown', moveRowsDownLabel(selectedRowCount), {
            isWeighty: true,
          }),
        ]
      : []),
    ...(isSelectionOf('columns') && props.canMoveSelectionBack
      ? [
          changeCommand('moveColumnsLeft', moveColumnsLeftLabel(selectedColumnCount), {
            isWeighty: true,
          }),
        ]
      : []),
    ...(isSelectionOf('columns') && props.canMoveSelectionOn
      ? [
          changeCommand('moveColumnsRight', moveColumnsRightLabel(selectedColumnCount), {
            isWeighty: true,
          }),
        ]
      : []),
    {
      id: 'menu.clearContents',
      label: sheetMessages.clearContents(),
      otherWords: commandSearchSynonyms('clearContents'),
      icon: 'Eraser',
      keys: 'backspace',
      actsOn: 'cells',
      whyNot: null,
      isWeighty: true,
      run: props.onClearChosen,
    },
    ...(props.areDropdownsSelected
      ? [
          {
            id: 'menu.removeDropdown',
            label: sheetMessages.removeDropdown(),
            icon: 'Minus',
            actsOn: 'cells',
            whyNot: null,
            isWeighty: true,
            run: () =>
              props.onFormatChosen({
                removesDropdown: true,
              }),
          },
        ]
      : []),
    ...(canActOnRows
      ? [
          changeCommand('deleteRows', deleteRowsLabel(selectedRowCount), {
            whyNot: props.canDeleteSelectedRows ? null : sheetMessages.sheetNeedsARow(),
            isWeighty: true,
            ...shortcutUnlessCells('deleteRowsOrColumns'),
          }),
        ]
      : []),
    ...(canActOnColumns
      ? [
          changeCommand('deleteColumns', deleteColumnsLabel(selectedColumnCount), {
            whyNot: props.canDeleteSelectedColumns ? null : sheetMessages.sheetNeedsAColumn(),
            isWeighty: true,
            ...shortcutUnlessCells('deleteRowsOrColumns'),
          }),
        ]
      : []),
    ...(props.areWholeRowsSelected
      ? [
          changeCommand('resizeRows', resizeRowsLabel(props.rowCountToSize), {
            actsOn: 'opens',
          }),
        ]
      : []),
    ...(props.areWholeColumnsSelected
      ? [
          changeCommand('resizeColumns', resizeColumnsLabel(props.columnCountToSize), {
            actsOn: 'opens',
          }),
        ]
      : []),
    ...(props.groupChoices === null ? [] : groupCommandsOf(props.groupChoices)),
    ...(props.columnToSortBy === null
      ? []
      : props.selectedCellCount === 1
        ? [...sortCommands('sheet', sortMenuLabel(), true), customSortCommand('range', null)]
        : [
            ...(props.canSortSelectedRange ? [...sortCommands('range', sortRangeLabel()), customSortCommand('range', sortRangeLabel())] : []),
            ...sortCommands('sheet', sortSheetLabel()),
            customSortCommand('sheet', sortSheetLabel()),
          ]),
    ...(ownFilter === undefined
      ? []
      : [
          {
            id: 'menu.sortAndFilter',
            label: sortAndFilterMessages.sortAndFilter(),
            otherWords: commandSearchSynonyms('sortAndFilter'),
            icon: 'Filter',
            actsOn: 'opens',
            home: 'toolbar',
            whyNot: null,
            run: props.onSortAndFilterAsked,
          },
          ...(ownFilter.kind === 'turnOn'
            ? []
            : [
                {
                  id: 'menu.clearOwnFilter',
                  label: filterMessages.clearFilter(),
                  icon: 'Filter',
                  actsOn: 'view',
                  whyNot: null,
                  run: () => props.onOwnFilterRemoved(ownFilter.tableKey),
                },
              ]),
        ]),
    ...(valueOfCellToFilter === null
      ? []
      : [
          {
            id: 'menu.ownFilter.only',
            label: showOnlyValueLabel(valueOfCellToFilter),
            icon: 'Filter',
            actsOn: 'view',
            whyNot: null,
            run: () => props.onOwnFilterByCellChosen('only'),
          },
          {
            id: 'menu.ownFilter.allBut',
            label: leaveOutValueLabel(valueOfCellToFilter),
            icon: 'Filter',
            actsOn: 'view',
            whyNot: null,
            run: () => props.onOwnFilterByCellChosen('allBut'),
          },
        ]),
    ...(isSelectionOf('cells')
      ? ['rows', 'columns'].flatMap(
          (input?: Dynamic) =>
            (props.freezeChoices?.[input] ?? []).map((input2?: Dynamic) => {
              let value = input === 'rows' ? rowsFromFirstLabel : columnsFromFirstLabel;
              let value2 = toolLabelWithValue(sheetMessages.freeze(), value(input2.count));
              return freezeCommand(input, input2, {
                label: value2,
                icon: 'Pin',
                isTicked: input2.isInForce,
              });
            }),
        )
      : []),
    ...(props.canMergeSelection
      ? [
          changeCommand('mergeCells', sheetMessages.mergeCells(), {
            isWeighty: true,
          }),
        ]
      : []),
    ...(props.canUnmergeSelection
      ? [
          changeCommand('unmergeCells', sheetMessages.unmergeCells(), {
            isWeighty: true,
          }),
        ]
      : []),
    ...(formatOfSelection === null
      ? []
      : [
          ...(formatOfSelection.holdsTextToConvert
            ? [
                changeCommand('convertTexts', sheetMessages.convertTextToNumbers(), {
                  isWeighty: true,
                }),
              ]
            : []),
          ...FONT_MARKS.map(
            (input?: Dynamic) => ({
              id: `menu.${input}`,
              label: textStyleLabel(input),
              icon: null,
              keys: formatToggleShortcut(input),
              isTicked: formatOfSelection.togglesOn[input],
              actsOn: 'cells',
              whyNot: null,
              run: () =>
                props.onFormatChosen({
                  toggle: input,
                }),
            }),
          ),
          {
            id: 'menu.clearFormatting',
            label: sheetMessages.clearFormatting(),
            otherWords: commandSearchSynonyms('clearFormatting'),
            icon: 'Eraser',
            keys: shortcutFor('clearFormatting'),
            actsOn: 'cells',
            whyNot: null,
            isWeighty: true,
            run: () =>
              props.onFormatChosen({
                clearsFormatting: true,
              }),
          },
          ...formatAsTableCommands,
          {
            id: 'menu.conditionalFormatting',
            label: CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
            otherWords: commandSearchSynonyms('conditionalFormatting'),
            icon: 'ConditionalFormat',
            actsOn: 'opens',
            home: 'toolbar',
            whyNot: null,
            run: () => props.onConditionalFormatsAsked('menu'),
          },
        ]),
    ...(props.isCellHistoryOffered
      ? [
          {
            id: 'menu.cellHistory',
            label: cellHistoryMessages.show(),
            otherWords: commandSearchSynonyms('cellHistory'),
            icon: 'History',
            actsOn: 'opens',
            whyNot: null,
            run: props.onCellHistoryAsked,
          },
        ]
      : []),
  ];
}
export function mergeMenuAndBarCommands(
  menuCommands?: Dynamic,
  barCommands?: Dynamic,
  { runsAs: runsAs }: Dynamic = {
    runsAs: 'menu',
  },
) {
  let barCommandById = new (Map as Dynamic)(barCommands.map((input?: Dynamic) => [input.id, input]));
  let mergedBarIds = new (Set as Dynamic)();
  return [
    ...menuCommands.map((command?: Dynamic) => {
      let barCommand = barCommandById.get(BAR_COMMAND_OF_MENU_COMMAND[command.id] ?? '');
      if (barCommand === undefined) return command;
      mergedBarIds.add(barCommand.id);
      let otherWords = [...new (Set as Dynamic)([...(command.otherWords ?? []), ...(barCommand.otherWords ?? [])])];
      return {
        ...command,
        icon: command.icon ?? barCommand.icon,
        ...(otherWords.length > 0 && {
          otherWords: otherWords,
        }),
        ...(runsAs === 'bar' &&
          TEXT_STYLE_MENU_COMMAND_IDS.has(command.id) && {
            run: barCommand.run,
          }),
      };
    }),
    ...barCommands.filter(({ id: id }: Dynamic) => !mergedBarIds.has(id)),
  ];
}
export const SORT_CHANGES = {
  sheet: {
    ascending: 'sortAscending',
    descending: 'sortDescending',
  },
  range: {
    ascending: 'sortRangeAscending',
    descending: 'sortRangeDescending',
  },
};
export const GROUP_CHANGES = {
  rows: {
    group: 'groupRows',
    ungroup: 'ungroupRows',
    collapse: 'collapseRows',
    expand: 'expandRows',
  },
  columns: {
    group: 'groupColumns',
    ungroup: 'ungroupColumns',
    collapse: 'collapseColumns',
    expand: 'expandColumns',
  },
};
export const OTHER_WORDS_KEYS_OF_CHANGES = {
  insertRowAbove: 'insertRowAbove',
  insertRowBelow: 'insertRowBelow',
  insertColumnLeft: 'insertColumnLeft',
  insertColumnRight: 'insertColumnRight',
  moveRowsUp: 'moveRowsUp',
  moveRowsDown: 'moveRowsDown',
  moveColumnsLeft: 'moveColumnsLeft',
  moveColumnsRight: 'moveColumnsRight',
  deleteRows: 'deleteRows',
  deleteColumns: 'deleteColumns',
  resizeRows: 'resizeRows',
  resizeColumns: 'resizeColumns',
  groupRows: 'groupLines',
  groupColumns: 'groupLines',
  ungroupRows: 'ungroupLines',
  ungroupColumns: 'ungroupLines',
  collapseRows: 'collapseGroups',
  collapseColumns: 'collapseGroups',
  expandRows: 'expandGroups',
  expandColumns: 'expandGroups',
  [SORT_CHANGES.range.ascending]: 'sortAscending',
  [SORT_CHANGES.sheet.ascending]: 'sortAscending',
  [SORT_CHANGES.range.descending]: 'sortDescending',
  [SORT_CHANGES.sheet.descending]: 'sortDescending',
  mergeCells: 'mergeCells',
  unmergeCells: 'unmergeCells',
  convertTexts: 'convertTexts',
};
export const FREEZE_OTHER_WORDS_KEYS = {
  rows: {
    none: 'unfreezeRows',
    some: 'freezeRows',
  },
  columns: {
    none: 'unfreezeColumns',
    some: 'freezeColumns',
  },
};
export const BAR_COMMAND_OF_MENU_COMMAND = {
  'menu.bold': 'bar.bold',
  'menu.italic': 'bar.italic',
  'menu.underline': 'bar.underline',
  'menu.strikethrough': 'bar.strikethrough',
  'menu.conditionalFormatting': 'bar.conditionalFormatting',
  'menu.mergeCells': 'bar.mergeCells',
  'menu.unmergeCells': 'bar.unmergeCells',
  'menu.insertRowAbove': 'bar.insertRowAbove',
  'menu.insertRowBelow': 'bar.insertRowBelow',
  'menu.insertColumnLeft': 'bar.insertColumnLeft',
  'menu.insertColumnRight': 'bar.insertColumnRight',
  'menu.customSort.sheet': 'bar.customSort',
  'menu.customSort.range': 'bar.customSort',
  'menu.sortAndFilter': 'bar.sortAndFilter',
};
export const TEXT_STYLE_MENU_COMMAND_IDS = new (Set as Dynamic)(['menu.bold', 'menu.italic', 'menu.underline', 'menu.strikethrough']);
export const isTextStyleMenuCommand = (id?: Dynamic) => TEXT_STYLE_MENU_COMMAND_IDS.has(id);
