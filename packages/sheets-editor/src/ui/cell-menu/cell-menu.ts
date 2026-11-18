import { armTouchOpenGuard, releaseTouchOpenGuard, touchGuardCancelsClose } from '../../kit/touch-open-guard.ts';
import { ContextMenu } from '../../kit/context-menu.tsx';
import { Menu } from '../../kit/menu.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { tableKeyOfHandleAt } from '../../tables/table-handle.ts';
import {
  isTickedVariant,
  correctedCommandQuery,
  searchCommands,
  commandMatchesDistinctWord,
  oneCommandPerStem,
  commandsSharingWords,
  hasSearchWords,
  commandToRunForQuery,
  isRememberedCommandOutOfUse,
  labelMatchesWordsInOrder,
} from '../search-menu/matching.ts';
import { goToLabel } from '../go-to-commands.ts';
import { SORT_DIRECTION_ICONS } from '../icons/sort-direction.ts';
import { MERGE_TOOL_ICONS } from '../search-menu/bar-commands.ts';
import {
  rowsFromFirstLabel,
  freezeRowsLabel,
  columnsFromFirstLabel,
  freezeColumnsLabel,
  sortOrderLabel,
  sortTableUnclearHint,
  sortRangeLabel,
  sortSheetLabel,
  ascendingLabel,
  descendingLabel,
  byColumnLabel,
  byHeadingLabel,
  sortByText,
  columnLetterLabel,
  figureWithValueLabel,
  rowsAboveLabel,
  rowsBelowLabel,
  columnsLeftLabel,
  columnsRightLabel,
  insertRowsAboveLabel,
  insertRowsBelowLabel,
  insertColumnsLeftLabel,
  insertColumnsRightLabel,
  moveRowsUpLabel,
  moveRowsDownLabel,
  moveColumnsLeftLabel,
  moveColumnsRightLabel,
  rowCountLabel,
  columnCountLabel,
  deleteRowsLabel,
  deleteColumnsLabel,
  resizeRowsLabel,
  resizeColumnsLabel,
  sortMenuLabel,
  addFormulaUnderNumbersLabel,
  shortHeadingLabel,
} from '../../i18n/grid-action-labels.ts';
import { sheetMessages, textStyleLabel } from '../../i18n/sheet-messages.ts';
import { CLOSED_MENU_ITEM_LATCH, latchMenuItemWhileOpen, askAgentMenuLabel, AskAgentMenuItems } from '../../agent/ask-agent-menu.ts';
import { useCoarsePointerMedia, useTouchBelowSm } from '../../app/media-queries.ts';
import { isCommentToAgentOffered, canAskAgentHere, whatAskFieldDoes, askAgentVia } from '../../agent/chat-or-comment.ts';
import { useShutOnWindowLeave } from './window-leave.ts';
import { useHandyman, nowMs, MenuFieldFocusKeeper, HandymanRows, SuggestToolsItem, enterOnHandyman, handymanStatusWords } from './handyman.ts';
import {
  NO_ENTER_MEANING,
  withCommandsOfNow,
  isCommandAskedAgain,
  nextEnterMeaning,
  isEnterMeaningSettled,
  enterOnTypedCommand,
  doesKeyDropAskedAgain,
} from './handyman-state.ts';
import { cellControlInsertChoices } from '../toolbar/number-format-menu.ts';
import { useBottomInsetWhileOpen, popupCollisionPadding } from '../../shell/bottom-insets.ts';
import { CONTEXT_BAR_PART_ATTRIBUTE } from '../toolbar-tooltip.ts';
import { oneRangeActOfCommand } from '../../selection/several-ranges.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { MenuItemWithWhyOff } from '../menu-item-why-off.ts';
import { oneRangeNeededText, pasteFromMenuHint, pasteValuesFromMenuHint } from '../../i18n/notice-labels.ts';
import { suggestedFreezeChoice } from '../../grid/freeze.ts';
import { toolUnavailableText } from '../../i18n/chip-labels.ts';
import { customSortMessages, sortAndFilterMessages } from '../../tables/sort-filter-labels.ts';
import { MENU_MAX_VISIBLE_ITEMS, centerCheckedItemRef } from '../menu-scroll.ts';
import { ListRowTooltip } from '../list-under-cell.ts';
import { GROUP_CHANGES, cellMenuCommands, mergeMenuAndBarCommands, isTextStyleMenuCommand } from './menu-commands.ts';
import {
  groupLinesLabel,
  expandGroupsLabel,
  lineGroupsLabel,
  ungroupLinesLabel,
  collapseGroupsLabel,
  showToLevelLabel,
} from '../../messages/line-groups.ts';
import { CHART_MESSAGES } from '../../charts/chart-words.ts';
import { shortcutFor } from '../../keys/key-press.ts';
import { filterMessages, showOnlyValueLabel, leaveOutValueLabel } from '../../tables/filter-messages.ts';
import { SUM_BAR_AGGREGATES } from '../../state/transitions.ts';
import { formatNumberWithSigns } from '../../format/number-signs.ts';
import { shortcutKeysFor } from '../../keys/shortcut-list.ts';
import { linkEditMessages } from '../../links/link-hover-card.ts';
import { suggestedRuleCommands, ruleCommands, suggestedRulesFirst } from './rule-commands.ts';
import { toolSearchMessages } from '../../messages/tool-search-words.ts';
import { wordsToFind, FindInSheetItem, findInSheetLabel } from './find-in-sheet.ts';
import { useRuleTryOn, SuggestedRulesWanted, SuggestedRulesSubmenu } from './suggested-rules.ts';
import { CommentNextRow, CommandRows, MenuWithField, enabledCommandRow } from '../menu-with-field.ts';
import { shortBreakableUrl, OPEN_LINK_SHORTCUT, breakableUrlText } from '../../links/cell-links-view.ts';
import { commandHint, groupFoundCommands, commandGroupMessages } from '../search-menu/command-groups.ts';
import { menuMatchCountWords, menuMatchCountChooseRowWords, pressEnterAgainToConfirmWords } from '../../messages/command-search.ts';
import { TypedSearchAnnouncer } from '../search-announcer.ts';
import { swallowPressAfterItemPress } from '../press-swallow.ts';
import { chartMessages } from '../../messages/charts.ts';
import { builtLinkWarning } from '../../i18n/status-labels.ts';
import { FONT_MARKS } from '../../editor/text-looks.ts';
import { formatToggleShortcut, TextWrappingItems } from '../toolbar/text-menus.ts';
import { CONDITIONAL_FORMATTING_WORDS } from '../../messages/conditional-format.ts';
import { cellHistoryMessages } from '../../history/cell-history-popover.ts';
export function passPointerDownToCells(event?: Dynamic) {
  let { currentTarget: portal, target: target } = event;
  if (!(portal instanceof HTMLElement)) return;
  if ((target instanceof Element && target.closest('[role="menu"]') !== null) || event.pointerType === 'touch' || event.button !== 0) return;
  let elementBelow = portal.ownerDocument
    .elementsFromPoint(event.clientX, event.clientY)
    .find((input?: Dynamic) => !portal.contains(input));
  if (portal.querySelector(`[${MENU_OF_HANDLE_ATTRIBUTE}]`) !== null && tableKeyOfHandleAt(elementBelow ?? null) !== undefined)
    return event.stopPropagation();
  if (elementBelow === undefined || elementBelow.closest('.sheet-grid') === null) return;
  elementBelow.dispatchEvent(new (PointerEvent as Dynamic)('pointerdown', event));
  event.stopPropagation();
}
export function passPortalPointerDownToCells(menu?: Dynamic) {
  let portal = menu.closest('[data-base-ui-portal]');
  if (portal === null) reportError(Error('The menu is in no Base UI portal, so a click outside it will not reach the cells'));
  else portal.addEventListener('pointerdown', passPointerDownToCells);
}
export function passWheelThroughMenu(menu?: Dynamic, close?: Dynamic) {
  let portal = menu.closest('[data-base-ui-portal]');
  let wheelDistance: Dynamic = 0;
  let resetWheelDistance = () => {
    wheelDistance = 0;
  };
  let onWheel = (event?: Dynamic) => {
    let target = event.target instanceof Element && !event.ctrlKey ? event.target : null;
    for (let element: Dynamic = target; element !== null && element !== portal; element = element.parentElement) {
      if (canScrollVertically(element)) return;
      if (Array.from<Dynamic>(element.children).some(canScrollVertically)) return event.preventDefault();
    }
    if (!event.ctrlKey) event.preventDefault();
    let isOpen = menu.hasAttribute('data-open');
    let isPixelDelta = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && !event.ctrlKey;
    wheelDistance = isOpen ? wheelDistance + (isPixelDelta ? Math.hypot(event.deltaX, event.deltaY) : 1 / 0) : 0;
    if (isOpen && wheelDistance <= WHEEL_SLACK_BEFORE_CLOSE_PX) return;
    if (isOpen) close();
    if (
      menu.ownerDocument
        .elementsFromPoint(event.clientX, event.clientY)
        .find((input?: Dynamic) => portal?.contains(input) === false)
        ?.dispatchEvent(new (WheelEvent as Dynamic)('wheel', event)) === false
    )
      event.preventDefault();
  };
  portal?.addEventListener('pointerdown', resetWheelDistance);
  portal?.addEventListener('wheel', onWheel, {
    passive: false,
  });
  return () => {
    portal?.removeEventListener('pointerdown', resetWheelDistance);
    portal?.removeEventListener('wheel', onWheel);
  };
}
export const MAX_COMMANDS_FOUND = 8;
export const MAX_GUESSED_COMMANDS = 4;
export const MAX_MENU_FIELD_LENGTH = 200;
export const clipMenuFieldText = (text?: Dynamic) => text.slice(0, MAX_MENU_FIELD_LENGTH).replace(/[\uD800-\uDBFF]$/u, '');
export const isCommandEnabled = ({ whyNot: whyNot }: Dynamic) => whyNot === null;
export const asEnabledCommand = (input?: Dynamic) => ({
  ...input,
  whyNot: null,
});
export const withSingleOtherWords = (command?: Dynamic) => ({
  ...command,
  otherWords: (command.otherWords ?? []).filter((input?: Dynamic) => !/[\s-]/.test(input)),
});
export const isLightCommand = (command?: Dynamic) =>
  isCommandEnabled(command) && command.isWeighty !== true && !isTickedVariant(command);
export const isFunctionCommand = ({ id: id }: Dynamic) => id.startsWith('function.');
export const normalizeMenuWords = (text?: Dynamic) => text.trim().toLowerCase().replace(/\s+/g, ' ');
export const lettersAndNumbersOf = (text?: Dynamic) => normalizeMenuWords(text.replace(/[^\p{L}\p{M}\p{N}]+/gu, ' '));
export const labelsMatch = (label?: Dynamic, typed?: Dynamic) => lettersAndNumbersOf(label) === lettersAndNumbersOf(typed);
export const isGoToTyped = (typed?: Dynamic) => {
  let goToWords = normalizeMenuWords(goToLabel()).split(' ');
  return normalizeMenuWords(typed)
    .split(' ')
    .every((input?: Dynamic) => goToWords.some((input2?: Dynamic) => input2.startsWith(input)));
};
export const GROUP_ICON = {
  icon: 'Group',
};
export const UNGROUP_ICON = {
  icon: 'Ungroup',
};
export const CONVERT_TEXTS_ICON = {
  icon: 'Numbers',
};
export const CHANGE_ICONS = {
  insertRowAbove: 'TableRowInsertAbove',
  insertRowBelow: 'TableRowInsertBelow',
  insertColumnLeft: 'TableColumnInsertLeft',
  insertColumnRight: 'TableColumnInsertRight',
  moveRowsUp: 'ArrowUp',
  moveRowsDown: 'ArrowDown',
  moveColumnsLeft: 'ArrowLeft',
  moveColumnsRight: 'ArrowRight',
  resizeRows: 'RowHeight',
  resizeColumns: 'ColumnWidth',
  deleteRows: 'TableRowDelete',
  deleteColumns: 'TableColumnDelete',
  sortAscending: SORT_DIRECTION_ICONS.ascending,
  sortDescending: SORT_DIRECTION_ICONS.descending,
  sortRangeAscending: SORT_DIRECTION_ICONS.ascending,
  sortRangeDescending: SORT_DIRECTION_ICONS.descending,
  groupRows: GROUP_ICON.icon,
  groupColumns: GROUP_ICON.icon,
  ungroupRows: UNGROUP_ICON.icon,
  ungroupColumns: UNGROUP_ICON.icon,
  collapseRows: null,
  collapseColumns: null,
  expandRows: null,
  expandColumns: null,
  ...MERGE_TOOL_ICONS,
  convertTexts: CONVERT_TEXTS_ICON.icon,
};
export const iconOfChange = (change?: Dynamic) => CHANGE_ICONS[change];
export const SORT_CHANGES_BY_SCOPE = {
  sheet: {
    ascending: 'sortAscending',
    descending: 'sortDescending',
  },
  range: {
    ascending: 'sortRangeAscending',
    descending: 'sortRangeDescending',
  },
};
export const FREEZE_MENU_LINES = [
  {
    what: 'rows',
    inWords: rowsFromFirstLabel,
    forWholeLinesInWords: freezeRowsLabel,
    whyNoRoom: sheetMessages.tooManyRowsToFreeze,
  },
  {
    what: 'columns',
    inWords: columnsFromFirstLabel,
    forWholeLinesInWords: freezeColumnsLabel,
    whyNoRoom: sheetMessages.tooManyColumnsToFreeze,
  },
];
export const MENU_OF_HANDLE_ATTRIBUTE = 'data-menu-of-handle';
export const isOnlyAltPressed = ({ altKey: altKey, shiftKey: shiftKey, ctrlKey: ctrlKey, metaKey: metaKey }: Dynamic) =>
  altKey && !shiftKey && !ctrlKey && !metaKey;
export const WHEEL_SLACK_BEFORE_CLOSE_PX = 8;
export const canScrollVertically = (element?: Dynamic) =>
  element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY);
export const CELL_MENU_TOUCH_GUARD: Dynamic = {};
export const MENU_ON_CELLS_ATTRIBUTE = 'data-menu-on-cells';
export const armCellMenuTouchGuard = (menu?: Dynamic) => armTouchOpenGuard(CELL_MENU_TOUCH_GUARD, menu.ownerDocument, menu);
export const CellContextMenu = React.memo(function ({
  isOpen: isOpen,
  isAskedByKey: isAskedByKey,
  placeAsked: placeAsked,
  onWindowLeftWithMenuAskedAt: onWindowLeftWithMenuAskedAt,
  staysOpenAsWindowIsLeft: staysOpenAsWindowIsLeft,
  isAskedToSearch: isAskedToSearch,
  anchor: anchor,
  whatHasCaretAfter: whatHasCaretAfter,
  onClosed: onClosed,
  onLinkOpened: onLinkOpened,
  onLinkCopied: onLinkCopied,
  onLinkFormAsked: onLinkFormAsked,
  onLinkCardAsked: onLinkCardAsked,
  onCopyOrCutChosen: onCopyOrCutChosen,
  keyThatPastes: keyThatPastes,
  onPasteChosen: onPasteChosen,
  onPasteMeantForCells: onPasteMeantForCells,
  onCommentChosen: onCommentChosen,
  onClearChosen: onClearChosen,
  onChangeChosen: onChangeChosen,
  onOwnFilterAsked: onOwnFilterAsked,
  onSortAndFilterAsked: onSortAndFilterAsked,
  onChartCardAsked: onChartCardAsked,
  onKeyDownInMenuOfHandle: onKeyDownInMenuOfHandle,
  cardUnderChart: cardUnderChart,
  onChartCopyChosen: onChartCopyChosen,
  onChartDeleteChosen: onChartDeleteChosen,
  onOwnFilterByCellChosen: onOwnFilterByCellChosen,
  onOwnFilterRemoved: onOwnFilterRemoved,
  onFormatAsTableChosen: onFormatAsTableChosen,
  onColumnToSortByChosen: onColumnToSortByChosen,
  onFreezeChosen: onFreezeChosen,
  onGroupLevelChosen: onGroupLevelChosen,
  onFormatChosen: onFormatChosen,
  onInsertChosen: onInsertChosen,
  onConditionalFormatsAsked: onConditionalFormatsAsked,
  onSortPaneAsked: onSortPaneAsked,
  onFigureChosen: onFigureChosen,
  onCellHistoryAsked: onCellHistoryAsked,
  onAgentAsked: onAgentAsked,
  onFixAsked: onFixAsked,
  onAgentAskedInComment: onAgentAskedInComment,
  onFindAskedFor: onFindAskedFor,
  commandsOfBar: commandsOfBar,
  commandsOfTyped: commandsOfTyped,
  commandsByName: commandsByName,
  onSearchBegun: onSearchBegun,
  askForCommands: askForCommands,
  canAskForCommands: canAskForCommands,
  isAgentForToolsExpected: isAgentForToolsExpected,
  onOpened: onOpened,
  couldCommentGoToAgent: couldCommentGoToAgent,
  mightChatLeaveSheet: mightChatLeaveSheet,
  canRuleBeAskedInWords: canRuleBeAskedInWords,
  rulesInMenu: rulesInMenu,
  onSuggestedRulesWanted: onSuggestedRulesWanted,
  onSuggestedRulePointedAt: onSuggestedRulePointedAt,
  onSuggestedRuleTaken: onSuggestedRuleTaken,
  onRulesAsked: onRulesAsked,
  onRuleAskedInWords: onRuleAskedInWords,
  onRuleLetGo: onRuleLetGo,
  onRuleKept: onRuleKept,
  onRuleStopped: onRuleStopped,
  onCommandTaken: onCommandTaken,
  wasChatToBeHad: wasChatToBeHad,
  ...menuProps
}: Dynamic) {
  let [keptMenuProps, setKeptMenuProps] = React.useState(menuProps);
  let areKeptPropsSame =
    keptMenuProps.side === menuProps.side &&
    keptMenuProps.linkUrl === menuProps.linkUrl &&
    keptMenuProps.linkInWordsUrl === menuProps.linkInWordsUrl &&
    keptMenuProps.isLinkInWordsBuilt === menuProps.isLinkInWordsBuilt &&
    keptMenuProps.linkByHandOffered === menuProps.linkByHandOffered &&
    keptMenuProps.doesKeyOpenLinkForm === menuProps.doesKeyOpenLinkForm &&
    keptMenuProps.isOfContextBar === menuProps.isOfContextBar &&
    keptMenuProps.holdsOnlyFigures === menuProps.holdsOnlyFigures &&
    keptMenuProps.isOfHandleOfTable === menuProps.isOfHandleOfTable &&
    keptMenuProps.ofChart === menuProps.ofChart &&
    keptMenuProps.canInsertChart === menuProps.canInsertChart &&
    keptMenuProps.holdsNoEdits === menuProps.holdsNoEdits &&
    keptMenuProps.ownFilterOffers?.filter.kind === menuProps.ownFilterOffers?.filter.kind &&
    keptMenuProps.ownFilterOffers?.valueOfCell === menuProps.ownFilterOffers?.valueOfCell &&
    keptMenuProps.formatAsTableOffer?.isOn === menuProps.formatAsTableOffer?.isOn &&
    keptMenuProps.formatOfSelection === menuProps.formatOfSelection &&
    keptMenuProps.selectionIsOf === menuProps.selectionIsOf &&
    keptMenuProps.selectedRowCount === menuProps.selectedRowCount &&
    keptMenuProps.selectedColumnCount === menuProps.selectedColumnCount &&
    keptMenuProps.selectedCellCount === menuProps.selectedCellCount &&
    keptMenuProps.rowCountToSize === menuProps.rowCountToSize &&
    keptMenuProps.columnCountToSize === menuProps.columnCountToSize &&
    keptMenuProps.isOneRangeNeeded === menuProps.isOneRangeNeeded &&
    keptMenuProps.isSelectionCutByOwnFilters === menuProps.isSelectionCutByOwnFilters &&
    keptMenuProps.heldToPaste === menuProps.heldToPaste &&
    keptMenuProps.canPasteValuesOnly === menuProps.canPasteValuesOnly &&
    keptMenuProps.canDeleteSelectedRows === menuProps.canDeleteSelectedRows &&
    keptMenuProps.canDeleteSelectedColumns === menuProps.canDeleteSelectedColumns &&
    keptMenuProps.areWholeRowsSelected === menuProps.areWholeRowsSelected &&
    keptMenuProps.areWholeColumnsSelected === menuProps.areWholeColumnsSelected &&
    keptMenuProps.columnToSortBy === menuProps.columnToSortBy &&
    keptMenuProps.canSortSelectedRange === menuProps.canSortSelectedRange &&
    keptMenuProps.columnToSortSelectedRangeBy === menuProps.columnToSortSelectedRangeBy &&
    keptMenuProps.columnsOfferedToSortBy === menuProps.columnsOfferedToSortBy &&
    keptMenuProps.headingToSortBy === menuProps.headingToSortBy &&
    keptMenuProps.headingToSortSelectedRangeBy === menuProps.headingToSortSelectedRangeBy &&
    keptMenuProps.keysToSortBy === menuProps.keysToSortBy &&
    keptMenuProps.canSortTableAtCell === menuProps.canSortTableAtCell &&
    keptMenuProps.keysToSortSelectedRangeBy === menuProps.keysToSortSelectedRangeBy &&
    keptMenuProps.canMergeSelection === menuProps.canMergeSelection &&
    keptMenuProps.canUnmergeSelection === menuProps.canUnmergeSelection &&
    keptMenuProps.canMoveSelectionBack === menuProps.canMoveSelectionBack &&
    keptMenuProps.canMoveSelectionOn === menuProps.canMoveSelectionOn &&
    keptMenuProps.freezeChoices === menuProps.freezeChoices &&
    keptMenuProps.groupChoices === menuProps.groupChoices &&
    keptMenuProps.figures === menuProps.figures &&
    keptMenuProps.areDropdownsSelected === menuProps.areDropdownsSelected &&
    keptMenuProps.isCellHistoryOffered === menuProps.isCellHistoryOffered &&
    keptMenuProps.isChatToBeHad === menuProps.isChatToBeHad &&
    keptMenuProps.hasAddressForAgent === menuProps.hasAddressForAgent &&
    keptMenuProps.addressOfActiveCell === menuProps.addressOfActiveCell &&
    keptMenuProps.isCommentOffered === menuProps.isCommentOffered &&
    keptMenuProps.doCellsShowError === menuProps.doCellsShowError &&
    keptMenuProps.rulesSuggested === menuProps.rulesSuggested &&
    keptMenuProps.canActiveCellBeFixedHere === menuProps.canActiveCellBeFixedHere &&
    keptMenuProps.isFixOfActiveCellYetToBeKnown === menuProps.isFixOfActiveCellYetToBeKnown;
  if (isOpen && !areKeptPropsSame) setKeptMenuProps(menuProps);
  let [askAgentLatch, setAskAgentLatch] = React.useState(CLOSED_MENU_ITEM_LATCH);
  let isPointerCoarse = useCoarsePointerMedia();
  let offersCommentToAgent = isCommentToAgentOffered({
    isFieldOnTop:
      !menuProps.holdsOnlyFigures &&
      !menuProps.holdsNoEdits &&
      !menuProps.isOfContextBar &&
      !menuProps.isOfHandleOfTable &&
      menuProps.ofChart === null &&
      !isPointerCoarse,
    isChatToBeHad: menuProps.isChatToBeHad ?? wasChatToBeHad,
    isCommentOffered: menuProps.isCommentOffered,
    doCellsShowError: menuProps.doCellsShowError,
    couldCommentGoToAgent: couldCommentGoToAgent(),
  });
  let askAgentLatched = latchMenuItemWhileOpen(askAgentLatch, isOpen, offersCommentToAgent ? true : menuProps.isChatToBeHad, wasChatToBeHad);
  if (askAgentLatched !== askAgentLatch) setAskAgentLatch(askAgentLatched);
  let [fixLatch, setFixLatch] = React.useState(CLOSED_MENU_ITEM_LATCH);
  let fixLatched = latchMenuItemWhileOpen(
    fixLatch,
    isOpen,
    menuProps.canActiveCellBeFixedHere || menuProps.isFixOfActiveCellYetToBeKnown,
    false,
  );
  if (fixLatched !== fixLatch) setFixLatch(fixLatched);
  let [makeChartLatch, setMakeChartLatch] = React.useState(CLOSED_MENU_ITEM_LATCH);
  let makeChartLatched = latchMenuItemWhileOpen(makeChartLatch, isOpen, menuProps.canCellsMakeChart, false);
  if (makeChartLatched !== makeChartLatch) setMakeChartLatch(makeChartLatched);
  let { isShut: isShut, isWindowLeft: isWindowLeft } = useShutOnWindowLeave({
    isOpen: isOpen,
    placeAsked: placeAsked,
    close: onWindowLeftWithMenuAskedAt,
    staysOpen: staysOpenAsWindowIsLeft,
  });
  let [wasAskedByKey, setWasAskedByKey] = React.useState(isAskedByKey);
  if (isOpen && wasAskedByKey !== isAskedByKey) setWasAskedByKey(isAskedByKey);
  let [wasAskedToSearch, setWasAskedToSearch] = React.useState(isAskedToSearch);
  if (isOpen && wasAskedToSearch !== isAskedToSearch) setWasAskedToSearch(isAskedToSearch);
  let [typed, setTyped] = React.useState('');
  let handymanHook = useHandyman(askForCommands, isOpen, anchor, onRuleAskedInWords, rulesInMenu);
  let [enterMeaning, setEnterMeaning] = React.useState(NO_ENTER_MEANING);
  let [askedToConfirm, setAskedToConfirm] = React.useState(null);
  let [isAgentHadForTools, setIsAgentHadForTools] = React.useState(isAgentForToolsExpected);
  React.useEffect(() => {
    if (!isOpen) return;
    let value: Dynamic = true;
    canAskForCommands()
      .catch(() => false)
      .then((input?: Dynamic) => {
        if (value) setIsAgentHadForTools(input);
        return;
      });
    return () => {
      value = false;
    };
  }, [isOpen, canAskForCommands]);
  React.useEffect(() => {
    if (isOpen) onOpened();
  }, [isOpen, onOpened]);
  let [rememberedCommand, setRememberedCommand] = React.useState(null);
  let [seenAnchor, setSeenAnchor] = React.useState(anchor);
  if (anchor !== seenAnchor) {
    setSeenAnchor(anchor);
    setTyped('');
    setEnterMeaning(NO_ENTER_MEANING);
    setAskedToConfirm(null);
    setRememberedCommand(null);
  }
  let {
    side: side,
    linkUrl: linkUrl,
    linkInWordsUrl: linkInWordsUrl,
    isLinkInWordsBuilt: isLinkInWordsBuilt,
    linkByHandOffered: linkByHandOffered,
    doesKeyOpenLinkForm: doesKeyOpenLinkForm,
    isOfContextBar: isOfContextBar,
    holdsOnlyFigures: holdsOnlyFigures,
    isOfHandleOfTable: isOfHandleOfTable,
    ofChart: ofChart,
    canInsertChart: canInsertChart,
    holdsNoEdits: holdsNoEdits,
    ownFilterOffers: ownFilterOffers,
    formatAsTableOffer: formatAsTableOffer,
    formatOfSelection: formatOfSelection,
    figures: figures,
    freezeChoices: freezeChoices,
    groupChoices: groupChoices,
    selectionIsOf: selectionIsOf,
    selectedRowCount: selectedRowCount,
    selectedColumnCount: selectedColumnCount,
    selectedCellCount: selectedCellCount,
    rowCountToSize: rowCountToSize,
    columnCountToSize: columnCountToSize,
    isOneRangeNeeded: isOneRangeNeeded,
    isSelectionCutByOwnFilters: isSelectionCutByOwnFilters,
    heldToPaste: heldToPaste,
    canPasteValuesOnly: canPasteValuesOnly,
    canDeleteSelectedRows: canDeleteSelectedRows,
    canDeleteSelectedColumns: canDeleteSelectedColumns,
    areWholeRowsSelected: areWholeRowsSelected,
    areWholeColumnsSelected: areWholeColumnsSelected,
    columnToSortBy: columnToSortBy,
    canSortSelectedRange: canSortSelectedRange,
    columnToSortSelectedRangeBy: columnToSortSelectedRangeBy,
    columnsOfferedToSortBy: columnsOfferedToSortBy2,
    headingToSortBy: headingToSortBy2,
    headingToSortSelectedRangeBy: headingToSortSelectedRangeBy,
    keysToSortBy: keysToSortBy,
    canSortTableAtCell: canSortTableAtCell,
    keysToSortSelectedRangeBy: keysToSortSelectedRangeBy,
    canMergeSelection: canMergeSelection,
    canUnmergeSelection: canUnmergeSelection,
    canMoveSelectionBack: canMoveSelectionBack,
    canMoveSelectionOn: canMoveSelectionOn,
    areDropdownsSelected: areDropdownsSelected,
    isCellHistoryOffered: isCellHistoryOffered,
    isChatToBeHad: isChatToBeHad,
    hasAddressForAgent: hasAddressForAgent,
    addressOfActiveCell: addressOfActiveCell,
    isCommentOffered: isCommentOffered,
    doCellsShowError: doCellsShowError,
    rulesSuggested: rulesSuggested,
    canActiveCellBeFixedHere: canActiveCellBeFixedHere,
    isFixOfActiveCellYetToBeKnown: isFixOfActiveCellYetToBeKnown,
  } = isOpen ? menuProps : keptMenuProps;
  let insertChoices =
    isOfContextBar || formatOfSelection === null
      ? []
      : cellControlInsertChoices({
          formatsThatFit: formatOfSelection.formatsThatFit,
          takesDropdown: formatOfSelection.takesDropdownFromInsert,
          isOneRangeNeeded: isOneRangeNeeded,
        });
  let hidesLinks = holdsOnlyFigures || ofChart !== null;
  let linkToOpen = hidesLinks ? null : linkUrl;
  let linkToCopy = hidesLinks ? null : linkInWordsUrl;
  let openLinkItemRef = React.useRef(null);
  let focusedInMenuRef = React.useRef(null);
  React.useEffect(() => {
    if (!isOpen || isShut) focusedInMenuRef.current = null;
    let value = focusedInMenuRef.current?.isConnected === false ? focusedInMenuRef.current.ownerDocument : null;
    let value2 = value?.activeElement?.closest('[role="menu"]') ?? null;
    if (value?.hasFocus() === true && value2 === null) onClosed();
  });
  React.useEffect(() => (isOpen ? () => releaseTouchOpenGuard(CELL_MENU_TOUCH_GUARD) : undefined), [isOpen]);
  let bottomInset = useBottomInsetWhileOpen(isOpen, false);
  let isTouchBelowSm2 = useTouchBelowSm();
  let isFieldOnTop = !holdsOnlyFigures && !holdsNoEdits && !isOfContextBar && !isOfHandleOfTable && ofChart === null && !isPointerCoarse;
  let padsForBottomInset = side === null && bottomInset > 0;
  let collisionProps = React.useMemo(
    () =>
      padsForBottomInset
        ? {
            collisionPadding: popupCollisionPadding(bottomInset),
          }
        : {},
    [padsForBottomInset, bottomInset],
  );
  let contextBarPartProps = menuProps.isOfContextBar
    ? {
        [CONTEXT_BAR_PART_ATTRIBUTE]: 'more',
      }
    : {};
  let menuRef = React.useCallback(
    (menu?: Dynamic) => {
      if (menu === null) return;
      passPortalPointerDownToCells(menu);
      let stopWheel = passWheelThroughMenu(menu, onClosed);
      return () => {
        stopWheel();
      };
    },
    [onClosed],
  );
  let changeItem = (
    change?: Dynamic,
    label?: Dynamic,
    isOff: Dynamic = false,
    whyOff: Dynamic = null,
    shortcut: Dynamic = null,
    hasIcon: Dynamic = true,
    { hint = null, foundByTyping = null }: Dynamic = {},
  ) => {
    let oneRangeAct = isOneRangeNeeded ? oneRangeActOfCommand(change) : null;
    return jsx(MenuItemWithWhyOff, {
      ...(hasIcon && {
        icon: CHANGE_ICONS[change],
      }),
      ...(shortcut !== null && {
        shortcut: shortcut,
      }),
      ...(hint !== null && {
        hint: hint,
      }),
      ...(foundByTyping !== null && {
        label: foundByTyping,
      }),
      disabled: isOff || oneRangeAct !== null,
      whyOff: oneRangeAct === null ? whyOff : oneRangeNeededText(oneRangeAct),
      isPointerCoarse: isPointerCoarse,
      onClick: () => onChangeChosen(change),
      children: label,
    });
  };
  let freezeItems = () => {
    let freezeLines = FREEZE_MENU_LINES.find(({ what: what }: Dynamic) => what === selectionIsOf);
    if (freezeLines === undefined || freezeChoices === null) return null;
    let choice = suggestedFreezeChoice(freezeChoices[freezeLines.what]);
    if (choice === null) return null;
    return jsxs(Fragment, {
      children: [
        jsx(MenuItemWithWhyOff, {
          icon: choice.count === 0 ? 'PinSlash' : 'Pin',
          disabled: !choice.isRoom,
          whyOff: choice.isRoom ? null : freezeLines.whyNoRoom(),
          isPointerCoarse: isPointerCoarse,
          onClick: () => onFreezeChosen(freezeLines.what, choice.count),
          children: freezeLines.forWholeLinesInWords(choice.count),
        }),
        jsx(ContextMenu.Separator, {}),
      ],
    });
  };
  let whyNoDeleteLines = isOneRangeNeeded
    ? sheetMessages.oneRangeNeededToDeleteLines()
    : canDeleteSelectedRows || canDeleteSelectedColumns
      ? null
      : sheetMessages.sheetNeedsARowAndAColumn();
  let countedChangeItem = (
    change?: Dynamic,
    labelOfCount?: Dynamic,
    count?: Dynamic,
    isOff: Dynamic = false,
    whyOff: Dynamic = null,
  ) =>
    changeItem(change, labelOfCount(count), isOff, whyOff, null, true, {
      foundByTyping: labelOfCount(1),
    });
  let submenuOrOff = ({ icon: icon, label: label, whyOff: whyOff, rows: rows }: Dynamic) =>
    whyOff === null
      ? jsxs(ContextMenu.Submenu, {
          children: [
            jsx(ContextMenu.SubmenuTrigger, {
              icon: icon,
              children: label,
            }),
            jsx(ContextMenu.SubmenuPopup, {
              ...contextBarPartProps,
              children: rows,
            }),
          ],
        })
      : jsx(MenuItemWithWhyOff, {
          icon: icon,
          disabled: true,
          whyOff: whyOff,
          isPointerCoarse: isPointerCoarse,
          children: label,
        });
  let insertChoiceItem = ({ what: what, icon: icon, label: label, fits: fits, whyNotNow: whyNotNow }: Dynamic) =>
    jsx(
      MenuItemWithWhyOff,
      {
        icon: icon,
        disabled: !fits || whyNotNow !== undefined,
        whyOff: fits ? (whyNotNow ?? null) : toolUnavailableText(label),
        isPointerCoarse: isPointerCoarse,
        onClick: () => {
          if (what === 'person') onClosed();
          onInsertChosen(what);
        },
        children: label,
      },
      what,
    );
  let sortItem = (scope?: Dynamic, direction?: Dynamic, label?: Dynamic, hasIcon?: Dynamic) => {
    let keys = scope === 'range' ? keysToSortSelectedRangeBy : keysToSortBy;
    let hint = keys === null ? null : sortOrderLabel(keys, direction);
    let isUnclear = selectedCellCount === 1 && !canSortTableAtCell;
    let whyOff = isUnclear ? sortTableUnclearHint() : null;
    return changeItem(SORT_CHANGES_BY_SCOPE[scope][direction], label, isUnclear, whyOff, null, hasIcon, {
      hint: hint,
    });
  };
  let sortSubmenu = (scope?: Dynamic, columnLetters2?: Dynamic) => {
    let heading = scope === 'range' ? headingToSortSelectedRangeBy : headingToSortBy2;
    let label = scope === 'range' ? sortRangeLabel() : sortSheetLabel();
    let oneRangeAct = isOneRangeNeeded && scope === 'range' ? oneRangeActOfCommand(SORT_CHANGES_BY_SCOPE.range.ascending) : null;
    if (oneRangeAct !== null)
      return jsx(MenuItemWithWhyOff, {
        icon: 'Sort',
        disabled: true,
        whyOff: oneRangeNeededText(oneRangeAct),
        isPointerCoarse: isPointerCoarse,
        children: label,
      });
    let columnsOffered = scope === 'sheet' ? (columnsOfferedToSortBy2 ?? []) : [];
    let directionItems = jsxs(Fragment, {
      children: [sortItem(scope, 'ascending', ascendingLabel(), false), sortItem(scope, 'descending', descendingLabel(), false)],
    });
    let customSortItem = jsx(ContextMenu.Item, {
      onClick: () => onSortPaneAsked(scope),
      children: customSortMessages.customSort(),
    });
    return jsxs(ContextMenu.Submenu, {
      children: [
        columnLetters2 === null || heading === '' || isTouchBelowSm2
          ? jsx(ContextMenu.SubmenuTrigger, {
              icon: 'Sort',
              ...(columnLetters2 !== null && {
                hint: heading === '' ? byColumnLabel(columnLetters2) : byHeadingLabel(heading),
                hintDir: 'auto',
              }),
              children: label,
            })
          : jsx(ContextMenu.SubmenuTrigger, {
              icon: 'Sort',
              label: label,
              children: jsxs('span', {
                className: 'flex items-baseline justify-between gap-md',
                children: [
                  jsx('span', {
                    className: 'shrink-0',
                    children: label,
                  }),
                  jsx('span', {
                    className: '-my-[0.125em] max-w-[160px] min-w-0 truncate py-[0.125em] text-footnote text-muted',
                    children: byHeadingLabel(heading),
                  }),
                ],
              }),
            }),
        columnsOffered.length < 2
          ? jsxs(ContextMenu.SubmenuPopup, {
              ...contextBarPartProps,
              children: [directionItems, jsx(ContextMenu.Separator, {}), customSortItem],
            })
          : jsx(ContextMenu.SubmenuPopup, {
              ...contextBarPartProps,
              header: jsxs(Fragment, {
                children: [directionItems, jsx(ContextMenu.Separator, {})],
              }),
              footer: jsxs(Fragment, {
                children: [jsx(ContextMenu.Separator, {}), customSortItem],
              }),
              maxVisibleItems: MENU_MAX_VISIBLE_ITEMS,
              children: jsxs(ContextMenu.Group, {
                children: [
                  jsx(Menu.GroupLabel, {
                    children: sortByText(),
                  }),
                  columnsOffered.map(({ columnId: columnId, letters: letters, heading: heading2 }: Dynamic) => {
                    let label2 = heading2 === '' ? columnLetterLabel(letters) : heading2;
                    return jsx(
                      ContextMenu.Item,
                      {
                        ref: letters === columnLetters2 ? centerCheckedItemRef : undefined,
                        checked: letters === columnLetters2,
                        checkedRole: 'radio',
                        label: label2,
                        onClick: () => onColumnToSortByChosen(columnId),
                        children: jsxs('span', {
                          className: 'flex min-w-0 items-baseline justify-between gap-md',
                          children: [
                            jsx(ListRowTooltip, {
                              className: 'min-w-0',
                              dir: 'auto',
                              children: label2,
                            }),
                            heading2 !== '' &&
                              jsx('span', {
                                className: 'shrink-0 text-footnote text-muted',
                                children: letters,
                              }),
                          ],
                        }),
                      },
                      columnId,
                    );
                  }),
                ],
              }),
            }),
      ],
    });
  };
  let groupItems = ({
    of: lines,
    canUngroup: canUngroup,
    collapseCount: collapseCount,
    expandCount: expandCount,
    levelCount: levelCount,
  }: Dynamic) => {
    let selectedCount = lines === 'rows' ? selectedRowCount : selectedColumnCount;
    let changes = GROUP_CHANGES[lines];
    let hasLevels = levelCount > 0;
    let groupItem = (change?: Dynamic, label?: Dynamic, shortcut?: Dynamic) =>
      changeItem(change, label, false, null, shortcut, !hasLevels);
    let groupLinesItem = groupItem(changes.group, groupLinesLabel(lines, selectedCount), 'alt+shift+right');
    return jsxs(Fragment, {
      children: [
        expandCount > 0 && changeItem(changes.expand, expandGroupsLabel(expandCount), false, null, 'alt+shift+down'),
        !hasLevels
          ? groupLinesItem
          : jsxs(ContextMenu.Submenu, {
              children: [
                jsx(ContextMenu.SubmenuTrigger, {
                  icon: CHANGE_ICONS[changes.group],
                  children: lineGroupsLabel(lines),
                }),
                jsxs(ContextMenu.SubmenuPopup, {
                  ...contextBarPartProps,
                  children: [
                    groupLinesItem,
                    canUngroup && groupItem(changes.ungroup, ungroupLinesLabel(lines), 'alt+shift+left'),
                    collapseCount > 0 && groupItem(changes.collapse, collapseGroupsLabel(collapseCount), 'alt+shift+up'),
                    jsx(ContextMenu.Separator, {}),
                    Array.from<Dynamic, Dynamic>(
                      {
                        length: levelCount,
                      },
                      (input?: Dynamic, options?: Dynamic) => options + 1,
                    ).map(
                      (input?: Dynamic) =>
                        jsx(
                          ContextMenu.Item,
                          {
                            onClick: () => onGroupLevelChosen(lines, input),
                            children: showToLevelLabel(lines, input),
                          },
                          input,
                        ),
                    ),
                  ],
                }),
              ],
            }),
      ],
    });
  };
  let copyItem = jsx(ContextMenu.Item, {
    icon: 'Copy',
    shortcut: 'cmd+c',
    onClick: () => onCopyOrCutChosen('copy'),
    children: sheetMessages.copy(),
  });
  let makeChartItem =
    canInsertChart &&
    jsx(ContextMenu.Item, {
      icon: 'Chart',
      onClick: ({ detail: detail }: Dynamic) => onChartCardAsked(detail === 0),
      children: CHART_MESSAGES.makeChart(),
    });
  let makeChartItemShown = makeChartLatched.isIn && !isOfContextBar && makeChartItem;
  let clearSubmenu = jsxs(ContextMenu.Submenu, {
    children: [
      jsx(ContextMenu.SubmenuTrigger, {
        icon: 'Eraser',
        children: sheetMessages.clear(),
      }),
      jsxs(ContextMenu.SubmenuPopup, {
        ...contextBarPartProps,
        children: [
          jsx(ContextMenu.Item, {
            'aria-label': sheetMessages.clearContents(),
            shortcut: 'backspace',
            onClick: onClearChosen,
            children: sheetMessages.contentsToClear(),
          }),
          jsx(ContextMenu.Item, {
            'aria-label': sheetMessages.clearFormatting(),
            shortcut: shortcutFor('clearFormatting'),
            onClick: () =>
              onFormatChosen({
                clearsFormatting: true,
              }),
            children: sheetMessages.formattingToClear(),
          }),
        ],
      }),
    ],
  });
  let filterItems =
    ownFilterOffers !== null &&
    jsxs(Fragment, {
      children: [
        !holdsNoEdits &&
          jsx(ContextMenu.Item, {
            icon: 'Filter',
            onClick: onSortAndFilterAsked,
            children: sortAndFilterMessages.sortAndFilter(),
          }),
        ownFilterOffers.filter.kind === 'turnOn'
          ? holdsNoEdits &&
            jsx(ContextMenu.Item, {
              icon: 'Filter',
              onClick: onOwnFilterAsked,
              children: filterMessages.filter(),
            })
          : jsx(ContextMenu.Item, {
              icon: 'Filter',
              onClick: () => {
                if (ownFilterOffers.filter.kind === 'remove') onOwnFilterRemoved(ownFilterOffers.filter.tableKey);
              },
              children: filterMessages.clearFilter(),
            }),
        ownFilterOffers.valueOfCell !== null &&
          jsxs(Fragment, {
            children: [
              jsx(ContextMenu.Item, {
                icon: 'Filter',
                onClick: () => onOwnFilterByCellChosen('only'),
                children: jsx('bdi', {
                  className: 'sheet-menu-value',
                  children: showOnlyValueLabel(ownFilterOffers.valueOfCell),
                }),
              }),
              jsx(ContextMenu.Item, {
                icon: 'Filter',
                onClick: () => onOwnFilterByCellChosen('allBut'),
                children: jsx('bdi', {
                  className: 'sheet-menu-value',
                  children: leaveOutValueLabel(ownFilterOffers.valueOfCell),
                }),
              }),
            ],
          }),
      ],
    });
  let formatAsTableItem =
    formatAsTableOffer !== null &&
    jsx(ContextMenu.Item, {
      ...(holdsNoEdits && {
        icon: 'Table',
      }),
      checked: formatAsTableOffer.isOn,
      onClick: () => onFormatAsTableChosen(!formatAsTableOffer.isOn),
      children: sheetMessages.formatAsTable(),
    });
  let figureItems =
    figures !== null &&
    SUM_BAR_AGGREGATES.map(
      (input?: Dynamic) =>
        jsx(
          ContextMenu.Item,
          {
            onClick: () => onFigureChosen(input),
            children: figureWithValueLabel(input, formatNumberWithSigns(figures[input], figures.signsOfNumbers)),
          },
          input,
        ),
    );
  let isLinkByHandOffered = !isOfContextBar && selectionIsOf === 'cells' && linkByHandOffered !== null;
  let isLinkEdit = isLinkByHandOffered && linkByHandOffered === 'edit';
  let linkByHandItem = jsx(MenuItemWithWhyOff, {
    icon: linkByHandOffered === 'edit' ? 'Edit' : 'Link',
    ...(doesKeyOpenLinkForm && {
      shortcut: shortcutKeysFor('addLink'),
    }),
    disabled: linkByHandOffered === 'notOnFormula',
    whyOff: linkByHandOffered === 'notOnFormula' ? linkEditMessages.whyNoLinkByHand() : null,
    isPointerCoarse: isPointerCoarse,
    onClick: onLinkFormAsked,
    children: linkByHandOffered === 'edit' ? sheetMessages.editLink() : linkEditMessages.insertLink(),
  });
  let menuCommands = () =>
    cellMenuCommands({
      ...(isOpen ? menuProps : keptMenuProps),
      iconOfChange: iconOfChange,
      keyThatPastes: keyThatPastes,
      onLinkOpened: onLinkOpened,
      onLinkCopied: onLinkCopied,
      onLinkFormAsked: onLinkFormAsked,
      onCopyOrCutChosen: onCopyOrCutChosen,
      onPasteChosen: onPasteChosen,
      onCommentChosen: onCommentChosen,
      onClearChosen: onClearChosen,
      onChangeChosen: onChangeChosen,
      onSortAndFilterAsked: onSortAndFilterAsked,
      onOwnFilterByCellChosen: onOwnFilterByCellChosen,
      onOwnFilterRemoved: onOwnFilterRemoved,
      onFormatAsTableChosen: onFormatAsTableChosen,
      onFreezeChosen: onFreezeChosen,
      onFormatChosen: onFormatChosen,
      onConditionalFormatsAsked: onConditionalFormatsAsked,
      onSortPaneAsked: onSortPaneAsked,
      onCellHistoryAsked: onCellHistoryAsked,
    });
  let areRulesSuggested = isFieldOnTop && rulesSuggested !== null;
  let ruleSuggestionCommands = suggestedRuleCommands(areRulesSuggested ? rulesSuggested : [], {
    onPointedAt: onSuggestedRulePointedAt,
    onTaken: onSuggestedRuleTaken,
  });
  let ruleCommandsOfMenu = areRulesSuggested ? ruleCommands(onRulesAsked) : [];
  let suggestedRuleOf = ({ id: id }: Dynamic) => ruleSuggestionCommands.find((input?: Dynamic) => input.id === id);
  let commandsCache: Dynamic = null;
  let gatherCommands = () => {
    let menuCommands2 = menuCommands();
    return {
      idsOfMenu: new (Set as Dynamic)([...menuCommands2, ...ruleSuggestionCommands, ...ruleCommandsOfMenu].map(({ id: id }: Dynamic) => id)),
      all: [
        ...mergeMenuAndBarCommands(menuCommands2, commandsOfBar()).filter(
          ({ id: id }: Dynamic) => !areRulesSuggested || id !== 'menu.conditionalFormatting',
        ),
        ...ruleSuggestionCommands,
        ...ruleCommandsOfMenu,
      ],
    };
  };
  let commandsOfMenu = () => ((commandsCache ??= gatherCommands()), commandsCache);
  let littleWords = React.useMemo(() => toolSearchMessages.littleWords(), []);
  let namesOfAgent = React.useMemo(() => toolSearchMessages.namesOfAgent(), []);
  let namesAgent = (text?: Dynamic) =>
    normalizeMenuWords(text)
      .split(/[^\p{L}\p{M}\p{N}]+/u)
      .some((input?: Dynamic) => input !== '' && namesOfAgent.has(input));
  let wordsOfAQuestion = React.useMemo(() => toolSearchMessages.wordsOfAQuestion(), []);
  let isQuestion = (text?: Dynamic) =>
    normalizeMenuWords(text)
      .split(/[^\p{L}\p{M}\p{N}]+/u)
      .some((input?: Dynamic) => input !== '' && wordsOfAQuestion.has(input));
  let typedCommandsCache = new (Map as Dynamic)();
  let typedCommandsOf = (typed2?: Dynamic) => {
    let cached = typedCommandsCache.get(typed2);
    if (cached !== undefined) return cached;
    let ofTyped = commandsOfTyped(typed2);
    let found = {
      ofTyped: ofTyped,
      byName: ofTyped === null ? commandsByName(typed2) : [],
    };
    typedCommandsCache.set(typed2, found);
    return found;
  };
  let commandsOfTypedWords = (input?: Dynamic) => typedCommandsOf(input).ofTyped;
  let commandsNamedBy = (input?: Dynamic) => typedCommandsOf(input).byName;
  let guessedCommands = (typed2?: Dynamic) => {
    let commands = commandsOfMenu().all.filter(({ id: id }: Dynamic) => !id.startsWith('menu.ownFilter.'));
    let corrected = correctedCommandQuery(commands, typed2, littleWords);
    let found = (
      corrected === null ? [] : searchCommands(commands.map(asEnabledCommand), corrected, MAX_COMMANDS_FOUND, littleWords)
    ).flatMap(({ id: id }: Dynamic) => commands.find((input?: Dynamic) => input.id === id) ?? []);
    let sharesDistinctWord = commandMatchesDistinctWord(commands, corrected ?? typed2, littleWords);
    let fewest = (input?: Dynamic) =>
      oneCommandPerStem(input.filter((input2?: Dynamic) => isLightCommand(input2) && sharesDistinctWord(input2))).slice(
        0,
        MAX_GUESSED_COMMANDS,
      );
    let [first] = found;
    if (first !== undefined) return isLightCommand(first) ? fewest(found) : [];
    if (isQuestion(typed2)) return [];
    return fewest(commandsSharingWords(commands.filter(isCommandEnabled), corrected ?? typed2, littleWords));
  };
  let commandsLabelled = (typed2?: Dynamic) => {
    let labelled = commandsOfMenu().all.filter(({ label: label }: Dynamic) => labelsMatch(label, typed2));
    return labelled.some(isCommandEnabled) ? [] : labelled;
  };
  let foundCommandsCache = new (Map as Dynamic)();
  let foundCommands = (typed2?: Dynamic) => {
    let found = foundCommandsCache.get(typed2) ?? findCommands(typed2);
    foundCommandsCache.set(typed2, found);
    return found;
  };
  let findCommands = (typed2?: Dynamic) => {
    let sure = commandsFound(typed2);
    let commands = sure ?? guessedCommands(typed2);
    return {
      commands: commands,
      isGuess: sure === null && commands.length > 0,
    };
  };
  let commandsFound = (typed2?: Dynamic) => {
    let ofTyped = commandsOfTypedWords(typed2);
    if (ofTyped !== null) return ofTyped.commands.filter(isCommandEnabled);
    let labelled = commandsLabelled(typed2);
    if (labelled.length > 0) return labelled;
    if (namesAgent(typed2)) return [];
    let found = searchCommands(commandsOfMenu().all.filter(isCommandEnabled), typed2, MAX_COMMANDS_FOUND, littleWords);
    if (found.length > 0) return suggestedRulesFirst(found, typed2);
    if (
      wordsToFind(typed2) !== null ||
      searchCommands(commandsOfMenu().all, typed2, 1, littleWords).length > 0 ||
      commandsNamedBy(typed2).some(({ commands: commands }: Dynamic) => commands.length > 0)
    )
      return [];
    let [, beforeBy] = /^(.+?)\sby\s/i.exec(typed2.trim()) ?? [];
    let sortCommands = commandsOfMenu()
      .all.filter(({ id: id, whyNot: whyNot }: Dynamic) => whyNot === null && /\.(customSort|sortAndFilter)(\.|$)/.test(id))
      .map(withSingleOtherWords);
    let sortFound = (beforeBy === undefined ? [] : searchCommands(sortCommands, beforeBy, MAX_COMMANDS_FOUND, littleWords)).flatMap(
      ({ id: id }: Dynamic) => commandsOfMenu().all.find((input?: Dynamic) => input.id === id) ?? [],
    );
    return sortFound.length > 0 ? sortFound : null;
  };
  let isSearchTyped = (input?: Dynamic) => hasSearchWords(input) || commandsOfTypedWords(input) !== null;
  let [shownFind, setShownFind] = React.useState(null);
  let isSearching = isFieldOnTop && isSearchTyped(typed);
  if (isSearching && (shownFind?.words !== typed || shownFind.hadRules !== areRulesSuggested)) {
    let foundIds = foundCommands(typed).commands.map(({ id: id }: Dynamic) => id);
    let isNewlyOutOfUse = (input?: Dynamic) => !isCommandEnabled(input) && !foundIds.includes(input.id);
    setShownFind({
      words: typed,
      ids: foundIds,
      isOfNamedOutOfUse: commandsOfTypedWords(typed) === null && commandsLabelled(typed).length > 0,
      isGuess: foundCommands(typed).isGuess,
      idsOutOfUse: (
        commandsOfTypedWords(typed)?.commands.filter(isNewlyOutOfUse) ??
        searchCommands(commandsOfMenu().all.filter(isNewlyOutOfUse), typed, MAX_COMMANDS_FOUND, littleWords)
      ).map(({ id: id }: Dynamic) => id),
      hadRules: areRulesSuggested,
    });
  }
  if (!isSearching && shownFind !== null) setShownFind(null);
  let commandsWithIds = (typed2?: Dynamic, ids?: Dynamic) => {
    let commands = commandsOfTypedWords(typed2)?.commands ?? commandsOfMenu().all;
    return ids.flatMap((input?: Dynamic) => commands.find((input2?: Dynamic) => input2.id === input) ?? []);
  };
  let idsBackInUse =
    isSearching && shownFind?.words === typed
      ? commandsWithIds(typed, shownFind.idsOutOfUse)
          .filter(isCommandEnabled)
          .map(({ id: id }: Dynamic) => id)
      : [];
  if (shownFind !== null && shownFind.hadRules === areRulesSuggested && idsBackInUse.length > 0)
    setShownFind({
      ...shownFind,
      ids: [...shownFind.ids, ...idsBackInUse],
      idsOutOfUse: shownFind.idsOutOfUse.filter((input?: Dynamic) => !idsBackInUse.includes(input)),
    });
  let isOfNamedOutOfUse = (input?: Dynamic) =>
    shownFind?.words === input ? shownFind.isOfNamedOutOfUse : commandsOfTypedWords(input) === null && commandsLabelled(input).length > 0;
  let rowsFor = (input?: Dynamic) =>
    shownFind?.words === input ? commandsWithIds(input, shownFind.ids) : foundCommands(input).commands;
  let isGuessFor = (input?: Dynamic) => (shownFind?.words === input ? shownFind.isGuess : foundCommands(input).isGuess);
  let ruleTryOn = useRuleTryOn(
    isOpen && isSearching ? rowsFor(typed).flatMap((input?: Dynamic) => suggestedRuleOf(input) ?? []) : [],
  );
  let [anchorDoneWith, setAnchorDoneWith] = React.useState(null);
  let takeCommand = (command?: Dynamic, byKey?: Dynamic) =>
    onCommandTaken(byKey, () => {
      if (command.keepsOpen !== true) setAnchorDoneWith(anchor);
      if (
        (!commandsOfMenu().idsOfMenu.has(command.id) || (handyman.state.is !== 'resting' && isTextStyleMenuCommand(command.id))) &&
        command.keepsOpen !== true
      )
        onClosed();
      command.run();
    });
  let stopRule = () => {
    onRuleStopped();
    onRuleLetGo();
    handyman.noteRuleLetGo();
  };
  let barCommands = () =>
    mergeMenuAndBarCommands(menuCommands(), commandsOfBar(), {
      runsAs: 'bar',
    });
  let askHandyman = (typed2?: Dynamic) => handymanHook.ask(typed2, barCommands(), canRuleBeAskedInWords);
  let handyman =
    handymanHook.state.is === 'answered'
      ? {
          ...handymanHook,
          state: withCommandsOfNow(handymanHook.state, barCommands(), toolUnavailableText),
        }
      : handymanHook;
  let askHandymanAgain = (typed2?: Dynamic) => {
    onRuleLetGo();
    askHandyman(typed2);
  };
  let canAttachToChat = isChatToBeHad === true && hasAddressForAgent;
  let askContext = () => ({
    isFieldOnTop: isFieldOnTop,
    isChatToBeHad: isChatToBeHad,
    isCommentOffered: isCommentOffered,
    doCellsShowError: doCellsShowError,
    couldCommentGoToAgent: couldCommentGoToAgent(),
  });
  let canAttach = canAttachToChat || (hasAddressForAgent && isCommentToAgentOffered(askContext()));
  let isCutByOwnFilters = isSelectionCutByOwnFilters && canAskAgentHere(askContext());
  let isPlaceToAsk = (typed2?: Dynamic, rows?: Dynamic) =>
    (rows.length === 0 || isGuessFor(typed2) || /\s/.test(typed2.trim())) && !isOfContextBar;
  let offersSuggestTools = (typed2?: Dynamic, rows?: Dynamic) => isPlaceToAsk(typed2, rows) && isAgentHadForTools;
  let enterFindCache = new (Map as Dynamic)();
  let enterFindOf = (typed2?: Dynamic) => {
    let cached = enterFindCache.get(typed2);
    if (cached !== undefined) return cached;
    let commands = commandsOfMenu().all.map(asEnabledCommand);
    let found = searchCommands(commands, typed2, MAX_COMMANDS_FOUND, littleWords);
    let enterFind = {
      isAnyFound: found.length > 0,
      idTaken: commandToRunForQuery(found, typed2, commands, littleWords)?.id ?? null,
    };
    enterFindCache.set(typed2, enterFind);
    return enterFind;
  };
  let isEnterSureOf = (typed2?: Dynamic, command?: Dynamic) =>
    commandsOfMenu().all.every(isCommandEnabled) || enterFindOf(typed2).idTaken === command.id;
  let isAnyFoundFor = (input?: Dynamic) => enterFindOf(input).isAnyFound;
  let isAskAgentShown = askAgentLatched.isIn && !isOfContextBar;
  let whatEnterDoes = (typed2?: Dynamic, rows?: Dynamic) => {
    let sureRows = isGuessFor(typed2) ? [] : rows;
    let ofTyped = commandsOfTypedWords(typed2);
    let command =
      ofTyped === null
        ? commandToRunForQuery(sureRows, typed2, commandsOfMenu().all, littleWords)
        : ofTyped.isFirstMeant
          ? commandToRunForQuery(sureRows, null)
          : null;
    if (command !== null && (ofTyped !== null || isEnterSureOf(typed2, command)))
      return {
        does: 'takes',
        command: command,
      };
    if (sureRows.length > 0 && !sureRows.some(isCommandEnabled))
      return {
        does: isOfNamedOutOfUse(typed2) ? 'showsWhyNot' : 'nothing',
      };
    if (isRememberedCommandOutOfUse(rememberedCommand, typed2, commandsOfMenu().all))
      return {
        does: 'nothing',
      };
    let namedCommand = commandToRunForQuery(
      commandsNamedBy(typed2).flatMap(({ commands: commands }: Dynamic) => commands),
      null,
    );
    let hasOtherUse =
      sureRows.some(isCommandEnabled) || (namedCommand !== null && (isFunctionCommand(namedCommand) || isGoToTyped(typed2) || isAnyFoundFor(typed2)));
    if (!hasOtherUse && namedCommand !== null)
      return {
        does: 'takes',
        command: namedCommand,
      };
    let findWords = hasOtherUse ? null : wordsToFind(typed2);
    if (findWords !== null)
      return {
        does: 'finds',
        words: findWords,
      };
    let asks = whatAskFieldDoes({
      isPlaceToAsk: isPlaceToAsk(typed2, sureRows),
      isAgentToBeHadForTools: isAgentHadForTools,
      canAskAgent: isAskAgentShown && canAttach,
    });
    if (asks === 'tools')
      return {
        does: 'asksForTools',
      };
    let wouldLeaveSheet = askAgentVia(askContext()) === 'chat' && mightChatLeaveSheet();
    if (asks === 'agent' && !wouldLeaveSheet)
      return {
        does: 'asksAgent',
      };
    let words = wordsToFind(typed2) ?? typed2.trim();
    return words === ''
      ? {
          does: 'nothing',
        }
      : {
          does: 'finds',
          words: words,
        };
  };
  let enteredCommandOf = (command?: Dynamic, words?: Dynamic) => ({
    commandId: command.id,
    label: command.label,
    words: words,
    isWeighty: command.isWeighty === true,
    isItsLabelAlone: labelMatchesWordsInOrder(command, words, littleWords),
  });
  let commandAskedAgainOf = (typed2?: Dynamic) => {
    if (askedToConfirm === null || handyman.state.is !== 'resting') return null;
    let enter = whatEnterDoes(typed2, rowsFor(typed2));
    return enter.does === 'takes' && isCommandAskedAgain(askedToConfirm, enteredCommandOf(enter.command, typed2)) ? enter.command : null;
  };
  let enterMeaningOf = (typed2?: Dynamic) => {
    if (!isSearchTyped(typed2)) return 'none';
    let rows = rowsFor(typed2);
    let { does: does } = whatEnterDoes(typed2, rows);
    if (does === 'takes') return 'command';
    let hasOtherRows = rows.some(isCommandEnabled) || commandsNamedBy(typed2).length > 0;
    return does === 'showsWhyNot' || does === 'nothing' || hasOtherRows ? 'none' : 'ask';
  };
  let askAgentNow = () => {
    if (askAgentVia(askContext()) === 'comment') onAgentAskedInComment();
    else onAgentAsked(doCellsShowError);
  };
  let askAgentRow = (isUnderEnter: Dynamic = false) =>
    jsx(CommentNextRow, {
      isUnderEnter: isUnderEnter,
      isIn: askAgentLatched.isIn,
      isMenuOfContextBar: isOfContextBar,
      canAttach: canAttach,
      isOneRangeNeeded: isOneRangeNeeded,
      isCutByOwnFilters: isCutByOwnFilters,
      doCellsShowError: doCellsShowError,
      isPointerCoarse: isPointerCoarse,
      onAsked: askAgentNow,
    });
  let findInSheet = (words?: Dynamic) => {
    setAnchorDoneWith(anchor);
    onClosed();
    onFindAskedFor(words);
  };
  let describeCommand = ({ id: id }: Dynamic) =>
    id === 'menu.openLink' && linkToOpen !== null ? shortBreakableUrl(linkToOpen) : null;
  let hintOfCommand = (command?: Dynamic) =>
    commandHint(command, {
      activeCell: addressOfActiveCell,
      cellCount: selectedCellCount,
    });
  let searchField = {
    name: sheetMessages.searchInCellsMenu(),
    typed: typed,
    mostUnits: MAX_MENU_FIELD_LENGTH,
    onTyped(text?: Dynamic) {
      let clipped = clipMenuFieldText(text);
      if (typed === '' && clipped !== '') onSearchBegun();
      setTyped(clipped);
      handyman.noteTyped(clipped);
      if (clipped.trim() !== typed.trim() && rulesInMenu !== null) onRuleLetGo();
      setEnterMeaning(nextEnterMeaning(enterMeaning, enterMeaningOf(clipped), nowMs()));
      setAskedToConfirm(null);
    },
    takesCaretAtFirst: !wasAskedByKey && !isShut && !isWindowLeft && isOpen,
    isRowToTakeKeyboard: wasAskedByKey && !isShut && !isWindowLeft && isOpen,
    ...(!wasAskedToSearch && {
      onPastedWithNothingTyped: onPasteMeantForCells,
    }),
    hasRowsAtRest: !wasAskedToSearch,
    renderRowsFor(typed2?: Dynamic) {
      if (!isSearchTyped(typed2)) return null;
      if (handyman.state.is !== 'resting')
        return jsxs(Fragment, {
          children: [
            jsx(MenuFieldFocusKeeper, {
              isMenuOpen: isOpen,
            }),
            jsx(HandymanRows, {
              handyman: handyman,
              rules: rulesInMenu,
              onRuleKept: onRuleKept,
              onRuleStopped: stopRule,
              onAskedAgain: () => askHandymanAgain(typed2),
              isPointerCoarse: isPointerCoarse,
              describe: describeCommand,
              hintOf: hintOfCommand,
              onTaken: takeCommand,
              wayOnToChat: jsxs(Fragment, {
                children: [askAgentLatched.isIn && jsx(ContextMenu.Separator, {}), askAgentRow()],
              }),
            }),
          ],
        });
      let rows = rowsFor(typed2);
      let enter = whatEnterDoes(typed2, rows);
      let offersTools = offersSuggestTools(typed2, rows);
      let isNoneEnabled =
        !rows.some(({ whyNot: whyNot }: Dynamic) => whyNot === null) && enter.does !== 'finds' && enter.does !== 'showsWhyNot';
      let asksSomeone = enter.does === 'asksForTools' || enter.does === 'asksAgent';
      let groups = groupFoundCommands(
        rows.map(
          (input?: Dynamic) =>
            enter.does === 'takes' && enter.command.id === input.id
              ? {
                  ...input,
                  isUnderEnter: true,
                }
              : input,
        ),
      );
      let idOfRowAskedAgain = commandAskedAgainOf(typed2)?.id ?? null;
      let commandRows = (input?: Dynamic) =>
        jsx(CommandRows, {
          commands: input,
          isRowUnderEnterLit: true,
          idOfRowAskedAgain: idOfRowAskedAgain,
          hintOf: (input2?: Dynamic) => (suggestedRuleOf(input2) === undefined ? hintOfCommand(input2) : null),
          isPointerCoarse: isPointerCoarse,
          describe: (input2?: Dynamic) => suggestedRuleOf(input2)?.where ?? describeCommand(input2),
          onPointedAt: ruleTryOn.tryOnCells,
          onTaken: (input2?: Dynamic, options?: Dynamic) => {
            ruleTryOn.noteTaken();
            takeCommand(input2, options);
          },
        });
      let namedGroups = commandsNamedBy(typed2).map(
        ({ heading: heading, commands: commands }: Dynamic) => ({
          heading: heading,
          commands: commands.map(
            (input?: Dynamic) =>
              enter.does === 'takes' && enter.command.id === input.id
                ? {
                    ...input,
                    isUnderEnter: true,
                  }
                : input,
          ),
        }),
      );
      let openersGroup = namedGroups.length === 0 && groups.at(-1)?.isOfWhatOpens === true ? groups.at(-1) : undefined;
      let hasOpenersAmongGroups = openersGroup === undefined && groups.some((input?: Dynamic) => input.isOfWhatOpens);
      let askRows = jsxs(Fragment, {
        children: [
          offersTools &&
            jsx(SuggestToolsItem, {
              isUnderEnter: enter.does === 'asksForTools',
              onAsked: () => askHandyman(typed2),
            }),
          isAskAgentShown && askAgentRow(enter.does === 'asksAgent'),
        ],
      });
      let hasAskRows = offersTools || isAskAgentShown;
      let findWords = wordsToFind(typed2) ?? typed2.trim();
      let isFindLabelled =
        wordsToFind(typed2) !== null &&
        rows.some(
          ({ label: label, whyNot: whyNot }: Dynamic) => whyNot === null && label.toLowerCase().startsWith(typed2.trim().toLowerCase()),
        );
      let shownGroups = [...groups.filter((input?: Dynamic) => input !== openersGroup), ...namedGroups];
      let findItem =
        (!isFindLabelled || enter.does === 'finds') &&
        jsx(FindInSheetItem, {
          words: findWords,
          isUnderEnter: enter.does === 'finds',
          hint: commandGroupMessages.topBar(),
          onAsked: () => findInSheet(findWords),
        });
      let isFindFirst = enter.does === 'finds' && shownGroups.length > 0;
      return jsxs(Fragment, {
        children: [
          jsx(MenuFieldFocusKeeper, {
            isMenuOpen: isOpen,
          }),
          isOpen &&
            jsx(SuggestedRulesWanted, {
              onAsked: onSuggestedRulesWanted,
            }),
          asksSomeone && askRows,
          isFindFirst && findItem,
          (asksSomeone || isFindFirst) && shownGroups[0]?.heading === null && jsx(ContextMenu.Separator, {}),
          shownGroups.map(
            ({ heading: heading, commands: commands }: Dynamic, options?: Dynamic) =>
              jsxs(
                ContextMenu.Group,
                {
                  children: [
                    heading === null && options > 0 && jsx(ContextMenu.Separator, {}),
                    heading !== null &&
                      jsx(Menu.GroupLabel, {
                        children: heading,
                      }),
                    commandRows(commands),
                  ],
                },
                heading ?? '',
              ),
          ),
          rows.length === 0 &&
            namedGroups.length === 0 &&
            !hasAskRows &&
            jsx('div', {
              className: 'px-md py-sm text-footnote text-muted',
              children: menuMatchCountWords(0),
            }),
          !asksSomeone && isNoneEnabled && hasAskRows && shownGroups.length > 0 && jsx(ContextMenu.Separator, {}),
          !asksSomeone && isNoneEnabled && askRows,
          (!isFindFirst || openersGroup !== undefined || hasAskRows) &&
            jsxs(ContextMenu.Group, {
              children: [
                hasOpenersAmongGroups
                  ? jsx(ContextMenu.Separator, {})
                  : jsx(Menu.GroupLabel, {
                      children: commandGroupMessages.open(),
                    }),
                enter.does !== 'finds' && openersGroup !== undefined && commandRows(openersGroup.commands),
                !isFindFirst && findItem,
                enter.does === 'finds' && openersGroup !== undefined && commandRows(openersGroup.commands),
                !asksSomeone && !isNoneEnabled && askRows,
              ],
            }),
        ],
      });
    },
    onEntered(typed2?: Dynamic) {
      if (!isOpen || anchorDoneWith === anchor) return 'stay';
      if (handyman.state.is !== 'resting') return enterOnHandyman(handyman, takeCommand, onRuleKept, () => askHandymanAgain(typed2));
      let enter = whatEnterDoes(typed2, rowsFor(typed2));
      let isMeaningSettled = isEnterMeaningSettled(enterMeaning, nowMs());
      if (enter.does !== 'takes' && !isMeaningSettled) return 'stay';
      switch (enter.does) {
        case 'takes': {
          let entered = enteredCommandOf(enter.command, typed2);
          let outcome = enterOnTypedCommand(askedToConfirm, entered, isMeaningSettled);
          if (outcome === 'asks') setAskedToConfirm(entered);
          if (outcome !== 'takes') return 'stay';
          setAskedToConfirm(null);
          if ((takeCommand(enter.command, true), enter.command.keepsOpen !== true)) return 'shut';
          setRememberedCommand({
            id: enter.command.id,
            words: typed2,
          });
          return 'stay';
        }
        case 'finds':
          findInSheet(enter.words);
          return 'shut';
        case 'asksForTools':
          askHandyman(typed2);
          return 'stay';
        case 'asksAgent':
          setAnchorDoneWith(anchor);
          askAgentNow();
          return 'shut';
        case 'showsWhyNot':
          return 'lightOutOfUse';
        case 'nothing':
          return 'stay';
      }
    },
    onShutByEnter: onClosed,
    saidOf(typed2?: Dynamic, isSettled: Dynamic = true) {
      let rows = rowsFor(typed2);
      let enter = whatEnterDoes(typed2, rows);
      let enterWords = (
        {
          takes: enter.does === 'takes' ? enter.command.label : null,
          finds: enter.does === 'finds' ? findInSheetLabel(enter.words) : null,
          asksForTools: toolSearchMessages.suggestTools(),
          asksAgent: askAgentMenuLabel(doCellsShowError),
          showsWhyNot: null,
          nothing: null,
        } as Dynamic
      )[enter.does];
      let whyNot = isOfNamedOutOfUse(typed2) ? (rows[0]?.whyNot ?? null) : null;
      if (whyNot !== null) return whyNot;
      let sayEnter = enterWords === null || !isSettled ? null : enterWords;
      let count = rows.length + commandsNamedBy(typed2).flatMap(({ commands: commands }: Dynamic) => commands).length;
      return sayEnter === null ? menuMatchCountWords(count) : menuMatchCountChooseRowWords(count, sayEnter);
    },
  };
  let isAnnouncing = isOpen && !isShut && anchorDoneWith !== anchor && isSearching;
  let handymanWords = handymanStatusWords(handyman.state, rulesInMenu, menuMatchCountWords);
  let commandAskedAgain = commandAskedAgainOf(typed);
  if (askedToConfirm !== null && commandAskedAgain === null) setAskedToConfirm(null);
  let confirmAgainWords = commandAskedAgain === null ? null : pressEnterAgainToConfirmWords(commandAskedAgain.label);
  return jsxs('div', {
    className: 'contents',
    onPointerDown: ({ pointerType: pointerType }: Dynamic) => {
      if (pointerType !== 'touch') onClosed();
    },
    onContextMenu: (event?: Dynamic) => {
      if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
    },
    onPointerMove: ({ target: target }: Dynamic) => {
      if (commandAskedAgain === null || !(target instanceof Element)) return;
      let row = target.closest('[role^="menuitem"]');
      if (row !== null && row.getAttribute('data-command') !== commandAskedAgain.id) setAskedToConfirm(null);
    },
    children: [
      jsx(TypedSearchAnnouncer, {
        typed: typed,
        found: (input?: Dynamic) => isAnnouncing && handymanWords === null && confirmAgainWords === null && searchField.saidOf(typed, input),
        atOnce: isAnnouncing ? (confirmAgainWords ?? handymanWords) : null,
      }),
      jsx(ContextMenu.Root, {
        open: isOpen && !isShut,
        onOpenChange: (open?: Dynamic, details?: Dynamic) => {
          if (touchGuardCancelsClose(CELL_MENU_TOUCH_GUARD, open, details)) return;
          if (open) return;
          swallowPressAfterItemPress(details.reason, details.event);
          onClosed();
        },
        children: jsxs(MenuWithField, {
          field: isFieldOnTop ? searchField : null,
          ref: menuRef,
          ...(!isOfContextBar && {
            [MENU_ON_CELLS_ATTRIBUTE]: '',
          }),
          ...contextBarPartProps,
          ...(isOfHandleOfTable && {
            [MENU_OF_HANDLE_ATTRIBUTE]: '',
          }),
          ...ofChart?.mark,
          'aria-label': holdsOnlyFigures
            ? sheetMessages.figures()
            : isOfHandleOfTable
              ? sheetMessages.menuOfTable()
              : ofChart !== null
                ? chartMessages.menuOfChart()
                : sheetMessages.menu(),
          anchor: anchor,
          isOpen: isOpen,
          side: side ?? undefined,
          ...collisionProps,
          finalFocus: whatHasCaretAfter,
          onPointerDown: (input?: Dynamic) => input.stopPropagation(),
          onKeyDownCapture: (event?: Dynamic) => {
            let dropsAskedAgain = commandAskedAgain !== null && doesKeyDropAskedAgain(event.key, event.repeat);
            if (dropsAskedAgain) setAskedToConfirm(null);
            if (isOfHandleOfTable) {
              let litIndex = [...event.currentTarget.querySelectorAll('[role^="menuitem"]')].findIndex(
                (input?: Dynamic) => input.hasAttribute('data-highlighted'),
              );
              onKeyDownInMenuOfHandle(event, litIndex === -1 ? 'none' : litIndex === 0 ? 'first' : 'other');
            }
            if (event.isPropagationStopped()) return;
            if (dropsAskedAgain && event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            let doesEscapeStepBack = rulesInMenu?.doesEscapeStepBack === true;
            if (event.key === 'Escape' && (handyman.state.is === 'asking' || doesEscapeStepBack)) {
              event.preventDefault();
              event.stopPropagation();
              if (doesEscapeStepBack) stopRule();
              else handyman.stop();
              return;
            }
            let opensLink = (linkToOpen ?? linkToCopy) !== null && event.key === 'Enter' && isOnlyAltPressed(event);
            let isRepeatedPress = event.repeat && (event.key === 'Enter' || event.key === ' ');
            if (!opensLink && !isRepeatedPress) return;
            event.preventDefault();
            event.stopPropagation();
            let openLinkItem = openLinkItemRef.current ?? enabledCommandRow('menu.openLink', event.currentTarget);
            if (!isRepeatedPress) openLinkItem?.click();
            if (isRepeatedPress || linkToCopy === null) return;
            onClosed();
            onLinkCardAsked();
          },
          onMouseUpCapture: (event?: Dynamic) => {
            let { x: anchorX, y: anchorY } = anchor.getBoundingClientRect();
            let isAtAnchor = Math.hypot(event.clientX - anchorX, event.clientY - anchorY) < 4;
            if (event.button === 2 && isAtAnchor) event.stopPropagation();
          },
          onFocus: ({ target: target, currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) => {
            if (isOpen && !isShut) focusedInMenuRef.current = target;
            if (commandAskedAgain !== null && target.matches('[role^="menuitem"]') && target.getAttribute('data-command') !== commandAskedAgain.id)
              setAskedToConfirm(null);
            if (!isAskedByKey || target !== currentTarget) return;
            if (currentTarget.contains(relatedTarget)) return;
            currentTarget
              .querySelector('[role^="menuitem"]:is(:not([aria-disabled="true"]), [data-keeps-highlight]):not([data-not-lit-first])')
              ?.focus({
                focusVisible: true,
              });
          },
          children: [
            holdsNoEdits &&
              isCommentOffered &&
              !isOfContextBar &&
              jsxs(Fragment, {
                children: [
                  jsx(ContextMenu.Item, {
                    icon: 'Comment',
                    shortcut: 'alt+cmd+m',
                    onClick: onCommentChosen,
                    children: sheetMessages.comment(),
                  }),
                  jsx(ContextMenu.Separator, {}),
                ],
              }),
            holdsNoEdits &&
              jsxs(Fragment, {
                children: [
                  copyItem,
                  ownFilterOffers !== null && jsx(ContextMenu.Separator, {}),
                  filterItems,
                  formatAsTableOffer !== null && jsx(ContextMenu.Separator, {}),
                  formatAsTableItem,
                ],
              }),
            isOfHandleOfTable &&
              jsxs(Fragment, {
                children: [
                  jsx(ContextMenu.Item, {
                    icon: 'Filter',
                    onClick: onSortAndFilterAsked,
                    children: sortAndFilterMessages.sortAndFilter(),
                  }),
                  makeChartItem,
                  copyItem,
                  formatAsTableOffer?.isOn === true &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        jsx(ContextMenu.Item, {
                          icon: 'Table',
                          onClick: () => onFormatAsTableChosen(false),
                          children: sheetMessages.removeTableFormat(),
                        }),
                      ],
                    }),
                ],
              }),
            ofChart !== null &&
              jsxs(Fragment, {
                children: [
                  ofChart.canAgentChangeIt &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Item, {
                          icon: 'Edit',
                          onClick: () => cardUnderChart.current?.edit(ofChart.placementId),
                          children: chartMessages.editWithAgent(),
                        }),
                        jsx(ContextMenu.Separator, {}),
                      ],
                    }),
                  jsx(ContextMenu.Item, {
                    icon: 'Copy',
                    shortcut: 'cmd+c',
                    onClick: onChartCopyChosen,
                    children: chartMessages.copyChart(),
                  }),
                  jsx(ContextMenu.Separator, {}),
                  jsx(ContextMenu.Item, {
                    variant: 'danger',
                    icon: 'Trash',
                    shortcut: 'backspace',
                    onClick: ({ detail: detail }: Dynamic) => onChartDeleteChosen(detail === 0),
                    children: chartMessages.deleteChart(),
                  }),
                ],
              }),
            !holdsOnlyFigures &&
              !holdsNoEdits &&
              !isOfHandleOfTable &&
              ofChart === null &&
              jsxs(Fragment, {
                children: [
                  isOpen &&
                    isFieldOnTop &&
                    jsx(SuggestedRulesWanted, {
                      onAsked: onSuggestedRulesWanted,
                    }),
                  jsx(AskAgentMenuItems, {
                    isIn: askAgentLatched.isIn || fixLatched.isIn,
                    isMenuOfContextBar: isOfContextBar,
                    canAttach: isFieldOnTop ? canAttach : canAttachToChat,
                    isOneRangeNeeded: isOneRangeNeeded,
                    isCutByOwnFilters: isCutByOwnFilters,
                    doCellsShowError: doCellsShowError,
                    isPointerCoarse: isPointerCoarse,
                    isCommentNext: isCommentOffered,
                    onAsked: isFieldOnTop ? askAgentNow : onAgentAsked,
                    onFixAsked: canActiveCellBeFixedHere ? onFixAsked : null,
                    isFixYetToBeKnown: isFixOfActiveCellYetToBeKnown || (!askAgentLatched.isIn && !canActiveCellBeFixedHere),
                  }),
                  isCommentOffered &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Item, {
                          icon: 'Comment',
                          shortcut: 'alt+cmd+m',
                          ...(isOfContextBar && {
                            'data-not-lit-first': '',
                          }),
                          onClick: onCommentChosen,
                          children: sheetMessages.comment(),
                        }),
                        jsx(ContextMenu.Separator, {}),
                      ],
                    }),
                  linkToOpen !== null &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Item, {
                          ref: openLinkItemRef,
                          icon: 'ArrowOutSquare',
                          shortcut: OPEN_LINK_SHORTCUT,
                          description: shortBreakableUrl(linkToOpen),
                          descriptionDir: 'auto',
                          onClick: () => onLinkOpened(linkToOpen),
                          children: sheetMessages.openLink(),
                        }),
                        !isLinkEdit && jsx(ContextMenu.Separator, {}),
                      ],
                    }),
                  linkToCopy !== null &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Item, {
                          icon: 'Copy',
                          description: isLinkInWordsBuilt ? builtLinkWarning(breakableUrlText(linkToCopy)) : breakableUrlText(linkToCopy),
                          descriptionDir: 'auto',
                          onClick: () => onLinkCopied(linkToCopy),
                          children: sheetMessages.copyLinkAddress(),
                        }),
                        !isLinkEdit && jsx(ContextMenu.Separator, {}),
                      ],
                    }),
                  isLinkEdit &&
                    jsxs(Fragment, {
                      children: [linkByHandItem, jsx(ContextMenu.Separator, {})],
                    }),
                  jsx(MenuItemWithWhyOff, {
                    icon: 'Scissors',
                    shortcut: 'cmd+x',
                    disabled: isOneRangeNeeded,
                    whyOff: isOneRangeNeeded ? oneRangeNeededText('cut') : null,
                    isPointerCoarse: isPointerCoarse,
                    onClick: () => onCopyOrCutChosen('cut'),
                    children: sheetMessages.cut(),
                  }),
                  copyItem,
                  jsx(MenuItemWithWhyOff, {
                    icon: 'Clipboard',
                    shortcut: 'cmd+v',
                    disabled: heldToPaste === null,
                    whyOff: heldToPaste === null ? pasteFromMenuHint(keyThatPastes) : null,
                    isPointerCoarse: isPointerCoarse,
                    onClick: () => onPasteChosen('all'),
                    children: sheetMessages.paste(),
                  }),
                  jsx(MenuItemWithWhyOff, {
                    icon: 'PasteValues',
                    shortcut: 'shift+cmd+v',
                    disabled: !canPasteValuesOnly,
                    whyOff: canPasteValuesOnly ? null : pasteValuesFromMenuHint(heldToPaste, keyThatPastes),
                    isPointerCoarse: isPointerCoarse,
                    onClick: () => onPasteChosen('valuesOnly'),
                    children: sheetMessages.pasteValuesOnly(),
                  }),
                  jsx(ContextMenu.Separator, {}),
                  freezeItems(),
                  selectionIsOf === 'cells' &&
                    submenuOrOff({
                      icon: 'Add',
                      label: insertChoices.length > 0 ? sheetMessages.insert() : sheetMessages.insertLines(),
                      whyOff: isOneRangeNeeded && insertChoices.length === 0 ? sheetMessages.oneRangeNeededToInsertLines() : null,
                      rows: jsxs(Fragment, {
                        children: [
                          insertChoices.map(insertChoiceItem),
                          insertChoices.length > 0 && jsx(ContextMenu.Separator, {}),
                          countedChangeItem('insertRowAbove', rowsAboveLabel, selectedRowCount),
                          countedChangeItem('insertRowBelow', rowsBelowLabel, selectedRowCount),
                          countedChangeItem('insertColumnLeft', columnsLeftLabel, selectedColumnCount),
                          countedChangeItem('insertColumnRight', columnsRightLabel, selectedColumnCount),
                        ],
                      }),
                    }),
                  selectionIsOf === 'cells' && makeChartItemShown,
                  isLinkByHandOffered && !isLinkEdit && linkByHandItem,
                  selectionIsOf === 'rows' &&
                    jsxs(Fragment, {
                      children: [
                        changeItem('insertRowAbove', insertRowsAboveLabel(selectedRowCount), false, null, shortcutFor('insertRowsOrColumns')),
                        changeItem('insertRowBelow', insertRowsBelowLabel(selectedRowCount)),
                      ],
                    }),
                  selectionIsOf === 'columns' &&
                    jsxs(Fragment, {
                      children: [
                        changeItem('insertColumnLeft', insertColumnsLeftLabel(selectedColumnCount), false, null, shortcutFor('insertRowsOrColumns')),
                        changeItem('insertColumnRight', insertColumnsRightLabel(selectedColumnCount)),
                      ],
                    }),
                  selectionIsOf !== 'cells' && makeChartItemShown,
                  selectionIsOf === 'rows' &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        changeItem('moveRowsUp', moveRowsUpLabel(selectedRowCount), !canMoveSelectionBack),
                        changeItem('moveRowsDown', moveRowsDownLabel(selectedRowCount), !canMoveSelectionOn),
                      ],
                    }),
                  selectionIsOf === 'columns' &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        changeItem('moveColumnsLeft', moveColumnsLeftLabel(selectedColumnCount), !canMoveSelectionBack),
                        changeItem('moveColumnsRight', moveColumnsRightLabel(selectedColumnCount), !canMoveSelectionOn),
                      ],
                    }),
                  jsx(ContextMenu.Separator, {}),
                  clearSubmenu,
                  areDropdownsSelected &&
                    jsx(ContextMenu.Item, {
                      icon: 'Minus',
                      onClick: () =>
                        onFormatChosen({
                          removesDropdown: true,
                        }),
                      children: sheetMessages.removeDropdown(),
                    }),
                  selectionIsOf === 'cells' &&
                    submenuOrOff({
                      icon: 'Trash',
                      label: sheetMessages.deleteLines(),
                      whyOff: whyNoDeleteLines,
                      rows: jsxs(Fragment, {
                        children: [
                          countedChangeItem('deleteRows', rowCountLabel, selectedRowCount, !canDeleteSelectedRows, sheetMessages.sheetNeedsARow()),
                          countedChangeItem(
                            'deleteColumns',
                            columnCountLabel,
                            selectedColumnCount,
                            !canDeleteSelectedColumns,
                            sheetMessages.sheetNeedsAColumn(),
                          ),
                        ],
                      }),
                    }),
                  selectionIsOf === 'rows' &&
                    changeItem(
                      'deleteRows',
                      deleteRowsLabel(selectedRowCount),
                      !canDeleteSelectedRows,
                      sheetMessages.sheetNeedsARow(),
                      shortcutFor('deleteRowsOrColumns'),
                    ),
                  selectionIsOf === 'columns' &&
                    changeItem(
                      'deleteColumns',
                      deleteColumnsLabel(selectedColumnCount),
                      !canDeleteSelectedColumns,
                      sheetMessages.sheetNeedsAColumn(),
                      shortcutFor('deleteRowsOrColumns'),
                    ),
                  (areWholeRowsSelected || areWholeColumnsSelected || groupChoices !== null) &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        areWholeRowsSelected && changeItem('resizeRows', resizeRowsLabel(rowCountToSize)),
                        areWholeColumnsSelected && changeItem('resizeColumns', resizeColumnsLabel(columnCountToSize)),
                        groupChoices !== null && groupItems(groupChoices),
                      ],
                    }),
                  columnToSortBy !== null &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        selectedCellCount === 1
                          ? jsxs(ContextMenu.Submenu, {
                              children: [
                                jsx(ContextMenu.SubmenuTrigger, {
                                  icon: 'Sort',
                                  children: sortMenuLabel(),
                                }),
                                jsxs(ContextMenu.SubmenuPopup, {
                                  ...contextBarPartProps,
                                  children: [
                                    sortItem('sheet', 'ascending', ascendingLabel(), false),
                                    sortItem('sheet', 'descending', descendingLabel(), false),
                                    jsx(ContextMenu.Separator, {}),
                                    jsx(ContextMenu.Item, {
                                      onClick: () => onSortPaneAsked('range'),
                                      children: customSortMessages.customSort(),
                                    }),
                                  ],
                                }),
                              ],
                            })
                          : jsxs(Fragment, {
                              children: [
                                canSortSelectedRange && sortSubmenu('range', columnToSortSelectedRangeBy),
                                sortSubmenu('sheet', columnToSortBy),
                              ],
                            }),
                      ],
                    }),
                  ownFilterOffers !== null &&
                    jsxs(Fragment, {
                      children: [columnToSortBy === null && jsx(ContextMenu.Separator, {}), filterItems],
                    }),
                  freezeChoices !== null &&
                    selectionIsOf === 'cells' &&
                    jsxs(Fragment, {
                      children: [
                        columnToSortBy === null && ownFilterOffers === null && jsx(ContextMenu.Separator, {}),
                        jsxs(ContextMenu.Submenu, {
                          children: [
                            jsx(ContextMenu.SubmenuTrigger, {
                              icon: 'Pin',
                              children: sheetMessages.freeze(),
                            }),
                            jsx(ContextMenu.SubmenuPopup, {
                              ...contextBarPartProps,
                              children: FREEZE_MENU_LINES.map(
                                ({ what: what, inWords: inWords, whyNoRoom: whyNoRoom }: Dynamic) =>
                                  jsxs(
                                    React.Fragment,
                                    {
                                      children: [
                                        what === 'columns' && jsx(ContextMenu.Separator, {}),
                                        jsx(ContextMenu.Group, {
                                          children: freezeChoices[what].map(
                                            ({ count: count, isInForce: isInForce, isRoom: isRoom }: Dynamic) =>
                                              jsx(
                                                MenuItemWithWhyOff,
                                                {
                                                  checked: isInForce,
                                                  checkedRole: 'radio',
                                                  disabled: !isRoom,
                                                  whyOff: isRoom ? null : whyNoRoom(),
                                                  isPointerCoarse: isPointerCoarse,
                                                  onClick: () => onFreezeChosen(what, count),
                                                  children: inWords(count),
                                                },
                                                count,
                                              ),
                                          ),
                                        }),
                                      ],
                                    },
                                    what,
                                  ),
                              ),
                            }),
                          ],
                        }),
                      ],
                    }),
                  !isOfContextBar &&
                    (canMergeSelection || canUnmergeSelection) &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        canMergeSelection && changeItem('mergeCells', sheetMessages.mergeCells()),
                        canUnmergeSelection && changeItem('unmergeCells', sheetMessages.unmergeCells()),
                      ],
                    }),
                  formatOfSelection !== null &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        formatOfSelection.holdsTextToConvert && changeItem('convertTexts', sheetMessages.convertTextToNumbers()),
                        jsxs(ContextMenu.Submenu, {
                          children: [
                            jsx(ContextMenu.SubmenuTrigger, {
                              icon: 'TextAa',
                              children: sheetMessages.formatting(),
                            }),
                            jsxs(ContextMenu.SubmenuPopup, {
                              ...contextBarPartProps,
                              children: [
                                FONT_MARKS.map(
                                  (input?: Dynamic) =>
                                    jsx(
                                      ContextMenu.Item,
                                      {
                                        checked: formatOfSelection.togglesOn[input],
                                        shortcut: formatToggleShortcut(input),
                                        onClick: () =>
                                          onFormatChosen({
                                            toggle: input,
                                          }),
                                        children: textStyleLabel(input),
                                      },
                                      input,
                                    ),
                                ),
                                jsx(ContextMenu.Separator, {}),
                                jsx(TextWrappingItems, {
                                  shared: formatOfSelection.shared,
                                  onChosen: onFormatChosen,
                                  hasHeading: true,
                                }),
                                formatAsTableOffer !== null && jsx(ContextMenu.Separator, {}),
                                formatAsTableItem,
                              ],
                            }),
                          ],
                        }),
                        !isOfContextBar &&
                          !areRulesSuggested &&
                          jsx(ContextMenu.Item, {
                            icon: 'ConditionalFormat',
                            onClick: () => onConditionalFormatsAsked('menu'),
                            children: CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
                          }),
                        areRulesSuggested &&
                          jsx(SuggestedRulesSubmenu, {
                            icon: 'ConditionalFormat',
                            label: CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
                            headingOfSuggestions: CONDITIONAL_FORMATTING_WORDS.suggested(),
                            suggestions: ruleSuggestionCommands,
                            openers: ruleCommandsOfMenu,
                            isPointerCoarse: isPointerCoarse,
                            onTaken: takeCommand,
                          }),
                      ],
                    }),
                  figures !== null &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        jsxs(ContextMenu.Submenu, {
                          children: [
                            jsx(ContextMenu.SubmenuTrigger, {
                              icon: 'Sigma',
                              children: addFormulaUnderNumbersLabel(null),
                            }),
                            jsx(ContextMenu.SubmenuPopup, {
                              ...contextBarPartProps,
                              children:
                                figures.heading === null
                                  ? figureItems
                                  : jsxs(ContextMenu.Group, {
                                      children: [
                                        jsx(Menu.GroupLabel, {
                                          children: jsx('bdi', {
                                            children: shortHeadingLabel(figures.heading),
                                          }),
                                        }),
                                        figureItems,
                                      ],
                                    }),
                            }),
                          ],
                        }),
                      ],
                    }),
                  isCellHistoryOffered &&
                    jsxs(Fragment, {
                      children: [
                        jsx(ContextMenu.Separator, {}),
                        jsx(ContextMenu.Item, {
                          icon: 'History',
                          onClick: onCellHistoryAsked,
                          children: cellHistoryMessages.show(),
                        }),
                      ],
                    }),
                ],
              }),
            holdsOnlyFigures &&
              figures !== null &&
              jsxs(ContextMenu.Group, {
                children: [
                  jsx(Menu.GroupLabel, {
                    children: addFormulaUnderNumbersLabel(figures.heading),
                  }),
                  figureItems,
                ],
              }),
          ],
        }),
      }),
    ],
  });
});
