import { DEFAULT_TOAST_TIMEOUT_MS } from '../kit/toast.tsx';
import { Surface } from '../kit/surface.tsx';
import { UiRoot } from '../kit/theme.tsx';
import { useStore } from 'zustand';
import { useConnectionProblem } from '../shell/connection-news.ts';
import { rotatedResizeCursor } from '../kit/selection-frame.tsx';
import { likelyHasKeyboard, subscribeSheetMedia } from '../kit/platform.ts';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import { TooltipGroup } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { TOOLBAR_TAB_STOP_SELECTOR, toolbarTabStopOf } from '../ui/toolbar/keys-hint.ts';
import {
  LINK_AMONG_TEXT_ATTR,
  LINK_IN_WORDS_ATTR,
  openLinkIfShown,
  openLinkUnlessCommentMode,
  linkPlaceOfUrl,
  openLinkFromKey,
  useLinkPressHandler,
  useLinkPressCursor,
  LINK_ADDRESS_ID,
} from '../links/cell-links-view.ts';
import {
  cellPositionOfElement,
  GridDrawing,
  ARE_ROWS_NAMED_HERE,
  boxInBody,
  zoomedEntryBox,
  cellEntryBoxStyle,
  entryGridlineOverlap,
  gridlinesDataAttribute,
  outlineBoxInBody,
} from '../grid/grid-drawing.ts';
import { pointInZoomedElement, unzoomLength, boxOnScreen, clampZoom, zoomToFit, zoomForFitting, withFitZoom, zoomedStyle, useZoom } from '../grid/zoom.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import {
  BlankCellWordsContext,
  BLANK_CELL_WORDS_BY_PLATFORM,
  textClearanceStyle,
  fillPaintStyle,
  textPaintStyle,
  paintDataAttributes,
  TextWidthProvider,
  SELECTION_SUMMARY_ID,
} from '../grid/cell-drawing.ts';
import { useCellsAsBefore, useChangesComingIn } from '../agent/changes-coming-in.ts';
import { useLingeringRows } from '../ui/lingering-rows.ts';
import { IS_IOS_BROWSER } from '../grid/cell-drawing-values.ts';
import { useLineKeys } from '../grid/line-keys.ts';
import { NO_WORDS_OF_LOAD } from '../shell/load-announcer.ts';
import { NO_CHAT_WITH_AGENT, MAX_ASK_WORDS_LENGTH, cleanAskWords } from '../agent/chat-with-agent.ts';
import { NO_CHART_MAKER, insertChartWrittenByAgent } from '../charts/new-charts.ts';
import { NO_AGENT_AI_COMMENTS } from '../comments/agent-ai-comments.ts';
import { noMouseAroundComments } from '../comments/mouse-around.ts';
import { NO_SORTS_BY_OTHERS } from '../tables/sorts-by-others.ts';
import {
  CHARTS_RUN_ON_NOTHING,
  findPlacedViewCaret,
  PLACED_VIEW_CARET_SELECTOR,
  isPlacedViewAskInput,
  placementIdOfElement,
  findPlacedViewAskInput,
  doesCaretStayWithPlacement,
  isInPlacedViewAskBox,
  isInPlacedViewControls,
  getPlacedViewRect,
  isInPlacedViewCardOrTools,
  placementIdAttributes,
  askWordsOfKind,
  howCaretComesToPlacedView,
  PlacedViewsLayer,
} from '../charts/placed-views-layer.ts';
import { DRAG_START_DISTANCE } from '../grid/geometry.ts';
import {
  useIsTrueForVisibleMs,
  LONG_RETRY_WARNING_MS,
  saveStatusCard,
  LONG_SAVE_NOTICE_DELAY_MS,
  nextIsLongSaveTold,
  lossNewsAtAllSaved,
  nextAllSavedSay,
  areEditsNewlyDropped,
  SAID_NOTICE_SHOWN_MS,
  nextLongCalculationSay,
  doesStepOutLeaveNotice,
  nextConnectionBackSay as nextConnectionBackSayImported,
  isNoticeApartFromSaveCard,
  SaveStatusToast,
  isSavingStoppedRefusal,
} from '../ui/save-status.ts';
import { useKeysOffCells, getKeysOffCellsState } from './keys-off-cells.ts';
import { preventMouseDownDefault, IS_APPLE_PLATFORM, isContextMenuClick, isTouchOrPenPointer, opensMenuAtPointer } from '../ui/dom-events.ts';
import { preventPageScrollOverField } from '../shell/touch-scroll-under-keyboard.ts';
import { isEntryEditor, entryEditorOf, isTextInputOrEntryEditor } from '../dom/entry-editor.ts';
import {
  useCellEntryFieldEvents,
  isWordsOfferedKeyDrawn,
  isOnWordsOfferedButton,
  WordsOfferedAnnouncer,
  WordsOffered,
  WordsOfferedButton,
} from '../editor/words-offered-view.ts';
import {
  useEntryBoxes,
  giveEntryBoxOfItsOwn,
  caretInEntryPatch,
  typingBoxOf,
  giveEntryBoxToFormat,
  forgetCaretPlacement,
  isPastingIntoEntryNow,
} from '../editor/entry-boxes.ts';
import { useTypingHoldForPanes } from '../ui/typing-hold.ts';
import {
  initialSidePaneWidth,
  focusPaneStart,
  focusSidePaneOrTitle,
  sheetBesideSidePaneProps,
  SHEET_BEHIND_SIDE_PANE_CLASS,
  SidePaneShutContext,
} from '../ui/side-pane/side-pane.ts';
import {
  useWaysInWaitedFor,
  useAnnouncementsUnderWay,
  useAgentAskedFromWaysIn,
  useWaysInShown,
  useWaysInOutOfSightReport,
  useEscapeSendsWaysInAway,
  useWaysInFocusKeeping,
} from '../ui/ways-in/ways-in-state.ts';
import { setWaysInShown } from '../ui/toolbar/ways-in-shown.ts';
import { useRoomKeptForGonePane } from '../ui/gone-pane-room.ts';
import {
  TOAST_SELECTOR,
  OPEN_DIALOG_SELECTOR,
  AT_FOOT_ATTRIBUTE,
  DIALOG_ROLE_SELECTOR,
  MOVED_WHILE_FADING_ATTRIBUTE,
  STATUS_ROLE_SELECTOR,
  isInsideUnpinnedToast,
  isInsideToast,
  hasInteractiveToast,
} from '../shell/ui-root.ts';
import { COLUMN_HEADER_HEIGHT, cellPaddingBesideBox } from '../grid/cell-metrics.ts';
import { clipBoxToShown, commentMarksAtPoint } from '../grid/view-boxes.ts';
import {
  boxesNoticesMustNotCover,
  shouldNoticesSitAtFoot,
  noticeSpotAtFoot,
  noticeLiftToClearCells,
  NOTICE_STACK_STEP_PX,
} from '../shell/notice-placement.ts';
import {
  takePressesAfterDelay,
  useColumnGripCalled,
  cellOfGripPressed,
  ColumnGrips,
  ColumnsRiding,
  UndoAgentTurnCard,
  DoneByAgentCard,
} from '../agent/done-by-agent.ts';
import { useCommentMode } from '../comments/comment-mode.ts';
import { commentCornerKeyOf, commentCardPlaces, markCommentLayersUnderMouse, didMouseLeaveIntoOverlay } from '../comments/card-places.ts';
import {
  OFFERS_AT_SELECTION_BUTTONS_SELECTOR,
  isInOffersAtSelection,
  focusNeighbourOffer,
  isInExpandedEntry,
  OffersAtSelection,
  ExpandedEntryFinishButton,
  ExpandButtonAtSelection,
} from '../ui/offers-at-selection.ts';
import {
  AT_END_OF_SHEET_FIELDS,
  isInAtEndOfSheet,
  isAtEndOfSheetInput,
  focusAtEndOfSheetField,
  ADD_MORE_COLUMNS_BUTTON_ID,
  AddAtEndOfSheet,
} from '../grid/add-at-end.ts';
import {
  ERRORS_OFFERED_ATTRIBUTE,
  isPlainTabWhileNavigating,
  didFocusLeaveByTab,
  partStepOfTabInEntry,
  hasShortcutModifier,
  askAgentToFixOfferedErrors,
  areMoreErrorsThanKnown,
  noteErrorsKnownOf,
  doesKeyStepBackIntoCellsButF6,
  isTrustedPlainTab,
  ErrorsOfferNotice,
} from '../formulas/fix/errors-notice.ts';
import {
  useIsComposing,
  withoutOfferWhenComposing,
  formulaOfferActiveDescendant,
  WaitForFormula,
  FormulaArriving,
  FormulaFromWordsHelp,
} from '../formulas/from-words/offer-list.ts';
import { watchWindowFocusLeft, createScrollGestureTimer, holdProgrammaticFocus, isTrustedPointerDownEvent } from './focus-guards.ts';
import { areFocusLeftChecksHeld, whenWindowBlurred, isFocusWithinSameMenu, whenBlurredToNothing } from '../grid/focus-left.ts';
import { hasElementAwaitingKeyboard, offerKeyboardWhenReady } from '../ui/keyboard-handoff.ts';
import { focusMoveOfKey, isActLeftToCtrlAlt, keyActOf, doesPopupLetLineBreak, listKindOfShortcut, movesCaretInEntry } from '../keys/key-acts.ts';
import { slideOffsetNow, useTabsAway, watchKeyboardSlides } from '../shell/tabs-away.ts';
import {
  getBottomSafeAreaInset,
  getKeyboardInset,
  setBarsInsetAtFoot,
  subscribeBottomInsets,
  useCoveredUnderCellsProperty,
  useFootInsetOf,
} from '../shell/bottom-insets.ts';
import {
  isOnPhone,
  isNarrowByTouch,
  isCoarsePointerNow,
  useNarrowPhone,
  useOnPhone,
  isTouchBelowSm,
  useCoarsePointer,
  useNarrowByTouch,
} from './media-queries.ts';
import { defaultRowHeightAtDensity } from '../grid/cell-metrics-values.ts';
import { useFormulaBarRemountKey } from '../editor/formula-bar-remount.ts';
import { isModalOpen } from '../ui/find.ts';
import { groupLevelCount, gridHeaderRoomStyle, groupMarginRoomStyle, GroupMargin } from '../grid/group-margin.ts';
import { useFormulaBarLines, firstLineWidthStyle } from '../editor/formula-bar-folding.ts';
import { isFormulaText, DROPDOWN_SCROLL_SLOP } from '../chips/dropdown-pane-edits.ts';
import { watchAnotherRangeKey } from '../selection/another-range-key.ts';
import { useAnnouncedLastDone, announcementOfLastDone } from '../ui/last-done-announcer.ts';
import { afterNextFrameOrTimeout } from '../utils/next-frame.ts';
import { useNameFlagsAtPointer } from '../presence/flags-at-pointer-hook.ts';
import { useFilterButtonPointedAt, FilterTableOutlines, FilterButtonsLayer } from '../tables/filter-buttons-layer.ts';
import {
  useTableHandleCall,
  tableKeyOfHandleAt,
  isAtTableHandleOverRowNumber,
  rowNumberUnderTableHandle,
  TableHandle,
} from '../tables/table-handle.ts';
import { useGridZoomGestures } from '../grid/zoom-gestures.ts';
import { useStepBackIntoCells, ReaderPageAnnouncer, ReadersScroller } from '../state/step-back-into-cells.ts';
import { useMarksOfImportExpiry } from '../import/marks-of-import-expiry.ts';
import { useErrorCardHover, errorCellUnderMouse, askFixOfErrorCard, ErrorCard } from '../formulas/error-card.ts';
import {
  useLinkCardHover,
  useLinkCardSeen,
  copyTextWithExecCommand,
  linkUnderMouse,
  linkAtPointerPoint,
  LinkCard,
} from '../links/link-hover-card.ts';
import { findStepShortcut, isFindShortcut, isReplaceShortcut, FindBarUnlessGivenUp } from '../ui/find-bar.ts';
import { isKeyboardShortcutsKey, isElementLiveAndNotInert, KeyboardShortcutsDialog } from '../ui/keyboard-shortcuts-dialog.ts';
import { isAllCommandsMenuKey, allCommandsMenuKeyAction, HideKeyboardButton } from '../keys/all-commands-menu-key.ts';
import { usePressGuardAfterViewMove } from '../ui/press-guard-after-view-move.ts';
import { CELL_HISTORY_CARD_ATTRIBUTE, CellHistoryPopover } from '../history/cell-history-popover.ts';
import { INITIAL_FOCUS_IS_SAFE_ATTRIBUTE } from '../import/discard-import-dialog.ts';
import {
  refocusInContextBar,
  useCaretAfterComment,
  createWindowFocusCheck,
  createFingerPressTracker,
  createFingerTapCaret,
  pickFocusTarget,
  isFocusOutsideSearchOrErrors,
} from '../grid/focus-keeping.ts';
import {
  shownSheetIdOf,
  dropAddedChartMaking,
  chartMakingForView,
  placedViewOfAddedChart,
  addedChartForCard,
  dropChartMakingOfNth,
  awaitedChartMaking,
  settleChartMaking,
  chartMakingOutcome,
  isAddedChartStillAtPress,
} from '../charts/chart-making.ts';
import { EMPTY_CLIPBOARD_CONTENT } from '../clipboard/formats.ts';
import { pasteChosenFrom, wasExecCommandHandled, pasteOfLastPutHere } from '../clipboard/page-clipboard.ts';
import { normalizeLineBreaks, flattenEnteredText, trimTrailingNewlines } from '../format/shown-text.ts';
import { isOneLineEditor, NAVIGATING_MODE, isMenuHoldingField } from '../state/transitions.ts';
import { MODIFIER_KEYS } from '../state/escape.ts';
import { isAltCommandPress, isFillDownOrRightKey, isCommandHeld, isTypingKey, latinKeyOf, readKeyPress } from '../keys/key-press.ts';
import { createPressTracker } from './press-tracker.ts';
import { giveUpPopupAround, CanTakeFocusContext } from '../ui/popup-given-up-on-blur.ts';
import { createPasteKeyTracker } from '../clipboard/paste-keys.ts';
import { TABLE_CARD_WIDTH, useHungTableCardPlace } from '../tables/hung-card-place.ts';
import { BLANK_AND_FORMULA_ENTRY_MODES, entryTextAfterKey } from '../editor/typed-keys.ts';
import { isOpenLinkShortcut } from '../links/url-display.ts';
import { swallowRepeatedDeleteKeys, swallowRestOfPress } from '../ui/press-swallow.ts';
import { CONTEXT_BAR_PART_ATTRIBUTE, isInClosingContextBar } from '../ui/toolbar-tooltip.ts';
import { isRepeatedEnterOrSpace } from '../ui/repeated-key-guards.ts';
import { placedViewKeyAct, isUndoOrFormulasToggle } from '../charts/placed-views.ts';
import { fontMarkOfShortcut } from '../editor/text-looks.ts';
import { defaultSheetName } from '../i18n/sheet-names.ts';
import {
  fixFieldsOfKeyPress,
  fixWaitingUnderPointer,
  pointClampedToRight,
  useFixPointer,
  useWhenKeyCame,
  FixPill,
} from '../formulas/fix/fix-pill.ts';
import { eventTimeMs, isBeforeAnswerSeen, AgentsAnswerHolds } from '../agent/answer-holds.ts';
import { useOverscrollBounce, overscrollOf } from '../ui/overscroll-bounce.ts';
import { useFingerFling } from '../grid/finger-fling.ts';
import { usePinchZoom } from '../grid/pinch-zoom.ts';
import { createChartTapTracker } from '../charts/chart-taps.ts';
import { createLineBoxPresses, undoOfferToShow, LingeringEntryInput, CalculatingSpinner } from '../editor/entry-field.ts';
import {
  NO_TAPS,
  isTapOnGrid,
  TAP_HOLD_LIMIT_MS,
  isSoonAfterCellTap,
  tapsAfterPress,
  tapsPressedOnLastTap,
  tapOnGrid,
  gridSpotAt,
  settleTaps,
  DOUBLE_TAP_GAP_MS,
  TAP_SLOP_PX,
  mayTapBeTold,
  tapsAfterLift,
} from '../selection/finger-taps.ts';
import { armCellMenuTouchGuard, MENU_ON_CELLS_ATTRIBUTE, CellContextMenu } from '../ui/cell-menu/cell-menu.ts';
import { isSumWithFormulaCell } from '../selection/figures.ts';
import { historyStepOfInputType, isHistoryOrDropInputType, isTypingInputType } from '../editor/commit-entry.ts';
import { isFilterBarAskOpen, whatHasCaretAfterOwnFilterCard, SortFilterCardPopover, OwnFilterBarView } from '../tables/own-filter-bar-view.ts';
import { isPaneMenuOfContextBar } from '../state/context-bar.ts';
import { SORT_BUTTON_ATTRIBUTE, CustomSortPane } from '../tables/sort-pane-view.ts';
import { contextBarMenuHandlers } from '../ui/context-bar-menus.ts';
import { isFormatMenuKeepingEntrySelection, isFormatChoiceKeepingEntrySelection } from '../ui/toolbar-entry-selection.ts';
import { sheetPrefixForFormula } from '../formulas/references.ts';
import { GUESS_TABLE_FOR_ROWS_ASK } from '../tables/rows-asked-for.ts';
import { keyTargetAtTableMenu } from '../tables/table-handle-menu.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { POPUP_EDGE_GAP } from '../ui/popup-placement.ts';
import { exampleOfChoice } from '../format/number-format-choices.ts';
import { browserTimeZone } from './browser-locale.ts';
import {
  doesSelectionShowError,
  fixOfferInMenu,
  askAgentAboutSelection,
  askFixFromMenu,
  askFixesOfSelectedCellsFromMenu,
} from '../agent/ask-agent-menu.ts';
import { shouldEnterCommentForAgent, watchAgentAskedUnderAt } from '../agent/chat-or-comment.ts';
import { storeDensity } from './density-preference.ts';
import { readTablesNotFormatted, writeTablesNotFormatted } from '../tables/tables-not-formatted.ts';
import { whatHasCaretAfterFilterList, OwnFilterList } from '../tables/own-filter-list-view.ts';
import { askPersonActions } from '../chips/people-list.ts';
import { insertCellControl, cellControlInsertChoices } from '../ui/toolbar/number-format-menu.ts';
import { ConditionalAskCard } from '../format/conditional/ask-list.ts';
import { closeOpenMenusAndPopovers } from './page-guards.ts';
import { canSwitchSheetWhileEditing } from '../formulas/sheet-pointed-in.ts';
import { isFormulaAskedOrProposed } from '../formulas/from-words/actions.ts';
import { EVENTS_BEFORE_FILE_IMPORT } from '../import/text-file.ts';
import { useImportFilePicker, importFileChoices } from '../import/csv-file.ts';
import { PageFileDrop, canTakeDroppedFile } from '../import/page-file-drop.ts';
import { trackCellsAddedToChat, CellsAddedAnnouncer, AddedToMessageToast } from '../agent/added-to-message-notices.ts';
import { askAgentForRulesInChat, askAgentAboutRule } from '../format/conditional/ask-agent-about-rule.ts';
import { createPressForFixesTracker } from '../formulas/fix/press-for-fixes.ts';
import { chartMessages, chartChangeOutcomeWords } from '../messages/charts.ts';
import { SettledWordsAnnouncer, OpenedWordsAnnouncer, UndoOfferAnnouncer } from '../ui/settled-announcers.ts';
import { areFixesOnOffer, ErrorsAtOpeningAnnouncer, ErrorsAtOpeningToast } from '../formulas/fix/errors-at-opening.ts';
import { askChatAfterNoFix, NoFixAnnouncer, NoFixToast } from '../formulas/fix/no-fix-notice.ts';
import { undoOfferOfChartAdded, ChartNotAddedToast, chartAddedAnnouncement } from '../charts/chart-added-toast.ts';
import {
  chartKindName,
  chartCaptionOrName,
  chartKindNameOrAny,
  newChartTitle,
  CHART_MESSAGES,
  chartRefusalText,
  insertChartKindLabel,
} from '../charts/chart-words.ts';
import { CHART_END_WORDS, chartEndWordOfAgent, countChartAsk, chartAskKindWord } from '../agent/changes-by-agent.ts';
import { isSingleCellSample } from '../charts/cells-held.ts';
import { STOCK_CHART_PROGRAMS } from '../charts/stock-programs.ts';
import { isChartMadeByPage, INSERT_CHART_LABEL, chartAskPayload, chartOffersForPage, chartOfferAtSelection } from '../charts/chart-offers.ts';
import { shouldAskInChatInstead, chartAskFaultShown } from '../charts/ask-to-change-chart.ts';
import { ChartAskMenu } from '../charts/chart-ask-menu.ts';
import { SortFilterCardList } from '../tables/sort-filter-card.ts';
import { tableCardPlacement, hungCardUnderFilterButton } from '../tables/table-outlines.ts';
import { wrapTextTool } from '../ui/toolbar/wrap-text-tool.ts';
import { chartThumbnailIcon } from '../charts/chart-thumbnail.ts';
import { focusControlInWrapper, disabledByViewOnly, isWrapperOfDisabledControl } from '../ui/why-not.ts';
import { useImportOnGrid } from '../import/import-on-grid.ts';
import {
  saveStatusText,
  savingChangesText,
  allChangesSavedText,
  editingBackOnText,
  reconnectedText,
  calculatingFormulasText,
  formulasCalculatedText,
  noticeText,
  agentMissedMessageText,
} from '../i18n/notice-labels.ts';
import { noticeGivesWay } from '../state/queries.ts';
import {
  listAnnouncement,
  withHighlightedRowIdOr,
  comboboxAriaProps,
  listenForListUnderCellEvents,
  isListUnderCellRow,
  isRowFocusOnIos,
  isInListUnderCell,
} from '../ui/list-under-cell.ts';
import { dropdownListIds, firstDropdownListRowId, dropdownListSpokenWords, DropdownListUnderCell } from '../chips/dropdown-list.ts';
import { peopleListCardIds, peopleListLabel, peopleListRowWords, PeopleList } from '../chips/people-list-view.ts';
import { timeListActiveDescendant, TimeListPopup } from '../editor/time-list-popup.ts';
import { functionListActiveDescendant, OPENS_FUNCTION_LIST_ATTRIBUTE, FunctionHelp } from '../formulas/function-list.ts';
import { editingCellLabel, editingCellOnSheetLabel } from '../i18n/grid-action-labels.ts';
import { calendarCellComboboxProps, CalendarUnderCell } from '../chips/calendar-under-cell.ts';
import { entryEditorLineStyle, entryEditorStyle } from '../editor/ios-grown-editor.ts';
import { CHIP_FIELD_LINE_HEIGHT } from '../chips/field-of-chips.ts';
import { NO_REFERENCES, isEntryUntouched } from '../formulas/reference-pointing.ts';
import { addPeopleHint, PeopleField } from '../chips/people-field.ts';
import { contextToolsShapeOf, nextContextToolsState } from '../ui/toolbar/context-tools.ts';
import { FormattingToolbar } from '../ui/format-toolbar.ts';
import { searchMenuBarCommands, functionCommandsForFormula, functionCommandsForPrefix } from '../ui/search-menu/bar-commands.ts';
import { ViewMenu, viewCommands } from '../ui/view-menu.ts';
import { asThemeMode, THEME_CHOSEN_ATTRIBUTE, chooseSheetsTheme } from '../shell/root-theme.ts';
import { sheetSearchCommands } from '../ui/search-menu/sheet-commands.ts';
import { blankSheetChooser, dispatchFromSheetList, SheetPicker } from '../ui/sheet-tabs/sheet-picker.ts';
import { insertTools } from '../tools/insert-tools.ts';
import { atMenuOffers, personChipRemoveHint } from '../i18n/menu-labels.ts';
import { pickFunctionWhenSettled } from '../formulas/function-picked.ts';
import { goToSheetAndColumnCommands, goToCellsCommands, goToLabel } from '../ui/go-to-commands.ts';
import { hexColorCommands, borderCommandsFromWords, typedFontSizeCommands } from '../ui/search-menu/typed-format-commands.ts';
import { commandsUnderHeading } from '../ui/search-menu/command-groups.ts';
import { autocompleteFunctionsHeading, functionListLabel } from '../messages/formula-autocomplete.ts';
import { filterBarToAnnounce, FilterBarAnnouncer } from '../tables/filter-bar-announcer.ts';
import { isFieldInList } from '../ui/field-in-list.ts';
import { LINK_FORM_ATTR, LinkEditPopup } from '../links/link-edit-popup.ts';
import { formulaBarPlaceholder, CellEntryHint } from '../editor/entry-hint.ts';
import { FormulaBarReferenceHues } from '../editor/formula-bar-hues.ts';
import { versionHistoryMessages } from '../history/version-text.ts';
import { ThemeChangeNotice } from '../ui/theme-change-notice.ts';
import { SelectedRangeAnnouncer, PointedCellsAnnouncer } from '../ui/selection-announcers.ts';
import { AgentSaidAnnouncer } from '../agent/agent-said-announcer.ts';
import { EarlierVersionAnnouncer, EarlierVersionBar } from '../history/earlier-version-bar.ts';
import { WaysInHintAnnouncer, WaysInToolbar } from '../ui/ways-in/ways-in-toolbar.ts';
import { describeLastDone } from '../i18n/last-done-labels.ts';
import { shortcutListMessages } from '../messages/shortcut-labels.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { formulasTookTooLongWords, ERROR_DESCRIPTION_ID, errorExplanationWords } from '../messages/formula-errors.ts';
import { PeopleListAnnouncer } from '../chips/people-list-announcer.ts';
import { linkPositionText, commentModeHint, builtLinkAddressLabel } from '../i18n/status-labels.ts';
import { UndoOfferToast } from '../ui/undo-offer-toast.ts';
import { MountedToast } from '../ui/mounted-toast.ts';
import { SortsByOthersToast } from '../tables/sorts-by-others-toast.ts';
import { AgentUnavailableToast } from '../agent/agent-unavailable-toast.ts';
import { LeaveCellsHint } from '../ui/leave-cells-hint.ts';
import { CellsHeld } from '../tables/cells-held-copy.ts';
import { GridScrollbars } from '../grid/scrollbars.ts';
import { AddColumnsPopover } from '../ui/add-columns-popover.ts';
import { ContentsBox } from '../ui/contents-box.ts';
import { SelectionFigures } from '../ui/selection-figures.ts';
import { ConditionalFormattingPane } from '../format/conditional/pane.ts';
import { DropdownPane } from '../chips/dropdown-pane.ts';
import { VersionHistoryPane } from '../history/version-history-pane.ts';
import { ColumnWidthDialog } from '../grid/column-width-dialog.ts';
import { RowHeightDialog } from '../grid/row-height-dialog.ts';
import { SortScopeDialog } from '../tables/sort-scope-dialog.ts';
import { CustomNumberFormatDialog } from '../format/custom-number-format-dialog.ts';
import { HiddenTextPasteDialog } from '../clipboard/hidden-text-paste-dialog.ts';
import { LocaleTimeZoneDialog } from '../ui/locale-time-zone-dialog.ts';
import { ImportDialog } from '../import/import-dialog.ts';
import { ExportReadyDialog } from '../export/export-ready-dialog.ts';
import { DateInputLocaleContext } from '../chips/date-input.ts';
import { DRAG_SLOP } from '../selection/pointer.ts';
import { DangerWarningIcon } from '../ui/warning-icon.ts';
import { isoDayOfDate } from '../chips/calendar.ts';
export let lastObjectKey: Dynamic;
export function createDragHoldTracker(store?: Dynamic) {
  let held: Dynamic = null;
  let scrollNow = () => {
    let { rows: rows, columns: columns } = store.getView().grid.scroll;
    return {
      x: columns.by,
      y: rows.by,
    };
  };
  return {
    lastAt: () => held?.at ?? null,
    forget: () => void (held = null),
    movedTo(at: Dynamic, { pressedAt: pressedAt, isButtonDown: isButtonDown, isByFinger: isByFinger }: Dynamic) {
      held =
        (held !== null || !isWithinTapSlop(at, pressedAt)) && isButtonDown
          ? {
              atLastTime: null,
              times: 0,
              way: NO_DRAG_WAY,
              ...held,
              at: at,
              isByFinger: isByFinger,
            }
          : null;
      store.dispatch({
        kind: 'pointerDragged',
        ...at,
      });
    },
    timeCame(isPointerCaptured?: Dynamic) {
      let hold = held;
      if (hold === null) return;
      let isStill = hold.atLastTime !== null && isWithinTapSlop(hold.at, hold.atLastTime);
      hold.atLastTime = hold.at;
      if (!(store.getView().grid.isFingerSelecting ? isPointerCaptured : isStill) || store.isEventUnfinished()) return;
      hold.times += 1;
      if ((hold.way.x !== 0 || hold.way.y !== 0) && !hold.isByFinger && !isHeldStillTickToScroll(hold.times)) return;
      let scrollBefore = scrollNow();
      store.dispatch({
        kind: 'pointerDragged',
        ...hold.at,
        isHeldStill: true,
      });
      let scrollAfter = scrollNow();
      let way = {
        x: Math.sign(scrollAfter.x - scrollBefore.x),
        y: Math.sign(scrollAfter.y - scrollBefore.y),
      };
      if ((way.x !== 0 && way.x !== hold.way.x) || (way.y !== 0 && way.y !== hold.way.y)) hold.times = 0;
      hold.way = way;
    },
  };
}
export function toolPartWithMenuHolding(target: Dynamic, { barOfReader: barOfReader, ...parts }: Dynamic) {
  return TOOL_PARTS_WITH_MENUS.find(
    ({ part: part }: Dynamic) => (part === 'formatTools' ? (parts.formatTools ?? barOfReader) : parts[part])?.contains(target) === true,
  );
}
export function focusFirstMatching(holder?: Dynamic, selector?: Dynamic) {
  let candidates = selector === ':scope' ? [holder] : (holder?.querySelectorAll(selector) ?? []);
  for (let candidate of candidates as Dynamic)
    if (
      (candidate?.focus({
        preventScroll: true,
      }),
      candidate !== null && candidate === candidate.ownerDocument.activeElement)
    )
      return true;
  return false;
}
export function scrollIntoSheetScroller(element?: Dynamic) {
  let scroller = element.closest('.sheet-scroller');
  if (scroller === null) return;
  let [{ left: elementLeft, right: elementRight }, scrollerBox] = [element.getBoundingClientRect(), scroller.getBoundingClientRect()];
  scroller.scrollLeft +=
    Math.min(0, elementLeft - SHEET_SCROLLER_MARGIN - scrollerBox.left) + Math.max(0, elementRight + SHEET_SCROLLER_MARGIN - scrollerBox.right);
}
export function focusFirstControl(holder?: Dynamic) {
  let isFocused = focusFirstMatching(holder, TOOLBAR_TAB_STOP_SELECTOR) || focusFirstMatching(holder, 'button:not(:disabled)');
  let activeElement = holder?.ownerDocument.activeElement ?? null;
  if (isFocused && activeElement !== null) scrollIntoSheetScroller(activeElement);
  return isFocused;
}
export function moveCaretToEndOfField(field?: Dynamic) {
  let text = field.value;
  field.value = '';
  field.value = text;
}
export function objectKey(object?: Dynamic) {
  let knownKey = objectKeys.get(object);
  if (knownKey !== undefined) return knownKey;
  lastObjectKey += 1;
  objectKeys.set(object, lastObjectKey);
  return lastObjectKey;
}
export function keepCaretAtEndOnTyping({
  currentTarget: currentTarget,
  key: key,
  ctrlKey: ctrlKey,
  metaKey: metaKey,
  keyCode: keyCode,
  nativeEvent: nativeEvent,
}: Dynamic) {
  let isComposing = nativeEvent.isComposing || keyCode === 229;
  if ((key.length === 1 || key === 'Dead') && !ctrlKey && !metaKey && !isComposing)
    currentTarget.setSelectionRange(currentTarget.value.length, currentTarget.value.length);
}
export function guardFieldHistoryUndo(field?: Dynamic) {
  let undoneToEmpty: Dynamic = false;
  let onBeforeInput = (event?: Dynamic) => {
    if (!event.inputType.startsWith('history')) return void (undoneToEmpty = false);
    let isUndo = event.inputType === 'historyUndo';
    let isBlocked = isUndo ? field.value === '' : undoneToEmpty;
    if (!field.hasAttribute('data-is-waiting') && !isBlocked) return;
    undoneToEmpty ||= isUndo;
    event.preventDefault();
  };
  field.addEventListener('beforeinput', onBeforeInput);
  return () => field.removeEventListener('beforeinput', onBeforeInput);
}
export function redispatchKeyToFocused(event?: Dynamic) {
  let isComposing = event.isComposing || event.keyCode === 229 || event.key === 'Dead';
  if (event.key === 'Tab' || isComposing) return;
  ReactDOM.flushSync(() => {
    return;
  });
  if ((event.view?.document.activeElement ?? null)?.dispatchEvent(redispatchedKeydown(event)) === false) event.preventDefault();
}
export function cellTextUnderPointer(
  textElement: Dynamic,
  grid: Dynamic,
  zoom: Dynamic,
  { rows: rows, columns: columns }: Dynamic,
  { clientX: clientX, clientY: clientY }: Dynamic,
) {
  let address = textElement.hasAttribute(LINK_AMONG_TEXT_ATTR) ? textElement.getAttribute(LINK_IN_WORDS_ATTR) : null;
  let inCell = cellPositionOfElement(textElement);
  if (address === null || inCell === null) return null;
  let lineRect =
    [...textElement.getClientRects()].find(({ top: lineTop, bottom: lineBottom }: Dynamic) => clientY >= lineTop && clientY <= lineBottom) ??
    textElement.getBoundingClientRect();
  let gridBox = grid.getBoundingClientRect();
  let left = Math.max(lineRect.left, gridBox.left, clientX - POINTER_TEXT_REACH_PX);
  let right = Math.min(lineRect.right, gridBox.right);
  return {
    address: address,
    inCell: inCell,
    box: {
      ...pointInZoomedElement(grid, zoom, {
        clientX: left,
        clientY: lineRect.top,
      }),
      width: unzoomLength(Math.max(0, right - left), zoom),
      height: unzoomLength(lineRect.height, zoom),
    },
    scroll: {
      scrollLeft: columns.by,
      scrollTop: rows.by,
    },
  };
}
export function scheduleWorkShownLongEnough(wait?: Dynamic, store?: Dynamic) {
  if (wait === null) return;
  let timer = setTimeout(
    () =>
      store.dispatch({
        kind: 'workShownLongEnough',
        wait: wait,
      }),
    wait.ms,
  );
  return () => clearTimeout(timer);
}
export function useZoomedVirtualAnchor(anchorRef?: Dynamic, zoom?: Dynamic, fallbackRect?: Dynamic) {
  let lastRectRef = React.useRef(fallbackRect);
  React.useLayoutEffect(() => {
    if (fallbackRect !== null) lastRectRef.current = fallbackRect;
  }, [fallbackRect]);
  return React.useMemo(
    () => ({
      getBoundingClientRect() {
        let element = anchorRef.current;
        if (element === null) return new (DOMRect as Dynamic)();
        let box = boxOnScreen(element, zoom, fallbackRect ?? lastRectRef.current ?? new (DOMRect as Dynamic)());
        return new (DOMRect as Dynamic)(box.x, box.y, box.width, box.height);
      },
    }),
    [anchorRef, zoom, fallbackRect],
  );
}
export function ReloadPageButton({ reload: reload }: Dynamic) {
  let [isReloading, setIsReloading] = React.useState(false);
  React.useEffect(() => {
    if (!isReloading) return;
    let timer = setTimeout(() => setIsReloading(false), RELOAD_BUTTON_BUSY_MS);
    return () => clearTimeout(timer);
  }, [isReloading]);
  return jsx(Button, {
    variant: 'secondary',
    size: 'sm',
    busy: isReloading,
    onClick: () => {
      setIsReloading(true);
      reload();
    },
    children: sheetMessages.reload(),
  });
}
export function SheetGridDrawing(props?: Dynamic) {
  let { rowsDrawn: rowsDrawn, columnHeaders: columnHeaders, pagesTurnedForReader: pagesTurnedForReader } = props.grid;
  return jsx(BlankCellWordsContext, {
    value: BLANK_CELL_WORDS_BY_PLATFORM,
    children: jsx(GridDrawing, {
      ...props,
      cellsAsBefore: useCellsAsBefore(props.grid),
      rows: useLingeringRows(rowsDrawn, pagesTurnedForReader, IS_IOS_BROWSER),
      keysOfColumns: useLineKeys(keysOfLines(columnHeaders), pagesTurnedForReader, IS_IOS_BROWSER),
      areRowsNamed: ARE_ROWS_NAMED_HERE,
    }),
  });
}
export function SheetsPage({
  store: store,
  clipboard: clipboard,
  reloadPage: reloadPage,
  shell: shell,
  atEndOfSheetBar: atEndOfSheetBar,
  isInStaffTrials = isNeverInStaffTrials,
  isAgentForToolsExpected = false,
  connectionNews: connectionNews,
  wordsOfLoad = NO_WORDS_OF_LOAD,
  caretAtFirst: caretAtFirst,
  isEarlierVersionLeft = false,
  oncePlaceholderIsOff = runAtOnce,
  chatWithAgent = NO_CHAT_WITH_AGENT,
  chartsMadeByPage = NO_CHART_MAKER,
  chartCardCounted = countsNothing,
  ownToolOfFormatCounted = countsNothing,
  commentsOfHost = NO_AGENT_AI_COMMENTS,
  commentsLayer = null,
  mouseAroundComments = noMouseAroundComments,
  sortsByOthers = NO_SORTS_BY_OTHERS,
  chartsRunOn = CHARTS_RUN_ON_NOTHING,
  changesOfCharts = null,
  chartsWrittenByAgent = null,
  gridZoom: gridZoom,
  isAgentWorkingNow = isAgentNeverWorking,
}: Dynamic) {
  let view = useStore(store.viewStore, store.getView);
  let zoom = useZoom(gridZoom);
  let [isColumnCountCardOpen, setIsColumnCountCardOpen] = React.useState(false);
  let wasColumnCountCardOpenRef = React.useRef(false);
  if (isColumnCountCardOpen && view.grid.headerThatAddsColumns === null) setIsColumnCountCardOpen(false);
  let pointInGrid = (event?: Dynamic) => pointInZoomedElement(event.currentTarget, zoom, event);
  let cellPointOf = (cell?: Dynamic, event?: Dynamic) => {
    let at = pointInGrid(event);
    let link = cellTextUnderPointer(cell, event.currentTarget, zoom, view.grid.scroll, event);
    return link === null
      ? {
          cell: cell,
          at: at,
        }
      : {
          cell: cell,
          at: at,
          link: link,
        };
  };
  let dragStartDistance = unzoomLength(DRAG_START_DISTANCE, zoom);
  let connection = useConnectionProblem(connectionNews);
  let isRetryingLong = useIsTrueForVisibleMs(view.saving === 'retrying', LONG_RETRY_WARNING_MS);
  let isEditingPaused = view.viewOnlyBecause === 'editingPaused';
  let saveStatusCard2 = saveStatusCard(view.saving, view.hasUnsavedEdits, connection, isRetryingLong, isEditingPaused);
  let [wasEditingPaused, setWasEditingPaused] = React.useState(isEditingPaused);
  let [isEditingBackNoticeShown, setIsEditingBackNoticeShown] = React.useState(false);
  if (isEditingPaused !== wasEditingPaused) {
    setWasEditingPaused(isEditingPaused);
    setIsEditingBackNoticeShown(!isEditingPaused && view.viewOnlyBecause === null);
  }
  let [announcedConnectionWords, setAnnouncedConnectionWords] = React.useState(null);
  let connectionWords = saveStatusCard2?.isAboutConnection === true && connection?.mayPass === true ? saveStatusCard2.words : null;
  if (announcedConnectionWords !== null && announcedConnectionWords !== connectionWords) setAnnouncedConnectionWords(null);
  let isSavingLong = useIsTrueForVisibleMs(view.saving === 'saving' && view.calculating !== 'underWay', LONG_SAVE_NOTICE_DELAY_MS);
  let [isLongSaveTold, setIsLongSaveTold] = React.useState(false);
  let nextIsLongSaveTold2 = nextIsLongSaveTold(isLongSaveTold, isSavingLong, view.saving);
  if (nextIsLongSaveTold2 !== isLongSaveTold) setIsLongSaveTold(nextIsLongSaveTold2);
  let [allSavedSay, setAllSavedSay] = React.useState('none');
  let [lossNews, setLossNews] = React.useState(null);
  let nextLossNews = lossNewsAtAllSaved(lossNews, allSavedSay, view);
  if (nextLossNews !== lossNews) setLossNews(nextLossNews);
  let nextAllSavedSay2 = nextAllSavedSay(allSavedSay, {
    saving: view.saving,
    isCardDue: saveStatusCard2 !== null,
    wereEditsDropped: areEditsNewlyDropped(view, nextLossNews),
  });
  if (nextAllSavedSay2 !== allSavedSay) setAllSavedSay(nextAllSavedSay2);
  let isAllSavedSaid = allSavedSay === 'said' || allSavedSay === 'saidInLine';
  if (useIsTrueForVisibleMs(isAllSavedSaid, SAID_NOTICE_SHOWN_MS) && isAllSavedSaid) setAllSavedSay('none');
  let [longCalculationSay, setLongCalculationSay] = React.useState('none');
  let isWorkPending = () => store.isWorkYetToReachWorkbook() || store.areFormulasLeft();
  let nextLongCalculationSay2 = nextLongCalculationSay(
    longCalculationSay,
    view,
    useStore(store.viewStore, isWorkPending),
  );
  if (nextLongCalculationSay2 !== longCalculationSay) setLongCalculationSay(nextLongCalculationSay2);
  if (useIsTrueForVisibleMs(longCalculationSay === 'endSaid', SAID_NOTICE_SHOWN_MS) && longCalculationSay === 'endSaid')
    setLongCalculationSay('none');
  let isViewOnly = view.viewOnlyBecause !== null;
  let versionLook = view.versionHistory?.look ?? null;
  let [isRestoreInBar, setIsRestoreInBar] = React.useState(false);
  let { doCellsTakeNoText: doCellsTakeNoText2, wasSomethingKeptOff: wasSomethingKeptOff } = useKeysOffCells();
  let canPersonEdit = view.viewOnlyBecause !== 'readOnly';
  let cellsRef = React.useRef(null);
  let zoomedGridRef = React.useRef(null);
  let cellEditorRef = React.useRef(null);
  let pendingTypingRef = React.useRef(null);
  let typingFieldRef = React.useRef(null);
  let activeEditorRef = React.useRef(null);
  let cellEditorCleanupRef = React.useRef(null);
  let setCellEditorElement = React.useCallback((element?: Dynamic) => {
    cellEditorCleanupRef.current?.();
    cellEditorCleanupRef.current = element === null ? null : guardFieldHistoryUndo(element);
    cellEditorRef.current = element;
    activeEditorRef.current = typingFieldRef.current ?? element;
  }, []);
  let typingFieldCleanupRef = React.useRef(null);
  let setTypingFieldElement = React.useCallback((element?: Dynamic) => {
    typingFieldCleanupRef.current?.();
    typingFieldCleanupRef.current = element === null ? null : preventPageScrollOverField(element);
    typingFieldRef.current = element;
    activeEditorRef.current = element ?? cellEditorRef.current;
    if (element !== null && !isEntryEditor(element)) moveCaretToEndOfField(element);
  }, []);
  let gridFocusRef = React.useRef(null);
  let getGridOrEditorElement = React.useCallback(
    () => (areCellsOffLimits(store.getView()) ? gridFocusRef : cellEditorRef).current,
    [store],
  );
  let getSelectedPlacementId = React.useCallback(
    () => store.getView().grid.placedViews.find(({ isSelected: isSelected }: Dynamic) => isSelected)?.placementId ?? null,
    [store],
  );
  let getCaretElement = React.useCallback(
    (placementId: Dynamic = getSelectedPlacementId()) => {
      if (whereTypingGoes(store.getView()) !== 'grid') return activeEditorRef.current;
      let ownerDocument = cellsRef.current?.ownerDocument;
      return (
        (placementId === null || ownerDocument === undefined ? null : findPlacedViewCaret(ownerDocument, placementId)) ?? getGridOrEditorElement()
      );
    },
    [store, getSelectedPlacementId, getGridOrEditorElement],
  );
  let focusCaret = React.useCallback(
    () =>
      getCaretElement()?.focus({
        preventScroll: true,
      }),
    [getCaretElement],
  );
  let cellFieldKeyProps = useCellEntryFieldEvents(store);
  let functionsButtonRef = React.useRef(null);
  let formulaBarRef = React.useRef(null);
  let formulaBarCleanupRef = React.useRef(null);
  let setFormulaBarElement = React.useCallback((element?: Dynamic) => {
    formulaBarCleanupRef.current?.();
    formulaBarCleanupRef.current = element === null ? null : preventPageScrollOverField(element);
    formulaBarRef.current = element;
    if (element !== null) moveCaretToEndOfField(element);
  }, []);
  let entryFieldRefs = React.useMemo(
    () => ({
      cell: activeEditorRef,
      formulaBar: formulaBarRef,
    }),
    [],
  );
  let entryBoxes = useEntryBoxes(store, entryFieldRefs);
  let shownViewToolsRef = React.useRef(null);
  let viewToolsRef = React.useRef(null);
  let setViewToolsInRowElement = React.useCallback((element?: Dynamic) => {
    viewToolsRef.current = element;
    shownViewToolsRef.current = element;
  }, []);
  let getViewToolsButton = React.useCallback(() => shownViewToolsRef.current?.querySelector('button') ?? null, []);
  let formulaRowRef = React.useRef(null);
  let formatToolsRef = React.useRef(null);
  let readerBarRef = React.useRef(null);
  let versionBarRef = React.useRef(null);
  let sidePaneRef = React.useRef(null);
  let isFindFieldToCome = React.useCallback(() => store.getView().find?.isReplaceShown !== true, [store]);
  let sidePaneTakesNoTyping = useTypingHoldForPanes({
    store: store,
    paneRef: sidePaneRef,
    always: cellsRef,
    isFieldToCome: isFindFieldToCome,
  });
  let [sidePaneWidth, setSidePaneWidth] = React.useState(initialSidePaneWidth);
  let sheetTabsRef = React.useRef(null);
  let addSheetButtonRef = React.useRef(null);
  let calendarPopupRef = React.useRef(null);
  let [footBar, setFootBar] = React.useState(null);
  let overGridRef = React.useRef(null);
  let [footNotice, setFootNotice] = React.useState(null);
  let [undoOfTurnCard, setUndoOfTurnCard] = React.useState(null);
  let footNoticeRef = React.useRef(null);
  let setFootNoticeElement = React.useCallback((element?: Dynamic) => {
    footNoticeRef.current = element;
    setFootNotice(element);
  }, []);
  useWaysInWaitedFor(store, view.waysIn, view.isWaitForWaysInPutOff);
  let areWaysInUp = view.waysIn === 'areUp';
  React.useEffect(() => (setWaysInShown(areWaysInUp), () => setWaysInShown(false)), [areWaysInUp]);
  let isWaysInMenuOpen = useAnnouncementsUnderWay();
  let { isAgentAsked: isAgentAsked, noteAgentAsked: noteAgentAsked } = useAgentAskedFromWaysIn({
    areWaysInDue: areWaysInUp,
    isDraftWaiting: false,
    doCellsTakeNoText: doCellsTakeNoText2,
  });
  let isSidePaneDrawn = view.isSidePaneOpen || view.find?.isReplaceShown === true;
  let heldBackLayersRef = React.useRef(new (Set as Dynamic)());
  let [isAnyLayerHeldBack, setIsAnyLayerHeldBack] = React.useState(false);
  let [isNonWaysInLayerHeldBack, setIsNonWaysInLayerHeldBack] = React.useState(false);
  let isRoomKeptForGonePane = useRoomKeptForGonePane({
    isPaneDrawn: isSidePaneDrawn,
    isChatOverBar: false,
    isMenuOpen: isAnyLayerHeldBack || view.menu?.isOfContextBar === true,
    bar: footBar,
  });
  let [headerExtra, setHeaderExtra] = React.useState(null);
  let [footerExtra, setFooterExtra] = React.useState(null);
  let toastResizeObserverRef = React.useRef(null);
  let toastMutationObserverRef = React.useRef(null);
  let toastRoomRef = React.useRef({
    top: 0,
    right: 0,
  });
  let isFindBarShown = view.find !== null && !view.find.isReplaceShown;
  let placeToastRoom = React.useEffectEvent((isFindShown: Dynamic = isFindBarShown) => {
    let cells = cellsRef.current;
    let root = cells?.ownerDocument.documentElement;
    let toasts = root?.querySelector(TOAST_SELECTOR) ?? null;
    if (cells === null || root === undefined || toasts === null) return;
    let cellsBox = cells.getBoundingClientRect();
    let topBelowHeaders = cellsBox.top + cells.clientTop + COLUMN_HEADER_HEIGHT * gridZoom.now();
    let findBox = isFindShown ? root.querySelector('.sheet-find-parts')?.getBoundingClientRect() : undefined;
    let roomOverToasts = Math.max(topBelowHeaders, findBox?.bottom ?? 0);
    let rem = Number.parseFloat(getComputedStyle(root).fontSize);
    let rightOfToasts = findBox === undefined ? cellsBox.right : findBox.right + rem;
    toasts.style.setProperty('--sheet-room-over-toasts', `${roomOverToasts}px`);
    toasts.style.setProperty('--sheet-room-right-of-toasts', `${root.clientWidth - rightOfToasts}px`);
    toasts.style.setProperty('--sheet-room-kept-at-right', `${root.clientWidth - cellsBox.right}px`);
    toastRoomRef.current = {
      top: roomOverToasts + rem,
      right: rightOfToasts - rem,
    };
  });
  React.useLayoutEffect(() => placeToastRoom(isFindBarShown), [isFindBarShown]);
  let [seenDialogs] = React.useState(() => new (WeakSet as Dynamic)());
  let placeNotices = React.useEffectEvent((grid2?: Dynamic, placedZoom?: Dynamic, reason?: Dynamic) => {
    let cells = cellsRef.current;
    let toasts = cells?.ownerDocument.querySelector(TOAST_SELECTOR) ?? null;
    if (cells === null || toasts === null) return;
    if (placedZoom !== zoom) return;
    if (grid2.yetToGlide !== null) return reason === 'toasts' ? placeToastRoom() : undefined;
    let [frontDialog, ...otherDialogs] = toasts.querySelectorAll(OPEN_DIALOG_SELECTOR);
    let isAtFoot = toasts.hasAttribute(AT_FOOT_ATTRIBUTE);
    let isToastsInUse = toasts.matches(':hover') || toasts.contains(cells.ownerDocument.activeElement);
    let isFrontNew = frontDialog !== undefined && !seenDialogs.has(frontDialog) && !isToastsInUse;
    for (let value of toasts.querySelectorAll(DIALOG_ROLE_SELECTOR) as Dynamic) seenDialogs.add(value);
    if (frontDialog === undefined && !isAtFoot) return;
    if (reason === 'toasts') placeToastRoom();
    let boxesOnScreen = (cellRanges?: Dynamic) =>
      cellRanges.flatMap((range?: Dynamic) => {
        let { left: left, top: top, width: width, height: height } = boxInBody(clipBoxToShown(range), grid2.body);
        if (width <= 0 || height <= 0) return [];
        let {
          x: x,
          y: y,
          ...size
        } = boxOnScreen(cells, placedZoom, {
          x: left,
          y: top,
          width: width,
          height: height,
        });
        return [
          {
            left: x,
            top: y,
            right: x + size.width,
            bottom: y + size.height,
          },
        ];
      });
    let boxesNotToCover = boxesOnScreen(boxesNoticesMustNotCover(grid2));
    let cellEditor2 = cells.querySelector(OPEN_ENTRY_SELECTOR);
    let { top: roomTop, right: roomRight } = toastRoomRef.current;
    let [toastsWidth, frontDialogHeight] = [toasts.offsetWidth, frontDialog?.offsetHeight ?? 0];
    let root = cells.ownerDocument.documentElement;
    let pinnedCard = toasts.querySelector('[data-pinned]')?.parentElement ?? null;
    let shouldSitAtFoot = shouldNoticesSitAtFoot({
      isAtFoot: isAtFoot,
      howManyUp: frontDialog === undefined ? 0 : 1 + otherDialogs.length,
      isAnyLeft: toasts.querySelector(DIALOG_ROLE_SELECTOR) !== null,
      isFrontNew: isFrontNew,
      spot: {
        left: roomRight - toastsWidth,
        top: roomTop,
        right: roomRight,
        bottom: roomTop + frontDialogHeight,
      },
      spotAtFoot: noticeSpotAtFoot({
        heightOfWindow: root.clientHeight,
        roomUnder: Number.parseFloat(toasts.style.getPropertyValue('--sheet-room-under-notices')),
        rem: Number.parseFloat(getComputedStyle(root).fontSize),
        topOfPinnedCard: pinnedCard?.getBoundingClientRect().top ?? null,
        rightOfCells: cells.getBoundingClientRect().right,
        width: toastsWidth,
        height: frontDialogHeight,
      }),
      notToCover: cellEditor2 === null ? boxesNotToCover : [...boxesNotToCover, cellEditor2.getBoundingClientRect()],
      betterNotCovered: isToastsInUse ? [] : boxesOnScreen(grid2.changedInTurnOffered),
    });
    if (shouldSitAtFoot === isAtFoot) return;
    for (let value of toasts.querySelectorAll(DIALOG_ROLE_SELECTOR) as Dynamic)
      value.toggleAttribute(MOVED_WHILE_FADING_ATTRIBUTE, value.hasAttribute('data-ending-style'));
    toasts.toggleAttribute(AT_FOOT_ATTRIBUTE, shouldSitAtFoot);
    if (reason === 'measure') return;
    toastResizeObserverRef.current?.unobserve(toasts);
    toastResizeObserverRef.current?.observe(toasts);
  });
  let grid = view.grid;
  React.useLayoutEffect(() => placeNotices(grid, zoom), [grid, zoom]);
  let barTopRef = React.useRef(0);
  let stopUndoCardJumpRef = React.useRef(() => {});
  let liftUndoCard = React.useEffectEvent((card: Dynamic, { activeCellElementId: activeCellElementId2 }: Dynamic) => {
    let cells = cellsRef.current;
    if (cells === null || card === null || !card.isConnected) return;
    let currentLift = Number.parseFloat(card.style.getPropertyValue(UNDO_OF_TURN_LIFT_PROPERTY));
    let lift = Number.isNaN(currentLift) ? 0 : currentLift;
    let { left: left, top: top, right: right, bottom: bottom } = card.getBoundingClientRect();
    let ownerDocument = cells.ownerDocument;
    let [, translateY = '0'] = (ownerDocument.defaultView?.getComputedStyle(card).translate ?? '').split(' ');
    let translatedLift = -Number.parseFloat(translateY);
    let shownLift = Number.isNaN(translatedLift) ? lift : translatedLift;
    let activeCellElement = activeCellElementId2 === null ? null : ownerDocument.getElementById(activeCellElementId2);
    let cellEditor2 = cells.querySelector(OPEN_ENTRY_SELECTOR);
    let isInUse = card.querySelector('button:hover') !== null || (ownerDocument.hasFocus() && card.contains(ownerDocument.activeElement));
    let nextLift = noticeLiftToClearCells({
      spot: {
        left: left,
        right: right,
        top: top + shownLift,
        bottom: bottom + shownLift,
      },
      aboveBar: barTopRef.current,
      keptClear: [activeCellElement, cellEditor2].flatMap((input?: Dynamic) => input?.getBoundingClientRect() ?? []),
      topOfCells: toastRoomRef.current.top,
      gap: SHEET_FOOT_GAP,
      liftInUse: isInUse && !Number.isNaN(currentLift) ? lift : null,
    });
    if (nextLift === currentLift) return;
    let isRising = nextLift > barTopRef.current && nextLift > lift;
    let jumps = Number.isNaN(currentLift) || isRising;
    card.toggleAttribute('data-jumps', jumps);
    card.style.setProperty(UNDO_OF_TURN_LIFT_PROPERTY, `${nextLift}px`);
    if (!jumps || ownerDocument.defaultView === null) return;
    stopUndoCardJumpRef.current();
    stopUndoCardJumpRef.current = takePressesAfterDelay(card, ownerDocument.defaultView);
  });
  React.useLayoutEffect(() => liftUndoCard(undoOfTurnCard, grid), [undoOfTurnCard, grid]);
  let liftUndoCardNextFrame = () =>
    void cellsRef.current?.ownerDocument.defaultView?.requestAnimationFrame(() => liftUndoCard(undoOfTurnCard, store.getView().grid));
  let observeToasts = React.useEffectEvent(() => {
    let toasts = cellsRef.current?.ownerDocument.querySelector(TOAST_SELECTOR) ?? null;
    let observed = toasts === null ? [] : [toasts, toasts.querySelector(STATUS_ROLE_SELECTOR)];
    for (let element of observed as Dynamic) if (element !== null) toastResizeObserverRef.current?.observe(element);
    if (toasts !== null)
      toastMutationObserverRef.current?.observe(toasts, {
        childList: true,
        subtree: true,
      });
  });
  let canEndCommentMode = React.useCallback(() => commentsOfHost.canEndMode(), [commentsOfHost]);
  useCommentMode(store, cellsRef, canEndCommentMode);
  let commentCornerKeyAtTarget = ({ target: target }: Dynamic) =>
    store.getView().mode.kind === 'navigating' ? commentCornerKeyOf(target) : null;
  let commentLayersRef = React.useRef(null);
  let putAwayCommentsRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let cells = cellsRef.current;
    if (cells === null) return;
    if (!view.grid.mayCommentBePreviewed || isAnyLayerHeldBack)
      mouseAroundComments.putAwayAtDraw(!view.grid.wouldCommentBeInTheWay && !isAnyLayerHeldBack);
    let placement = {
      grid: view.grid,
      gridElement: cells,
      zoom: zoom,
    };
    commentsOfHost.tellPlaces(
      commentCardPlaces(placement, {
        asked: commentsOfHost.cardAskedFor(),
        onItsPoint: commentsOfHost.cardOnItsPoint()?.handle ?? null,
        heightOfCard: (input?: Dynamic) => commentsOfHost.heightOfCard(input),
        heightOfPreview: (input?: Dynamic) => commentsOfHost.heightOfPreview(input),
      }),
    );
    markCommentLayersUnderMouse(placement, commentLayersRef.current);
  });
  let likelyHasKeyboard2 = React.useSyncExternalStore(subscribeSheetMedia, likelyHasKeyboard, () => false);
  let isOfferKeyDrawn = isWordsOfferedKeyDrawn(view.wordsOffered, likelyHasKeyboard2);
  let lastPutHereHolds = React.useSyncExternalStore(clipboard.onLastPutHereChange, clipboard.whatLastPutHereHolds, () => null);
  let valuesOfLastPutHere = React.useSyncExternalStore(clipboard.onLastPutHereChange, clipboard.valuesOfLastPutHere, () => null);
  let doesCommentModePickCells = view.doesCommentModePickCells;
  let isAnyNoticeUp =
    view.notice !== null ||
    view.newsOfLoss !== null ||
    view.undoOffer !== null ||
    saveStatusCard2 !== null ||
    view.fractionSavedToShow !== null ||
    nextIsLongSaveTold2 ||
    view.isLongCalculationTold ||
    doesCommentModePickCells ||
    allSavedSay === 'said' ||
    isEditingBackNoticeShown;
  React.useEffect(() => {
    if (isAnyNoticeUp) observeToasts();
  }, [isAnyNoticeUp]);
  let findBarRef = React.useRef(null);
  let replaceFieldRef = React.useRef(null);
  let chooseFileButtonRef = React.useRef(null);
  let ownFilterBarRef = React.useRef(null);
  let isNotComeToByTabRef = React.useRef(true);
  let [isComeToByTab, setIsComeToByTab] = React.useState(false);
  let forgetComeToByTab = () => {
    isNotComeToByTabRef.current = true;
    setIsComeToByTab(false);
  };
  let markComeToByTab = React.useCallback(() => {
    isNotComeToByTabRef.current = false;
    setIsComeToByTab(true);
  }, []);
  let wasTabKeyDownRef = React.useRef(false);
  let wasFormulaBarFocusedRef = React.useRef(false);
  let isFocusMoveExpectedRef = React.useRef(false);
  let isFocusMovingByCodeRef = React.useRef(false);
  let moveCaretTo = React.useCallback(
    (fromPart?: Dynamic, step?: Dynamic, skipOffersAtSelection: Dynamic = false) => {
      ReactDOM.flushSync(() => {
        return;
      });
      let focusPart = {
        functionsButton: () => focusFirstMatching(functionsButtonRef.current, 'button'),
        formulaBar: () => {
          let isFocused = focusFirstMatching(formulaBarRef.current, ':scope');
          if (isFocused) wasFormulaBarFocusedRef.current = true;
          return isFocused;
        },
        viewTools: () => focusFirstMatching(viewToolsRef.current, 'button'),
        findBar: () => store.getView().find?.isReplaceShown !== true && focusFirstMatching(findBarRef.current, ':scope'),
        cells: () => focusFirstMatching(getCaretElement(), ':scope'),
        offersAtSelection: () => focusFirstMatching(cellsRef.current, OFFERS_AT_SELECTION_BUTTONS_SELECTOR),
        charts: () => focusFirstMatching(cellsRef.current, PLACED_VIEW_CARET_SELECTOR),
        endOfSheet: () => focusFirstMatching(cellsRef.current, AT_END_OF_SHEET_FIELDS),
        errorsNotice: () =>
          focusFirstMatching(
            cellsRef.current?.ownerDocument.querySelector(`[${ERRORS_OFFERED_ATTRIBUTE}]:not([data-ending-style])`) ?? null,
            'button:not([role=option][aria-disabled])',
          ),
        undoOfTurn: () => focusFirstMatching(undoOfTurnCard, 'button'),
        waysIn: () => focusFirstControl(footNoticeRef.current),
        formatTools: () => focusFirstControl(formatToolsRef.current ?? readerBarRef.current ?? versionBarRef.current),
        toasts: () =>
          focusFirstMatching(
            cellsRef.current?.ownerDocument.querySelector(TOAST_SELECTOR) ?? null,
            ':is(a[href], button):not([data-ending-style] *)',
          ),
        ownFilterBar: () => focusFirstMatching(ownFilterBarRef.current, 'button'),
        sheets: () => focusFirstMatching(sheetTabsRef.current, '[role="tab"][aria-selected="true"]'),
        sidePane: () => focusPaneStart(sidePaneRef.current, 'lastUsed'),
      };
      let index: Dynamic = PAGE_PARTS_IN_F6_ORDER.indexOf(fromPart) + step;
      for (let part: Dynamic = PAGE_PARTS_IN_F6_ORDER[index]; part !== undefined; part = PAGE_PARTS_IN_F6_ORDER[index]) {
        if (!(skipOffersAtSelection && part === 'offersAtSelection') && focusPart[part]()) return true;
        index += step;
      }
      return false;
    },
    [store, getCaretElement, undoOfTurnCard],
  );
  let moveCaretFromCells = React.useCallback(
    (fromPart?: Dynamic, step?: Dynamic) => {
      let hasMoved = moveCaretTo(fromPart, step, true);
      let cellsElement = getGridOrEditorElement();
      if (hasMoved && cellsElement !== null && cellsElement === cellsElement.ownerDocument.activeElement) markComeToByTab();
      return hasMoved;
    },
    [moveCaretTo, getGridOrEditorElement, markComeToByTab],
  );
  let typingTarget = whereTypingGoes(view);
  let isComposing = useIsComposing(entryFieldRefs);
  let formulaFromWords = React.useMemo(
    () => withoutOfferWhenComposing(view.formulaFromWords, isComposing),
    [view.formulaFromWords, isComposing],
  );
  let isFormulaOfferDrawn = view.formulaFromWords.stage?.kind === 'offered' && view.formulaFromWords.stage.isDrawn;
  React.useEffect(() => {
    if (isComposing && isFormulaOfferDrawn)
      store.dispatch({
        kind: 'formulaOfferDrawn',
        isDrawn: false,
      });
  }, [isComposing, isFormulaOfferDrawn, store]);
  let noteInputMethodIfKeyboard = React.useCallback(() => {
    if (likelyHasKeyboard()) store.noteInputMethodInUse();
  }, [store]);
  React.useEffect(() => {
    if (isComposing) noteInputMethodIfKeyboard();
  }, [isComposing, noteInputMethodIfKeyboard]);
  let lastTypingTargetRef = React.useRef(typingTarget);
  let isFocusingFieldRef = React.useRef(false);
  let focusTypingTarget = (target?: Dynamic, caretKept: Dynamic = null) => {
    if (target === 'grid') return focusCaret();
    let field = (target === 'cell' ? activeEditorRef : formulaBarRef).current;
    if (field === null || field === field.ownerDocument.activeElement) return;
    isFocusingFieldRef.current = true;
    try {
      field.focus({
        preventScroll: true,
      });
    } finally {
      isFocusingFieldRef.current = false;
    }
    if (field !== field.ownerDocument.activeElement) return;
    if (field === caretKept?.box && field.value === caretKept.text && caretKept.selected[0] !== field.value.length)
      return field.setSelectionRange(...caretKept.selected);
    field.setSelectionRange(field.value.length, field.value.length);
    field.scrollTo({
      top: field.scrollHeight,
      ...(field.value.includes(`
`)
        ? {}
        : {
            left: field.scrollWidth,
          }),
    });
    if (isEntryEditor(field)) field.bringCaretIntoSight();
    return;
  };
  let dispatchEditText = (typingIn?: Dynamic, text?: Dynamic, options: Dynamic = {}) =>
    store.dispatch({
      kind: 'editTextChanged',
      text: text,
      typingIn: typingIn,
      ...options,
    });
  let completeEditText = ({ text: text, typingIn: typingIn }: Dynamic, complete?: Dynamic, isNotTyped: Dynamic = false) => {
    let field = (typingIn === 'cell' ? activeEditorRef : formulaBarRef).current;
    let completed =
      field?.value === text && field.selectionStart === text.length && field.selectionEnd === text.length ? complete(text) : null;
    if (completed === null) store.dropWhatIsHeld();
    else if (completed !== text)
      dispatchEditText(typingIn, completed, {
        caretAt: completed.length,
        ...(isNotTyped && {
          isNotTyped: true,
        }),
      });
  };
  let getActiveElement = () => cellsRef.current?.ownerDocument.activeElement ?? null;
  let isFocusInCells = () =>
    (cellsRef.current?.contains(getActiveElement()) === true &&
      !isInAtEndOfSheet(getActiveElement()) &&
      !isPlacedViewAskInput(getActiveElement()) &&
      !isInOffersAtSelection(getActiveElement())) ||
    getActiveElement() === formulaBarRef.current;
  let whereIsFocus = () => {
    if (getKeysOffCellsState().isNoticeOwed) return 'beforeNotice';
    if (cellsRef.current?.ownerDocument.hasFocus() !== true) return 'elsewhere';
    if (isFocusInCells()) return doCellsTakeNoText2 && !wasSomethingKeptOff ? 'pausedAtCells' : 'inCells';
    return (getActiveElement()?.closest('[role="menu"]') ?? null) === null ? 'elsewhere' : 'inMenu';
  };
  let hasPageFocus = React.useCallback(() => cellsRef.current?.ownerDocument.hasFocus() === true, []);
  let isFocusNowhere = () => {
    let active = getActiveElement();
    let isInCalendarPopup = store.getView().calendar === null && calendarPopupRef.current?.contains(active) === true;
    return active === active?.ownerDocument.body || active?.matches(':disabled') === true || isInCalendarPopup;
  };
  let focusTrackerRef = React.useRef(null);
  let timesFocusBegun = React.useCallback(() => focusTrackerRef.current?.timesBegun() ?? 0, []);
  let isPageLeftUntouched = React.useCallback(
    () => cellsRef.current?.ownerDocument.hasFocus() !== true && focusTrackerRef.current?.hasPersonActedSinceFocusLeft() !== true,
    [],
  );
  let isPageLeftUnpressed = React.useCallback(
    () =>
      cellsRef.current?.ownerDocument.hasFocus() !== true && focusTrackerRef.current?.hasPersonActedSinceFocusLeft('pressesOnly') !== true,
    [],
  );
  let windowFocusWatchRef = React.useRef(null);
  React.useEffect(() => {
    let win = cellsRef.current?.ownerDocument.defaultView ?? null;
    if (win === null) return;
    let watch = watchWindowFocusLeft(win);
    windowFocusWatchRef.current = watch;
    return () => watch.stop();
  }, []);
  let isPageReallyLeft = React.useCallback(
    () =>
      isPageLeftUnpressed() &&
      (cellsRef.current?.ownerDocument.visibilityState !== 'hidden' || windowFocusWatchRef.current?.hadFocusLeftBefore() === true),
    [isPageLeftUnpressed],
  );
  let isBlurringByCodeRef = React.useRef(false);
  let blurQuietly = React.useCallback((element?: Dynamic) => {
    isBlurringByCodeRef.current = true;
    try {
      if (element instanceof HTMLElement) element.blur();
    } finally {
      isBlurringByCodeRef.current = false;
    }
  }, []);
  let isEditKeptOnBlurRef = React.useRef(false);
  let isPointerHeldOutsideRef = React.useRef(false);
  let isPageLeftWithoutPointer = React.useCallback(
    () => isPageLeftUnpressed() && !isPointerHeldOutsideRef.current,
    [isPageLeftUnpressed],
  );
  let [scrollGesture] = React.useState(createScrollGestureTimer);
  let mayFocusReturnToCells = () =>
    isPageReallyLeft() &&
    focusTrackerRef.current?.hasPressJustEnded() !== true &&
    !isPointerHeldOutsideRef.current &&
    !scrollGesture.isUnderWay() &&
    !areFocusLeftChecksHeld();
  let mayFocusReturnToCellsEvent = React.useEffectEvent(mayFocusReturnToCells);
  let whenFocusStays = (action?: Dynamic, dispatchMode: Dynamic = 'mayDispatch') => {
    let active = getActiveElement();
    let timesLeft = focusTrackerRef.current?.timesFocusLeft();
    let check = () => {
      if (focusTrackerRef.current?.timesFocusLeft() !== timesLeft && cellsRef.current?.ownerDocument.hasFocus() !== true) return;
      if (getActiveElement() === active || isFocusNowhere() || isFocusInCells()) action();
    };
    if (dispatchMode === 'mayDispatch') store.onceEventsAreFinished(check);
    else store.lookOnceEventsAreFinished(check);
  };
  let focusChangesRef = React.useRef(0);
  let pointerPressesRef = React.useRef(0);
  let pendingBlurRef = React.useRef(null);
  let isBlurPending = React.useCallback(() => pendingBlurRef.current !== null, []);
  let afterFocusLeaves = (
    keepCells?: Dynamic,
    leave: Dynamic = () => {},
    shouldKeepEdit: Dynamic = () => false,
    keepInCalendar?: Dynamic,
  ) => {
    let focusChangesBefore = focusChangesRef.current;
    let pointerPressesBefore = pointerPressesRef.current;
    return () => {
      let isMenuToClose = store.getView().menu !== null && isPageLeftUnpressed() && pendingBlurRef.current === null;
      if (!isMenuToClose)
        ReactDOM.flushSync(() => {
          return;
        });
      let { mode: mode2, menu: menu2, calendar: calendar } = store.getView();
      let keepsEdit = isEditKeptOnBlurRef.current && mode2.kind === 'editing' && shouldKeepEdit(mode2);
      let isSameFocus = focusChangesRef.current === focusChangesBefore;
      let wasPressed = pointerPressesRef.current !== pointerPressesBefore;
      let isFocusStill = isSameFocus && !wasPressed;
      let ownerDocument = cellsRef.current?.ownerDocument;
      let isInCells = isFocusInCells() && ownerDocument !== undefined && !hasElementAwaitingKeyboard(ownerDocument);
      if (isFocusStill && (isInCells || keepsEdit) && menu2 === null) return keepCells();
      let calendarPopup = calendar !== null && menu2 === null && mode2.kind !== 'editing' ? calendarPopupRef.current : null;
      let isInCalendar = calendarPopup !== null && (calendarPopup.contains(getActiveElement()) || hasElementAwaitingKeyboard(calendarPopup));
      if (isFocusStill && isInCalendar && keepInCalendar !== undefined) {
        keepInCalendar();
        let { mode: modeAfter, calendar: calendarAfter } = store.getView();
        let isCalendarLeft = calendarAfter !== null && !calendarPopup.contains(getActiveElement());
        if (modeAfter.kind === 'editing' || !isCalendarLeft) return;
      }
      leave();
      store.dropWhatIsHeld();
      if (isMenuToClose)
        store.dispatch({
          kind: 'menuClosed',
        });
    };
  };
  let afterFocusLeavesTypedAhead = (
    keepCells?: Dynamic,
    shouldKeepEdit: Dynamic = () => false,
    keepInCalendar?: Dynamic,
  ) => {
    let timesLeft = focusTrackerRef.current?.timesFocusLeft();
    let hasFocusLeftSince = (input?: Dynamic) => focusTrackerRef.current?.timesFocusLeft() !== timesLeft && shouldKeepEdit(input);
    store.onceEventsAreFinished(afterFocusLeaves(keepCells, undefined, hasFocusLeftSince, keepInCalendar), undefined, 'asTypedAhead');
  };
  let refocusTypingTarget = () => {
    let target = whereTypingGoes(store.getView());
    focusTypingTarget(target);
    if (target === 'grid') lastTypingTargetRef.current = target;
  };
  let refocusTypingTargetEvent = React.useEffectEvent(refocusTypingTarget);
  let refocusFromBehindToast = React.useEffectEvent(() => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    let active = ownerDocument?.activeElement;
    let isBehind =
      ((isInsideUnpinnedToast(active) ? active?.closest(DIALOG_ROLE_SELECTOR) : null)?.querySelector('[data-behind]') ?? null) !== null;
    if (ownerDocument?.hasFocus() === true && isBehind && !hasElementAwaitingKeyboard(ownerDocument)) refocusTypingTarget();
  });
  let hasFormulaOfFix = view.formulaOfFixOnEntryCell !== null;
  React.useEffect(() => {
    if (!hasFormulaOfFix) return;
    return () => {
      let formulaBar = formulaBarRef.current;
      if (formulaBar !== null && formulaBar === formulaBar.ownerDocument.activeElement) refocusTypingTargetEvent();
    };
  }, [hasFormulaOfFix]);
  React.useEffect(() => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (ownerDocument === undefined) return;
    let onKeyDown = (event?: Dynamic) => {
      let isInToast = event.target instanceof Element && isInsideToast(event.target);
      let keyEvent = normalizedKeyEvent(event);
      let focusMove = isInToast ? focusMoveOfKey(keyEvent) : null;
      if (focusMove === 'cells') {
        if (isInsideToast(ownerDocument.activeElement)) refocusTypingTargetEvent();
        if (!store.getView().isCommentModeOn) event.preventDefault();
        return;
      }
      if (event.key !== 'F6' || !isInToast || !hasInteractiveToast(ownerDocument)) return;
      if ((keyEvent.isRepeat && !keyEvent.isAltHeld) || (focusMove !== null && moveCaretTo('toasts', focusMove === 'nextPart' ? 1 : -1)))
        event.preventDefault();
    };
    ownerDocument.addEventListener('keydown', onKeyDown);
    return () => ownerDocument.removeEventListener('keydown', onKeyDown);
  }, [store, moveCaretTo]);
  let bottomInsetRef = React.useRef(0);
  let keyboardInsetRef = React.useRef(0);
  let wasPaneFullWidthRef = React.useRef(false);
  let measureGridRef = React.useRef(null);
  React.useEffect(() => {
    let [cells, zoomedGrid] = [cellsRef.current, zoomedGridRef.current];
    if (cells === null || zoomedGrid === null) return;
    let root = cells.ownerDocument.documentElement;
    let observedDialogs = new (WeakSet as Dynamic)();
    let measure = (entries?: Dynamic, isZoomAboutPointer: Dynamic = false) => {
      if (!cells.isConnected) return;
      let zoomNow = gridZoom.now();
      for (let { target: target } of entries as Dynamic) if (!target.isConnected) resizeObserver.unobserve(target);
      let slideOffset = footBar === null ? 0 : slideOffsetNow(footBar);
      let { top: cellsTop } = cells.getBoundingClientRect();
      let cellsBottom = cellsTop + cells.clientTop + cells.clientHeight;
      let footBox = footBar?.getClientRects()[0] ?? null;
      let footTop = footBox === null ? cellsBottom : footBox.top - slideOffset;
      let heightUnderFoot = root.clientHeight - footTop;
      let bottomInset = getBottomSafeAreaInset();
      let isCoveredMoreByComposer = bottomInset > bottomInsetRef.current;
      if (cells.clientHeight > 0) bottomInsetRef.current = bottomInset;
      let isCoveredMoreByKeyboard = getKeyboardInset() > keyboardInsetRef.current;
      let isCoveredLessByKeyboard = getKeyboardInset() < keyboardInsetRef.current;
      keyboardInsetRef.current = getKeyboardInset();
      let composerOverlap = Math.max(0, bottomInset - heightUnderFoot);
      barTopRef.current = composerOverlap;
      liftUndoCard(undoOfTurnCard, store.getView().grid);
      footBar?.style.setProperty('--sheet-width-of-grid', `${cells.clientWidth}px`);
      placeToastRoom();
      let footNoticeHeight = footNotice === null ? 0 : footNotice.offsetHeight + SHEET_FOOT_GAP;
      let roomUnderCards = Math.max(composerOverlap, footNoticeHeight);
      let undoCardHeight = undoOfTurnCard === null ? 0 : composerOverlap + undoOfTurnCard.offsetHeight + SHEET_FOOT_GAP;
      let toasts = root.querySelector(TOAST_SELECTOR);
      toasts?.style.setProperty('--sheet-room-under-notices', `${heightUnderFoot + Math.max(roomUnderCards, undoCardHeight)}px`);
      placeNotices(store.getView().grid, gridZoom.now(), 'measure');
      let isAtFoot = toasts?.hasAttribute(AT_FOOT_ATTRIBUTE) === true;
      let noticesBox = (isAtFoot ? toasts : toasts?.querySelector('[data-pinned]')?.parentElement)?.getBoundingClientRect();
      let openDialogs = isAtFoot ? toasts.querySelectorAll(OPEN_DIALOG_SELECTOR) : [];
      for (let target of openDialogs as Dynamic) {
        if (observedDialogs.has(target)) continue;
        observedDialogs.add(target);
        resizeObserver.observe(target);
      }
      let dialogTops = Array.from<Dynamic, Dynamic>(
        openDialogs,
        (input?: Dynamic) => (input.offsetParent?.getBoundingClientRect().bottom ?? cellsBottom) - input.offsetHeight,
      );
      let topOfNotices =
        noticesBox === undefined || noticesBox.height === 0
          ? cellsBottom
          : (Math.min as Dynamic)(noticesBox.top, ...dialogTops) - NOTICE_STACK_STEP_PX * Math.max(0, openDialogs.length - 1);
      let topOfCards = footTop - roomUnderCards;
      let boxAtFootInCells = ({ left: left, right: right }: Dynamic, top: Dynamic) => ({
        left: Math.floor(
          pointInZoomedElement(cells, zoomNow, {
            clientX: left,
            clientY: top,
          }).x,
        ),
        right: Math.ceil(
          pointInZoomedElement(cells, zoomNow, {
            clientX: right,
            clientY: top,
          }).x,
        ),
        heightUnder: Math.ceil(unzoomLength(cellsBottom - top, zoomNow)),
      });
      let topOfFloating = Math.min(topOfCards, topOfNotices);
      let isPaneFullWidth = (sidePaneRef.current?.offsetWidth ?? 0) >= Math.max(1, root.clientWidth - 1);
      setBarsInsetAtFoot(isPaneFullWidth ? 0 : heightUnderFoot);
      store.dispatch({
        kind: 'gridResized',
        width: Math.floor(unzoomLength(cells.clientWidth, zoomNow)),
        height: Math.floor(unzoomLength(cells.clientHeight, zoomNow)),
        pageWidth: root.clientWidth,
        heightUnderWhatFloats: Math.ceil(unzoomLength(cellsBottom - topOfFloating, zoomNow)),
        ...(noticesBox !== undefined &&
          topOfNotices < topOfCards && {
            noticesAtFoot: {
              left: Math.floor(
                pointInZoomedElement(cells, zoomNow, {
                  clientX: noticesBox.left,
                  clientY: noticesBox.top,
                }).x,
              ),
              heightUnderTheRest: Math.ceil(unzoomLength(cellsBottom - topOfCards, zoomNow)),
            },
          }),
        heightUnderCardAtFoot: Math.ceil(unzoomLength(cellsBottom - footTop, zoomNow)),
        isCoveredMoreByComposer: isCoveredMoreByComposer,
        isComposerOpen: bottomInset > 0,
        isCoveredMoreByKeyboard: isCoveredMoreByKeyboard,
        isCoveredLessByKeyboard: isCoveredLessByKeyboard,
        zoom: zoomNow,
        isZoomAboutPointer: isZoomAboutPointer,
        isOnPhone: isOnPhone(),
        isNarrowByTouch: isNarrowByTouch(),
        ...(footBox !== null &&
          isCoarsePointerNow() &&
          !isNarrowByTouch() && {
            boxesAtFootByTouch: [
              boxAtFootInCells(footBox, footTop - composerOverlap),
              ...(footNotice === null ? [] : [boxAtFootInCells(footNotice.getBoundingClientRect(), footTop - footNoticeHeight)]),
            ],
          }),
      });
      let ownerDocument = cells.ownerDocument;
      let isFocusOnBody = ownerDocument.activeElement === ownerDocument.body;
      let hasPaneJustFilled = isPaneFullWidth && !wasPaneFullWidthRef.current;
      if (root.clientWidth > 0) wasPaneFullWidthRef.current = isPaneFullWidth;
      let isFocusLost = ownerDocument.activeElement?.getClientRects().length === 0 || (hasPaneJustFilled && isFocusOnBody);
      let isSelectionCollapsed = ownerDocument.hasFocus() && ownerDocument.getSelection()?.isCollapsed !== false;
      if (isFocusLost && isSelectionCollapsed && !hasElementAwaitingKeyboard(ownerDocument)) focusPaneStart(sidePaneRef.current, 'start');
      shell.cellsAreMeasured();
    };
    let resizeObserver = new (ResizeObserver as Dynamic)((input?: Dynamic) => measure(input));
    let footObserver = new (MutationObserver as Dynamic)(() => measure([]));
    if (footBar !== null)
      footObserver.observe(footBar, {
        attributes: true,
        attributeFilter: ['data-keeps-room-of-pane'],
      });
    let remeasure = () => measure([]);
    let modeObserver = new (MutationObserver as Dynamic)(remeasure);
    modeObserver.observe(cells.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode'],
    });
    let win = cells.ownerDocument.defaultView;
    let frameId: Dynamic = 0;
    let remeasureNextFrame = () => {
      remeasure();
      win?.cancelAnimationFrame(frameId);
      frameId = win?.requestAnimationFrame(remeasure) ?? 0;
    };
    let mediaQueries = ['(prefers-color-scheme:dark)', '(forced-colors:active)'].map((input?: Dynamic) => win?.matchMedia(input));
    for (let value of mediaQueries as Dynamic) value?.addEventListener('change', remeasureNextFrame);
    let stopZoomWatch = gridZoom.subscribe((input?: Dynamic) => measure([], input));
    measureGridRef.current = remeasure;
    let lastBottomInset: Dynamic = getBottomSafeAreaInset();
    let stopInsetWatch = subscribeBottomInsets(() => {
      if (getBottomSafeAreaInset() === lastBottomInset) return;
      lastBottomInset = getBottomSafeAreaInset();
      measure([]);
    });
    resizeObserver.observe(root);
    toastResizeObserverRef.current = resizeObserver;
    let toastObserver =
      win === null
        ? null
        : new (win.MutationObserver as Dynamic)(() => {
            refocusFromBehindToast();
            placeNotices(store.getView().grid, gridZoom.now(), 'toasts');
          });
    toastMutationObserverRef.current = toastObserver;
    observeToasts();
    let observedElements = footBar === null ? [cells] : [cells, footBar];
    for (let value of observedElements as Dynamic) resizeObserver.observe(value);
    resizeObserver.observe(cells.ownerDocument.body);
    if (overGridRef.current !== null) resizeObserver.observe(overGridRef.current);
    let wheelTargets = [...observedElements, headerExtra, footerExtra].filter((input?: Dynamic) => input !== null);
    let onWheel = (event?: Dynamic) => {
      if (event.ctrlKey) return;
      mouseAroundComments.putAway();
      let scroller = event.target instanceof Element ? event.target.closest('.sheet-scroller') : null;
      if (scroller !== null && scroller.scrollWidth > scroller.clientWidth && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      let entryEditor = entryEditorOf(event.target);
      if (
        (entryEditor instanceof HTMLTextAreaElement || isEntryEditor(entryEditor)) &&
        entryEditor.scrollHeight > entryEditor.clientHeight &&
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) &&
        !(event.altKey || event.shiftKey || event.metaKey)
      )
        return;
      event.preventDefault();
      let deltaScale =
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? unzoomLength(1, gridZoom.now()) : defaultRowHeightAtDensity(store.getView().density);
      store.dispatch({
        kind: 'wheelTurned',
        deltaX: event.deltaX * deltaScale,
        deltaY: event.deltaY * deltaScale,
      });
    };
    for (let value of wheelTargets as Dynamic)
      value.addEventListener('wheel', onWheel, {
        passive: false,
      });
    return () => {
      resizeObserver.disconnect();
      footObserver.disconnect();
      modeObserver.disconnect();
      for (let value of mediaQueries as Dynamic) value?.removeEventListener('change', remeasureNextFrame);
      win?.cancelAnimationFrame(frameId);
      stopZoomWatch();
      stopInsetWatch();
      measureGridRef.current = null;
      toastResizeObserverRef.current = null;
      toastObserver?.disconnect();
      toastMutationObserverRef.current = null;
      let toastsLayer = root.querySelector(TOAST_SELECTOR);
      for (let value of ['over-toasts', 'right-of-toasts', 'kept-at-right', 'under-notices'] as Dynamic)
        toastsLayer?.style.removeProperty(`--sheet-room-${value}`);
      for (let value of wheelTargets as Dynamic) value.removeEventListener('wheel', onWheel);
    };
  }, [
    store,
    gridZoom,
    footBar,
    footNotice,
    undoOfTurnCard,
    headerExtra,
    footerExtra,
    shell,
    mouseAroundComments,
  ]);
  let caretKeptBeforeEntryEndsRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let isCaretWithCellsBeforeEntryEnds = view.isCaretWithCellsBeforeEntryEnds;
    let keptCaret = caretKeptBeforeEntryEndsRef.current;
    if (!isCaretWithCellsBeforeEntryEnds) caretKeptBeforeEntryEndsRef.current = null;
    if (lastTypingTargetRef.current === typingTarget) return;
    let active = getActiveElement();
    let hasPageFocusNow = active?.ownerDocument.hasFocus() === true;
    let activeField =
      [activeEditorRef.current, formulaBarRef.current, cellEditorRef.current].find((field?: Dynamic) => field === active) ?? null;
    if (isCaretWithCellsBeforeEntryEnds && (!hasPageFocusNow || activeField === null)) return;
    lastTypingTargetRef.current = typingTarget;
    if (typingTarget === 'grid') isEditKeptOnBlurRef.current = false;
    if (isCaretWithCellsBeforeEntryEnds && activeField !== null)
      caretKeptBeforeEntryEndsRef.current = {
        box: activeField,
        text: activeField.value,
        selected: [
          activeField.selectionStart ?? activeField.value.length,
          activeField.selectionEnd ?? activeField.value.length,
          activeField.selectionDirection ?? 'none',
        ],
      };
    if (keptCaret !== null && typingTarget !== 'grid' && active !== cellEditorRef.current) return;
    let sidePane = sidePaneRef.current;
    let isFocusOutsideCells =
      sidePane?.contains(sidePane.ownerDocument.activeElement) === true || isInAtEndOfSheet(active) || isPlacedViewAskInput(active);
    if (typingTarget === 'grid' && isFocusOutsideCells) return;
    let isPageLeft = isPageLeftUntouched() || (view.isEntryEndedUnasked && cellsRef.current?.ownerDocument.hasFocus() !== true);
    if (typingTarget === 'grid' && isPageLeft) {
      formulaBarRef.current?.blur();
      if (active instanceof HTMLElement && active.hasAttribute('data-is-going')) active.blur();
      return;
    }
    let field = (typingTarget === 'cell' ? activeEditorRef : formulaBarRef).current;
    let isLeftOutside = keptCaret === null ? isPageLeftWithoutPointer() : !hasPageFocusNow;
    if (typingTarget !== 'grid' && active !== field && isLeftOutside) {
      isEditKeptOnBlurRef.current = true;
      if (isFocusInCells() || !isTextInputOrEntryEditor(active)) blurQuietly(active);
      return;
    }
    focusTypingTarget(typingTarget, keptCaret);
  });
  let isGridFocusHeld = areCellsOffLimits(view);
  React.useLayoutEffect(() => {
    let [cellEditor2, gridFocus] = [cellEditorRef.current, gridFocusRef.current];
    let [from, to] = isGridFocusHeld ? [cellEditor2, gridFocus] : [gridFocus, cellEditor2];
    let isFocusOnFrom = () => from !== null && from.ownerDocument.hasFocus() && from === from.ownerDocument.activeElement;
    let moveFocus = () => {
      if (isFocusOnFrom() && store.getView().mode.kind !== 'editing')
        to?.focus({
          preventScroll: true,
        });
    };
    if (isGridFocusHeld) return moveFocus();
    let timer = setTimeout(moveFocus);
    return () => clearTimeout(timer);
  }, [store, isGridFocusHeld]);
  let formulaBarKey = useFormulaBarRemountKey(
    view.mode.kind === 'editing' && view.mode.typingIn === 'formulaBar',
    isModalOpen(view) || view.menu !== null,
  );
  let isNarrowPhone = useNarrowPhone();
  let isOnPhoneHere = useOnPhone();
  let isHistoryControlInHeader: boolean = shell.drawsHistory() && view.viewOnlyBecause !== 'readOnly';
  let areViewToolsAtFoot: boolean = isHistoryControlInHeader && !isOnPhoneHere;
  let groupLevels = groupLevelCount(view.groupMargins.rows);
  let headerRoomStyle = React.useMemo(
    () => gridHeaderRoomStyle(groupLevels, zoom, view.density),
    [groupLevels, zoom, view.density],
  );
  let formulaBarLines = useFormulaBarLines({
    field: formulaBarRef,
    text: view.formulaOfFixOnEntryCell === null ? view.formulaBarText : '',
    toolsAtEnd: viewToolsRef,
    areToolsAtEnd: !areViewToolsAtFoot,
    isCardAsWideAsStrip: isNarrowPhone,
    isOnlyRead: isNarrowPhone && view.isFormulaBarReadOnly,
  });
  let firstLineWidthStyle2 = React.useMemo(
    () => firstLineWidthStyle(formulaBarLines.widthOfFirstLineOfSeveral),
    [formulaBarLines.widthOfFirstLineOfSeveral],
  );
  React.useLayoutEffect(() => {
    let { mode: mode2 } = store.getView();
    let isEditingText = mode2.kind === 'editing' && !isFormulaText(mode2.text);
    if (typingTarget === 'formulaBar' && isEditingText && isNarrowPhone) activeEditorRef.current?.scrollTo(0, 0);
  }, [store, typingTarget, isNarrowPhone]);
  useCoveredUnderCellsProperty(formulaRowRef);
  React.useLayoutEffect(() => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (!isViewOnly || ownerDocument === undefined) return;
    if (
      (ownerDocument.activeElement?.matches(':disabled') === true || ownerDocument.activeElement === ownerDocument.body) &&
      ownerDocument.hasFocus()
    )
      focusCaret();
  }, [isViewOnly, focusCaret]);
  let { calculatingShownWait: calculatingShownWait2, savingBarWait: savingBarWait, longCalculationWait: longCalculationWait2 } = view;
  let { waitForNextEditOfAgent: waitForNextEditOfAgent, waitForAgentOnComments: waitForAgentOnComments } = view;
  let doneByAgentWait = view.doneByAgent?.wait ?? null;
  React.useEffect(() => watchAnotherRangeKey(window), []);
  React.useEffect(() => scheduleWorkShownLongEnough(calculatingShownWait2, store), [store, calculatingShownWait2]);
  React.useEffect(() => scheduleWorkShownLongEnough(savingBarWait, store), [store, savingBarWait]);
  React.useEffect(() => scheduleWorkShownLongEnough(longCalculationWait2, store), [store, longCalculationWait2]);
  React.useEffect(() => scheduleWorkShownLongEnough(waitForNextEditOfAgent, store), [store, waitForNextEditOfAgent]);
  React.useEffect(() => scheduleWorkShownLongEnough(waitForAgentOnComments, store), [store, waitForAgentOnComments]);
  let lastDoneAnnouncement = useAnnouncedLastDone(
    store,
    () => cellsRef.current?.ownerDocument.hasFocus() === true && isFocusInCells(),
  );
  let lastDoneWords = view.lastDone === null ? null : announcementOfLastDone(view.lastDone, lastDoneAnnouncement);
  let [isZoomSettling, setIsZoomSettling] = React.useState(false);
  let zoomSettleCountRef = React.useRef(0);
  let markZoomSettling = React.useCallback(() => {
    let win = cellsRef.current?.ownerDocument.defaultView ?? null;
    if (win === null) return;
    zoomSettleCountRef.current += 1;
    let count = zoomSettleCountRef.current;
    setIsZoomSettling(true);
    afterNextFrameOrTimeout(
      win,
      () =>
        afterNextFrameOrTimeout(win, () => {
          if (count === zoomSettleCountRef.current) setIsZoomSettling(false);
        }),
      ACTIVE_DESCENDANT_PAUSE_MS,
    );
  }, []);
  let isDoneByAgentShownLongEnough = useIsTrueForVisibleMs(doneByAgentWait !== null, doneByAgentWait?.ms ?? 0);
  React.useEffect(() => {
    if (isDoneByAgentShownLongEnough && doneByAgentWait !== null)
      store.dispatch({
        kind: 'workShownLongEnough',
        wait: doneByAgentWait,
      });
  }, [store, doneByAgentWait, isDoneByAgentShownLongEnough]);
  let columnHeadingsCall = useColumnGripCalled({
    drawn: view.grid,
    gridRef: cellsRef,
    zoom: zoom,
  });
  let nameFlagsAtPointer = useNameFlagsAtPointer({
    store: store,
    drawn: view.grid,
    gridRef: cellsRef,
    zoom: zoom,
  });
  let filterButtonPointedAt = useFilterButtonPointedAt({
    drawn: view.grid,
    gridRef: cellsRef,
    zoom: zoom,
  });
  let tableHandleCall = useTableHandleCall({
    drawn: view.grid,
    gridRef: cellsRef,
    zoom: zoom,
  });
  let { menuOfHandleShut: menuOfHandleShut } = tableHandleCall;
  let tableHandleCalledFor = view.grid.cellsHeld === null ? (view.menu?.ofHandleOfTable ?? tableHandleCall.calledFor) : null;
  useGridZoomGestures({
    gridRef: cellsRef,
    overGridRef: overGridRef,
    gridZoom: gridZoom,
    zoomTo: (nextZoom?: Dynamic, pointer?: Dynamic) => {
      let [cells, zoomBefore, zoomAfter] = [cellsRef.current, gridZoom.now(), clampZoom(nextZoom)];
      if (cells === null || zoomAfter === zoomBefore) return;
      mouseAroundComments.putAway();
      let point = pointInZoomedElement(cells, zoomBefore, pointer);
      gridZoom.set(zoomAfter, true);
      store.dispatch({
        kind: 'wheelTurned',
        deltaX: point.x * (1 - zoomBefore / zoomAfter),
        deltaY: point.y * (1 - zoomBefore / zoomAfter),
      });
    },
  });
  useStepBackIntoCells({
    store: store,
    gridRef: gridFocusRef,
    isSteppedOut: view.isSteppedOutOfCells,
  });
  useChangesComingIn(cellsRef, view.grid);
  useMarksOfImportExpiry(store, view.marksOfImport);
  let errorCardHover = useErrorCardHover(store, view.linkExplained !== null);
  let pointerDispatch = React.useMemo(
    () => ({
      dispatch(event?: Dynamic) {
        if (event.kind === 'pointerRested' && event.at !== null) errorCardHover.cardIsPutAway();
        store.dispatch(event);
      },
    }),
    [store, errorCardHover],
  );
  let linkCardHover = useLinkCardHover(pointerDispatch, view.linkExplained?.cellKey ?? null);
  let [isLinkCardPressedAway, setIsLinkCardPressedAway] = React.useState(true);
  let linkCardSeen = useLinkCardSeen(cellsRef);
  let openLink = React.useMemo(() => openLinkIfShown(linkCardSeen, openLinkUnlessCommentMode(store)), [linkCardSeen, store]);
  let leaveLinkCard2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'linkCardLeftByPointer',
        cardOf: store.getView().linkExplained?.cellKey ?? null,
        isDoneWith: true,
      }),
    [store],
  );
  let openLinkFromCard = React.useCallback(
    (url?: Dynamic, place?: Dynamic) => {
      let linkPlace = place ?? linkPlaceOfUrl(store.getView().linkExplained, url);
      let isOpened = linkPlace !== null && openLink(url, linkPlace);
      if (isOpened) leaveLinkCard2();
      return isOpened;
    },
    [store, openLink, leaveLinkCard2],
  );
  let copyLinkAddress = React.useCallback(
    (url?: Dynamic) => {
      let ownerDocument = cellsRef.current?.ownerDocument;
      if (!(ownerDocument !== undefined && copyTextWithExecCommand(ownerDocument, url)))
        return store.dispatch({
          kind: 'sheetLinkCopyAnswered',
          whyNot: 'refused',
        });
      clipboard.somethingElseCopiedHere();
      store.dispatch({
        kind: 'linkAddressCopied',
      });
      return leaveLinkCard2();
    },
    [store, clipboard, leaveLinkCard2],
  );
  let copyLinkIfSeen = React.useCallback(
    (url?: Dynamic) => {
      let linkPlace = linkPlaceOfUrl(store.getView().linkExplained, url);
      if (
        linkPlace === 'typed' ||
        (linkPlace !== null &&
          linkCardSeen.hasShown({
            ...linkPlace,
            url: url,
          }))
      )
        copyLinkAddress(url);
    },
    [store, linkCardSeen, copyLinkAddress],
  );
  let chooseLinkEdit = React.useCallback(
    (address?: Dynamic) =>
      store.onceEventsAreFinished(() => {
        if (!isPageReallyLeft())
          store.dispatch({
            kind: 'linkEditChosen',
            address: address,
          });
      }),
    [store, isPageReallyLeft],
  );
  let chooseLinkRemove = React.useCallback(
    (address?: Dynamic) => {
      let { cellKey: cellKey, urlsOnWords: urlsOnWords } = store.getView().linkExplained ?? {};
      if (cellKey === undefined) return;
      let ofAddress =
        urlsOnWords?.includes(address) === true
          ? {
              address: address,
            }
          : {};
      store.dispatch({
        kind: 'linkRemoveChosen',
        cardOf: cellKey,
        ...ofAddress,
      });
      leaveLinkCard2();
    },
    [store, leaveLinkCard2],
  );
  let askLinkForm = React.useCallback(() => {
    giveEntryBoxOfItsOwn(store, entryFieldRefs);
    store.dispatch({
      kind: 'linkFormAsked',
      ...caretInEntryPatch(store.getView().mode, entryFieldRefs),
    });
  }, [store, entryFieldRefs]);
  let giveLink = React.useCallback(
    (text?: Dynamic, address?: Dynamic) => {
      let isFormInEntry = store.getView().linkForm?.inEntry !== undefined;
      ReactDOM.flushSync(
        () =>
          store.dispatch({
            kind: 'linkGiven',
            text: text,
            address: address,
          }),
      );
      if (!isFormInEntry) return;
      store.lookOnceEventsAreFinished(() => {
        let { mode: mode2, linkForm: linkForm } = store.getView();
        let { end: end } = (mode2.kind === 'editing' ? mode2.selectedInEntry : undefined) ?? {};
        if (linkForm === null && end !== undefined) typingBoxOf(mode2, entryFieldRefs)?.setSelectionRange(end, end);
      });
    },
    [store, entryFieldRefs],
  );
  let shutLinkForm = React.useCallback(
    () =>
      store.dispatch({
        kind: 'linkFormShut',
      }),
    [store],
  );
  let forwardWheelToCells = React.useCallback(
    (event?: Dynamic) => cellsRef.current?.dispatchEvent(new (WheelEvent as Dynamic)(event.type, event)) === false,
    [],
  );
  let refocusFromUnpinnedToast = React.useEffectEvent(() => {
    if (isInsideUnpinnedToast(cellsRef.current?.ownerDocument.activeElement)) focusTypingTarget(typingTarget);
  });
  let hasUndoOffer = view.undoOffer !== null;
  React.useLayoutEffect(() => {
    if (!hasUndoOffer) refocusFromUnpinnedToast();
  }, [hasUndoOffer]);
  let placeOfField = (field?: Dynamic) => {
    if (isPlacedViewAskInput(field)) return 'chart';
    if (field === activeEditorRef.current) return 'cell';
    if (field === formulaBarRef.current) return 'formulaBar';
    if (field.classList.contains('sheet-name-field')) return 'sheetName';
    return sidePaneRef.current?.contains(field) === true ? 'sidePane' : null;
  };
  let sidePaneInputs = () => [...(sidePaneRef.current?.querySelectorAll('input') ?? [])];
  let fieldLeftForMenuRef = React.useRef(null);
  let focusBeforeMenuRef = React.useRef(null);
  let closeMenuAndRefocus = React.useCallback(() => {
    let focusBefore = focusBeforeMenuRef.current;
    fieldLeftForMenuRef.current = null;
    store.dispatch({
      kind: 'menuClosed',
    });
    if (!(focusBefore instanceof HTMLElement && (focusBefore.closest('[role="menu"]') === null || isTextInputOrEntryEditor(focusBefore))))
      return focusCaret();
    let textField = isTextInputOrEntryEditor(focusBefore) && (focusBefore as Dynamic).selectionStart !== null ? focusBefore : null;
    let picked = [textField?.selectionStart ?? null, textField?.selectionEnd ?? null, textField?.selectionDirection ?? undefined];
    let [scrollLeft, scrollTop] = [focusBefore.scrollLeft, focusBefore.scrollTop];
    focusBefore.focus({
      preventScroll: true,
    });
    textField?.setSelectionRange(...picked);
    focusBefore.scrollTo(scrollLeft, scrollTop);
    return focusBefore.ownerDocument.activeElement === focusBefore ? undefined : focusCaret();
  }, [focusCaret, store]);
  let pasteKeyRef = React.useRef(null);
  let pasteEventRef = React.useRef(null);
  let notePasteEvent = React.useCallback((event?: Dynamic) => {
    pasteEventRef.current = event;
  }, []);
  let focusLeftRef = React.useRef(null);
  let isBlurDuringEventRef = React.useRef(false);
  let noteFieldLeft = (field?: Dynamic) => {
    if (focusTrackerRef.current?.isUnderWay() === true) return false;
    let { mode: mode2, peopleList: peopleList2 } = store.getView();
    let isPeopleListInField = mode2.kind !== 'editing' && (peopleList2?.inField ?? null) !== null;
    if (field === getGridOrEditorElement() && isPeopleListInField) {
      fieldLeftForMenuRef.current = {
        place: 'grid',
        text: '',
        indexInPane: -1,
        picked: [0, 0],
        pressesBefore: focusTrackerRef.current?.timesBegun() ?? 0,
      };
      return true;
    }
    if (!isTextInputOrEntryEditor(field)) return false;
    if (field.hasAttribute('data-is-going')) return false;
    if (field === cellEditorRef.current && whereTypingGoes(store.getView()) === 'grid') return false;
    let { selectionStart: selectionStart, selectionEnd: selectionEnd, selectionDirection: selectionDirection } = field;
    if (selectionStart === null) return false;
    fieldLeftForMenuRef.current = {
      place: placeOfField(field),
      text: field.value,
      indexInPane: sidePaneInputs().findIndex((input?: Dynamic) => input === field),
      picked: [selectionStart, selectionEnd, selectionDirection ?? undefined],
      pressesBefore: focusTrackerRef.current?.timesBegun() ?? 0,
    };
    return true;
  };
  let loseFocus = (mayComeBack?: Dynamic, isOfWindow: Dynamic = false) => {
    let { mode: mode2, openUnderCell: openUnderCell, isListOfKeysOpen: isListOfKeysOpen, linkForm: linkForm } = store.getView();
    if (mode2.kind !== 'editing' && openUnderCell === null) return;
    if (isListOfKeysOpen) return;
    if (isOfWindow && linkForm?.inEntry !== undefined)
      return store.dispatch({
        kind: 'pageMayBeEnded',
      });
    let typingField = typingFieldRef.current;
    store.dispatch({
      kind: 'focusLost',
      mayComeBack: mayComeBack,
      ...(isOfWindow && {
        isOfWindow: isOfWindow,
      }),
    });
    let blurFields = () => {
      let target = whereTypingGoes(store.getView());
      lastTypingTargetRef.current = target;
      if (target === 'grid') formulaBarRef.current?.blur();
      if (target === 'grid') typingField?.blur();
      if (target === 'grid' && mode2.kind === 'editing') cellEditorRef.current?.blur();
    };
    if (!store.isEventUnfinished()) return blurFields();
    return store.lookOnceEventsAreFinished(() => {
      if (cellsRef.current?.ownerDocument.hasFocus() === true && isFocusInCells() && focusLeftRef.current === null) return;
      blurFields();
    });
  };
  let [findTextGiven, setFindTextGiven] = React.useState(null);
  let [timesRenameBegunElsewhere, setTimesRenameBegunElsewhere] = React.useState(0);
  let focusPresence = (isByPress: Dynamic = false) => {
    let isUntouched = !isByPress && focusTrackerRef.current?.hasPersonActedSinceFocusLeft('keysToo') === false;
    return {
      wasHere: !isPageReallyLeft() || isUntouched,
      timesFocusHadLeft: focusTrackerRef.current?.timesFocusLeft() ?? 0,
    };
  };
  let isStillPresent = (presence?: Dynamic) =>
    presence !== null && isPageReallyLeft() && (presence.wasHere || (focusTrackerRef.current?.timesFocusLeft() ?? 0) !== presence.timesFocusHadLeft);
  let findPresenceRef = React.useRef(null);
  let [findBarKey, setFindBarKey] = React.useState(0);
  let openFind2 = (text?: Dynamic, isByScroll: Dynamic = false) => {
    if (isModalOpen(store.getView())) return;
    if (isByScroll) scrollGesture.begin();
    findPresenceRef.current = focusPresence(isByScroll);
    if (store.getView().find !== null && findBarRef.current === null) setFindBarKey((input?: Dynamic) => input + 1);
    store.dispatch({
      kind: 'findOpened',
    });
    setFindTextGiven(
      text === null
        ? null
        : {
            text: text,
          },
    );
    if (text !== null)
      store.dispatch({
        kind: 'findTextChanged',
        text: text,
        goesToCellFound: true,
      });
    loseFocus(false);
    findBarRef.current?.focus({
      preventScroll: true,
    });
    findBarRef.current?.select();
  };
  let openFindEmpty = () => openFind2(null);
  let openFindEvent = React.useEffectEvent(openFindEmpty);
  let openFindByScrollEvent = React.useEffectEvent(() => openFind2(null, true));
  let showReplace = () => {
    let presence = focusPresence();
    findPresenceRef.current = presence;
    store.onceWhatIsShownOfSelectionIsKnown(() => {
      if (!isStillPresent(presence))
        store.dispatch({
          kind: 'replaceShownChanged',
          isShown: true,
        });
    });
  };
  let showReplaceEvent = React.useEffectEvent(showReplace);
  let openReplace = () => {
    openFindEmpty();
    showReplace();
  };
  let closeFind2 = () => {
    let target = whereTypingGoes(store.getView());
    store.dispatch({
      kind: 'findClosed',
    });
    focusTypingTarget(target);
  };
  let stepFind = (by?: Dynamic) => {
    store.dispatch({
      kind: 'entryLeft',
    });
    store.dispatch({
      kind: 'findStepped',
      by: by,
    });
  };
  let stepFindEvent = React.useEffectEvent(stepFind);
  React.useEffect(() => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (ownerDocument === undefined) return;
    let onKeyDown = (event?: Dynamic) => {
      if (event.defaultPrevented || event.isComposing) return;
      let findStep = findStepShortcut(event);
      let isFromCells = [gridFocusRef, cellEditorRef, activeEditorRef, formulaBarRef].some(
        (input?: Dynamic) => input.current === event.target,
      );
      if (isFindShortcut(event) || (findStep !== null && store.getView().find === null)) openFindEvent();
      else if (isReplaceShortcut(event)) {
        openFindEvent();
        showReplaceEvent();
      } else if (findStep === null) return;
      else if (event.target instanceof Node && findBarRef.current?.closest('search')?.contains(event.target) === true) return;
      else if (isFromCells) stepFindEvent(findStep);
      event.preventDefault();
      event.stopPropagation();
    };
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    return () => ownerDocument.removeEventListener('keydown', onKeyDown, true);
  }, [store]);
  let focusBeforeKeysListRef = React.useRef(null);
  let placementBeforeKeysListRef = React.useRef(null);
  let cardUnderChartRef = React.useRef(null);
  React.useEffect(() => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (ownerDocument === undefined) return;
    let onKeyDown = (event?: Dynamic) => {
      if (event.defaultPrevented || event.isComposing || !isKeyboardShortcutsKey(event, IS_APPLE_PLATFORM)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (store.getView().isListOfKeysOpen)
        return store.dispatch({
          kind: 'listOfKeysShut',
        });
      let active = ownerDocument.activeElement;
      let placementId = placementIdOfElement(active);
      let returnTo = isPlacedViewAskInput(active) && placementId !== null ? findPlacedViewCaret(ownerDocument, placementId) : active;
      focusBeforeKeysListRef.current = active === ownerDocument.body ? null : returnTo;
      placementBeforeKeysListRef.current = isPlacedViewAskInput(active) ? placementId : null;
      return store.dispatch({
        kind: 'listOfKeysAsked',
      });
    };
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    return () => ownerDocument.removeEventListener('keydown', onKeyDown, true);
  }, [store]);
  React.useEffect(() => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (ownerDocument === undefined) return;
    let onKeyDown = (event?: Dynamic) => {
      if (event.defaultPrevented || event.isComposing || !isAllCommandsMenuKey(event, IS_APPLE_PLATFORM)) return;
      let { menu: menu2, viewOnlyBecause: viewOnlyBecause } = store.getView();
      let action = allCommandsMenuKeyAction({
        isPointerCoarse: isCoarsePointerNow(),
        canPersonEdit: viewOnlyBecause === null,
        isFromCells: false,
        menu: menu2,
        isRepeat: event.repeat,
      });
      if (action === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'shuts')
        store.dispatch({
          kind: 'menuClosed',
        });
    };
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    return () => ownerDocument.removeEventListener('keydown', onKeyDown, true);
  }, [store]);
  React.useEffect(() => (shell.offerFind(openFindByScrollEvent), () => shell.offerFind(null)), [shell]);
  let isPointerPressedLastRef = React.useRef(caretAtFirst?.wasPointerPressedLast === true);
  React.useLayoutEffect(
    () => () => caretAtFirst?.actsHeard.notePointerPressedLast(isPointerPressedLastRef.current),
    [caretAtFirst],
  );
  let isEscapeHeldInEditRef = React.useRef(false);
  let pressGuard = usePressGuardAfterViewMove(store, view.movesOfViewByItself, cellsRef);
  let wasPointerPressedLast = React.useCallback(() => isPointerPressedLastRef.current, []);
  let isBeforeAnyInputRef = React.useRef(true);
  let wasKeyPressedLast = React.useCallback(() => !isBeforeAnyInputRef.current && !isPointerPressedLastRef.current, []);
  let lastFocusedByKeyRef = React.useRef(null);
  let getLastFocusedByKey = React.useCallback(() => {
    let element = lastFocusedByKeyRef.current;
    if (element === null || !isElementLiveAndNotInert(element) || element.matches(':disabled')) return null;
    return element.getClientRects().length > 0 ? element : null;
  }, []);
  let lastReplaced = view.lastDone?.what === 'replaced' ? view.lastDone : null;
  let replaced = view.undoOffer?.kind === 'replacedInCells' ? view.undoOffer : lastReplaced;
  let findBar =
    view.find === null
      ? null
      : jsx(
          FindBarUnlessGivenUp,
          {
            find: view.find,
            fieldRef: findBarRef,
            replaceFieldRef: replaceFieldRef,
            canReplace: view.viewOnlyBecause === null,
            areFormulasShown: view.areFormulasShown,
            replaced: replaced,
            textGiven: findTextGiven,
            onText: (text?: Dynamic) =>
              store.dispatch({
                kind: 'findTextChanged',
                text: text,
                goesToCellFound: [findBarRef, replaceFieldRef].some(
                  ({ current: current }: Dynamic) => current !== null && current === current.ownerDocument.activeElement,
                ),
              }),
            onStep: stepFind,
            onReplaceAsked: showReplace,
            onOptions: (options?: Dynamic) =>
              store.dispatch({
                kind: 'findOptionsChanged',
                ...options,
              }),
            pane: {
              ref: sidePaneRef,
              takesNoTyping: sidePaneTakesNoTyping,
              width: sidePaneWidth,
              onWidthChange: setSidePaneWidth,
              wasPointerPressedLast: wasPointerPressedLast,
            },
            onReplace: (text?: Dynamic, where?: Dynamic) => {
              store.dispatch({
                kind: 'entryLeft',
              });
              store.dispatch({
                kind: 'replaceChosen',
                text: text,
                where: where,
              });
            },
            onUndoOrRedo: (event?: Dynamic) =>
              store.dispatch({
                kind: 'keyPressed',
                ...normalizedKeyEvent(event),
              }),
            onLookAgain: () =>
              store.dispatch({
                kind: 'findLookedAgain',
              }),
            onGoOn: (step?: Dynamic) => moveCaretTo(view.find?.isReplaceShown === true ? 'sidePane' : 'findBar', step),
            onClose: closeFind2,
            hasLeftSinceAsked: () => isStillPresent(findPresenceRef.current),
            onGivenUp: () => {
              focusChangesRef.current += 1;
              store.dispatch({
                kind: 'findClosed',
              });
            },
          },
          findBarKey,
        );
  let isFirstKeyAwaitedRef = React.useRef(false);
  let cancelKeyboardOfferRef = React.useRef(null);
  let isKeyboardOfferedRef = React.useRef(false);
  let wasPressInAskBoxRef = React.useRef(false);
  let isFocusLostUntouchedRef = React.useRef(false);
  let pressesAtWindowBlurRef = React.useRef(-1);
  let focusLostToNothingRef = React.useRef(null);
  let isDialogOwedCaretRef = React.useRef(false);
  let focusOpenModal = () => {
    if (!isModalOpen(store.getView())) return false;
    let ownerDocument = cellsRef.current?.ownerDocument;
    let dialog = [
      ...(ownerDocument?.querySelectorAll(`:is([data-ui=Dialog], [${CELL_HISTORY_CARD_ATTRIBUTE}]):not([data-ending-style])`) ?? []),
    ].at(-1);
    let initialFocus = dialog?.hasAttribute(INITIAL_FOCUS_IS_SAFE_ATTRIBUTE) === true ? dialog.querySelector('[data-initial-focus]') : null;
    let fallbackFocus = dialog?.querySelector(INITIAL_FOCUS_SELECTOR);
    for (let candidate of [focusLostToNothingRef.current, chooseFileButtonRef.current, initialFocus, fallbackFocus, dialog] as Dynamic) {
      if (!(candidate instanceof HTMLElement) || dialog?.contains(candidate) !== true) continue;
      candidate.focus({
        preventScroll: true,
      });
      if (ownerDocument?.activeElement === candidate) break;
    }
    return true;
  };
  let restoreFocus = (retry?: Dynamic, beforeRestore?: Dynamic) => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (ownerDocument === undefined) return;
    isFocusLostUntouchedRef.current = false;
    isFirstKeyAwaitedRef.current = false;
    if (ownerDocument.activeElement !== ownerDocument.body && ownerDocument.activeElement?.matches(':disabled') !== true) return;
    let noteFocusLost = () => {
      isFocusLostUntouchedRef.current =
        !mayFocusReturnToCells() &&
        ownerDocument.activeElement === ownerDocument.body &&
        ownerDocument.defaultView?.navigator.userActivation?.hasBeenActive !== true;
    };
    if (hasElementAwaitingKeyboard(ownerDocument)) return noteFocusLost();
    if (ownerDocument.getSelection()?.isCollapsed === false) return;
    if (focusLeftRef.current !== null) return;
    beforeRestore?.();
    if (beforeRestore !== undefined && ownerDocument.activeElement !== ownerDocument.body) return;
    let focusAfterModal = focusLostToNothingRef.current instanceof HTMLElement ? focusLostToNothingRef.current : null;
    let contextBarField = () =>
      ownerDocument.querySelector('[data-part-of-context-bar] :is([role="combobox"], [role="listbox"][tabindex="0"])');
    let isUntouchedSinceModal =
      focusTrackerRef.current?.timesBegun() === pressesAtWindowBlurRef.current &&
      !focusTrackerRef.current.hasPersonActedSinceFocusLeft('pressesOnly') &&
      store.getView().mode.kind === 'navigating';
    if (
      !focusOpenModal() &&
      !refocusInContextBar(focusAfterModal, () => ownerDocument.activeElement, contextBarField) &&
      !(isUntouchedSinceModal && focusSidePaneOrTitle(sidePaneRef.current, focusAfterModal))
    )
      refocusTypingTarget();
    noteFocusLost();
  };
  let isCellsCopyTarget = () => {
    let active = getActiveElement();
    if (active === null) return false;
    if (active === cellEditorRef.current) return whereTypingGoes(store.getView()) === 'grid';
    if (active === activeEditorRef.current) return store.getView().mode.kind !== 'editing';
    if (active instanceof HTMLInputElement) return false;
    return active === gridFocusRef.current || calendarPopupRef.current?.contains(active) === true;
  };
  let isFocusInEntryField = () => {
    let active = getActiveElement();
    return active !== null && (active === activeEditorRef.current || active === formulaBarRef.current);
  };
  let mayEntryTakeClipboard = () => isFocusInEntryField() && store.mayAnEntryOpenOrEnd();
  let isPlacedViewFocused = () => placementIdOfElement(getActiveElement()) !== null && !isPlacedViewAskInput(getActiveElement());
  let isPlacedViewFocusedWithoutText = () =>
    isPlacedViewFocused() && (cellsRef.current?.ownerDocument.getSelection()?.toString() ?? '') === '';
  let onCopyOrCut = React.useEffectEvent((event?: Dynamic) => {
    let { clipboardData: clipboardData } = event;
    let isEntryCopy = event.type === 'copy' && isFocusInEntryField() && store.mayWhatACopyHoldsChange();
    let isEntryCut = event.type === 'cut' && store.getView().mode.kind === 'editing';
    let isCellsTarget = isCellsCopyTarget() && !isEntryCut;
    if (!(clipboard.isBrowserAskedForCells() || isCellsTarget || isEntryCopy) || clipboardData === null) {
      clipboard.somethingElseCopiedHere();
      if (!isPlacedViewFocusedWithoutText() || clipboardData === null)
        return store.dispatch({
          kind: 'otherThanCellsCopied',
        });
      event.preventDefault();
      let view2 = store.getView();
      let sheetId = shownSheetIdOf(view2);
      let placementId = placementIdOfElement(getActiveElement());
      let placedView = view2.grid.placedViews.find((placed?: Dynamic) => placed.placementId === placementId);
      if (event.type === 'cut' || sheetId === null || placedView === undefined) {
        clipboard.duringCopy(clipboardData, () => clipboard.putOnClipboard(EMPTY_CLIPBOARD_CONTENT));
        return store.dispatch({
          kind: 'otherThanCellsCopied',
          ...(event.type === 'cut' && {
            ofChart: 'notCut',
          }),
        });
      }
      clipboard.duringCopy(
        clipboardData,
        () =>
          clipboard.putChartOnClipboard(
            {
              sheetId: sheetId,
              placementId: placedView.placementId,
            },
            placedView.name,
          ),
      );
      return store.dispatch({
        kind: 'otherThanCellsCopied',
        ofChart: 'copied',
      });
    }
    event.preventDefault();
    clipboard.duringCopy(
      clipboardData,
      () =>
        store.dispatch(
          event.type === 'cut'
            ? {
                kind: 'cutChosen',
                token: crypto.randomUUID(),
              }
            : {
                kind: 'copyChosen',
              },
        ),
    );
    if (likelyHasKeyboard() && cellsRef.current?.ownerDocument.hasFocus() === false) clipboard.forgetLastPutHere();
  });
  let onBeforeClipboard = React.useEffectEvent((event?: Dynamic) => {
    let isEntryTarget = event.type !== 'beforecut' && mayEntryTakeClipboard();
    let isEntryCut = event.type === 'beforecut' && store.getView().mode.kind === 'editing';
    if (
      clipboard.isBrowserAskedForCells() ||
      (isCellsCopyTarget() && !isEntryCut) ||
      isEntryTarget ||
      (event.type === 'beforepaste' ? isPlacedViewFocused() : isPlacedViewFocusedWithoutText())
    )
      event.preventDefault();
  });
  let onPaste = React.useEffectEvent((event?: Dynamic) => {
    let isPasteAfterBlur = isBlurDuringEventRef.current && isFocusNowhere();
    let isPasteFromMenu = pasteEventRef.current === event && pasteKeyRef.current?.isByKey() === true;
    pasteEventRef.current = null;
    let isCellsPaste = isCellsCopyTarget() || mayEntryTakeClipboard() || isPasteAfterBlur || isPasteFromMenu;
    let { clipboardData: clipboardData } = event;
    let isWithoutFormatting = pasteKeyRef.current?.isWithoutFormatting() === true;
    let chart = isWithoutFormatting ? null : clipboard.chartAtPasteOf(clipboardData);
    if (!isCellsPaste && (chart === null || !isPlacedViewFocused())) return;
    event.preventDefault();
    if (pasteKeyRef.current?.isHeldDown() === true) return;
    let pasteEvent =
      chart === null
        ? pasteChosenFrom(clipboard, clipboardData, isWithoutFormatting)
        : {
            kind: 'chartPasteChosen',
            chart: chart,
          };
    if (isPasteFromMenu) {
      store.dispatch({
        kind: 'menuClosed',
      });
      return store.dispatch(pasteEvent);
    }
    if (!isCellsPaste || !store.isEventUnfinished()) return store.dispatch(pasteEvent);
    let text = normalizeLineBreaks(clipboardData?.getData('text/plain') ?? '');
    let isCopyPending = store.isCopyOrCutYetToBeMade();
    return afterFocusLeavesTypedAhead(
      () => {
        let { mode: mode2 } = store.getView();
        let lastPutHere = isCopyPending ? clipboard.lastPutHere() : null;
        if (mode2.kind !== 'editing')
          return store.dispatch(lastPutHere === null ? pasteEvent : pasteChosenFrom(clipboard, lastPutHere, isWithoutFormatting));
        let pastedText = lastPutHere === null ? text : normalizeLineBreaks(lastPutHere.getData('text/plain'));
        let enteredText = isOneLineEditor(mode2) ? flattenEnteredText(pastedText) : trimTrailingNewlines(pastedText);
        return completeEditText(mode2, (text2?: Dynamic) => text2 + enteredText, true);
      },
      () => true,
    );
  });
  let restoreFieldLeft = (left?: Dynamic) => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    let active = ownerDocument?.activeElement ?? null;
    if (active === null) return;
    let field: Dynamic = active;
    if (left.place === 'sidePane' && active === ownerDocument?.body) {
      let paneInput = sidePaneInputs()[left.indexInPane];
      if (paneInput?.value !== left.text.trim() || paneInput.selectionStart === null) {
        focusPaneStart(sidePaneRef.current, 'lastUsed');
        return;
      }
      field = paneInput;
    }
    let placementId = getSelectedPlacementId();
    if (left.place === 'chart' && active === ownerDocument?.body && placementId !== null)
      field = findPlacedViewAskInput(ownerDocument, placementId) ?? active;
    if (left.place === null || placeOfField(field) !== left.place) return;
    if (!isTextInputOrEntryEditor(field)) return;
    field.focus({
      preventScroll: true,
    });
    if (field.value.trim() === left.text.trim()) (field.setSelectionRange as Dynamic)(...left.picked);
  };
  let settleFocusLeft = (how?: Dynamic) => {
    let focusLeft = focusLeftRef.current;
    if (focusLeft === null) return;
    clearTimeout(focusLeft.timer);
    focusLeftRef.current = null;
    if (how === 'windowLeft') return void (fieldLeftForMenuRef.current = focusLeft.left);
    let asItLeft = how === 'timeOrKey' && focusLeft.left.place !== 'sidePane';
    store.dispatch({
      kind: 'focusCameBack',
      asItLeft: asItLeft,
    });
    if (how === 'pressOrFocus') return;
    let wasInEntry = focusLeft.left.place === 'cell' || focusLeft.left.place === 'formulaBar';
    isBlurDuringEventRef.current = wasInEntry && store.isEventUnfinished();
    store.lookOnceEventsAreFinished(() => {
      isBlurDuringEventRef.current = false;
      ReactDOM.flushSync(() => {
        return;
      });
      restoreFieldLeft(focusLeft.left);
      restoreFocus();
    });
  };
  let [dragHoldTracker] = React.useState(() => createDragHoldTracker(store));
  let menuAtBeforeCloseRef = React.useRef(null);
  let onWindowLeft = React.useEffectEvent(() => {
    settleFocusLeft('windowLeft');
    lastFocusedByKeyRef.current = null;
    store.dispatch({
      kind: 'windowCaretChanged',
      hasCaret: false,
    });
    loseFocus(noteFieldLeft(cellsRef.current?.ownerDocument.activeElement ?? null), true);
    store.dispatch({
      kind: 'dropdownEditorActedIn',
      act: {
        kind: 'enter',
        thenStartsOption: false,
      },
    });
    if (!isBlurPending())
      store.dispatch({
        kind: 'menuClosed',
      });
    store.dispatch({
      kind: 'calendarClosed',
    });
    let { isFillHandleHeld: isFillHandleHeld, areCellsHeld: areCellsHeld, placedViewHeldBy: placedViewHeldBy } = store.getView().grid;
    if (isFillHandleHeld || areCellsHeld || placedViewHeldBy !== null)
      store.dispatch({
        kind: 'pointerCanceled',
      });
    dragHoldTracker.forget();
  });
  let onWindowBlur = React.useEffectEvent(() => {
    pressesAtWindowBlurRef.current = focusTrackerRef.current?.timesBegun() ?? -1;
    wasTabKeyDownRef.current = false;
    isPointerHeldOutsideRef.current = false;
    scrollGesture.end();
    isEscapeHeldInEditRef.current = false;
    if (likelyHasKeyboard()) clipboard.forgetLastPutHere();
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (ownerDocument !== undefined) whenWindowBlurred(ownerDocument, () => onWindowLeft());
  });
  let restoreFocusEvent = React.useEffectEvent(restoreFocus);
  let restoreFocusOnClick = React.useEffectEvent(() => restoreFocus());
  let { noteCommentChosen: noteCommentChosen, isCaretLeft: isCaretLeftForComment } = useCaretAfterComment(restoreFocus);
  let isModalOpenNow = React.useEffectEvent(() => isModalOpen(store.getView()));
  let onWindowFocus = React.useEffectEvent(() => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (ownerDocument !== undefined && ownerDocument.activeElement === ownerDocument.body) wasTabKeyDownRef.current = true;
    store.dispatch({
      kind: 'windowCaretChanged',
      hasCaret: true,
    });
    if (focusLeftRef.current !== null) return;
    let fieldLeft = fieldLeftForMenuRef.current;
    fieldLeftForMenuRef.current = null;
    if (fieldLeft === null || fieldLeft.pressesBefore !== focusTrackerRef.current?.timesBegun())
      return store.dispatch({
        kind: 'focusCameBack',
        asItLeft: false,
      });
    let timer = setTimeout(() => settleFocusLeft('timeOrKey'), FOCUS_COMING_BACK_WAIT_MS);
    focusLeftRef.current = {
      left: fieldLeft,
      timer: timer,
    };
  });
  let isPressOnActiveCellAfterLeave = ({ target: target, clientX: clientX, clientY: clientY }: Dynamic) => {
    let placeLeft = focusLeftRef.current?.left.place;
    let activeCellElementId2 = store.getView().grid.activeCellElementId;
    if ((placeLeft !== 'cell' && placeLeft !== 'formulaBar') || activeCellElementId2 === null) return false;
    if (!(target instanceof Node) || cellsRef.current?.contains(target) !== true) return false;
    let activeCellBox = cellsRef.current.ownerDocument.getElementById(activeCellElementId2)?.getBoundingClientRect();
    if (activeCellBox === undefined) return false;
    return activeCellBox.left <= clientX && clientX <= activeCellBox.right && activeCellBox.top <= clientY && clientY <= activeCellBox.bottom;
  };
  let awaitFirstKey = (how?: Dynamic) => {
    isFirstKeyAwaitedRef.current = how;
    caretAtFirst?.actsHeard.restBeginsNow();
  };
  let awaitKeyUnderTypist = React.useEffectEvent(() => {
    if (!wasPressInAskBoxRef.current || caretAtFirst === undefined) return false;
    awaitFirstKey('underTypist');
    return true;
  });
  let takeCaretAtFirst = () => restoreFocus(offerCaretAtFirst);
  let takeCaretWhenFocused = () => {
    if (cellsRef.current?.ownerDocument.hasFocus() === true) takeCaretAtFirst();
  };
  let offerCaretAtFirst = () => {
    if (cellsRef.current?.ownerDocument.hasFocus() !== true) return;
    if (caretAtFirst === undefined || !caretAtFirst.mayCellsTake()) return;
    if (caretAtFirst.mustCellsWait()) return awaitFirstKey('atFirst');
    let caret = cancelKeyboardOfferRef.current === null && caretAtFirst.doCellsTakeOncePainted() ? getCaretElement() : null;
    if (caret === null) return takeCaretAtFirst();
    isKeyboardOfferedRef.current = true;
    cancelKeyboardOfferRef.current = offerKeyboardWhenReady(caret, takeCaretWhenFocused, {
      onGivenUp: () => {
        isKeyboardOfferedRef.current = false;
      },
    });
  };
  let offerCaretAtFirstEvent = React.useEffectEvent(offerCaretAtFirst);
  let forwardKeyToCaret = (event?: Dynamic) => {
    if (!isBlurDuringEventRef.current) return false;
    let caret = getCaretElement();
    if (caret === null || event.target !== caret.ownerDocument.body) return false;
    let isComposing2 = event.isComposing || event.keyCode === 229 || event.key === 'Dead';
    if (!event.isTrusted || event.defaultPrevented || isComposing2 || MODIFIER_KEYS.has(event.key)) return false;
    if (!caret.dispatchEvent(redispatchedKeydown(event))) event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  };
  let onWindowKeyDown = React.useEffectEvent((event?: Dynamic) => {
    if (focusLeftRef.current !== null && event.key === 'Tab') event.preventDefault();
    settleFocusLeft('timeOrKey');
    if (forwardKeyToCaret(event)) return;
    if (isAltCommandPress(normalizedKeyEvent(event), IS_APPLE_PLATFORM)) event.preventDefault();
    let { viewOnlyBecause: viewOnlyBecause, mode: mode2 } = store.getView();
    if (viewOnlyBecause !== null || !isFillDownOrRightKey(event, IS_APPLE_PLATFORM)) return;
    event.preventDefault();
    let isSyntheticOnCaret = !event.isTrusted && event.target === getCaretElement();
    if (!event.repeat && (mode2.kind === 'editing' || !(isCellsCopyTarget() || isSyntheticOnCaret)))
      store.dispatch({
        kind: 'fillKeyPressedOutsideCells',
      });
  });
  let onWindowKeyDownFirst = React.useEffectEvent((event?: Dynamic) => {
    if (!event.isTrusted || MODIFIER_KEYS.has(event.key)) return;
    if (event.target !== cellsRef.current?.ownerDocument.body) isFirstKeyAwaitedRef.current = false;
    let isFirstKeyForCells =
      caretAtFirst !== undefined &&
      isFirstKeyAwaitedRef.current !== false &&
      event.key !== 'Escape' &&
      caretAtFirst.actsHeard.hadRestedBeforeLast() &&
      (isFirstKeyAwaitedRef.current === 'underTypist' || caretAtFirst.mayKeyEndWait(event));
    if (isFirstKeyAwaitedRef.current === 'underTypist' && !isFirstKeyForCells && event.key === 'Tab') event.preventDefault();
    let isEscapeWhileEditing = isFirstKeyAwaitedRef.current !== false && event.key === 'Escape' && store.getView().mode.kind === 'editing';
    let isForOpenModal = event.target === cellsRef.current?.ownerDocument.body && isModalOpen(store.getView());
    let isKeyboardOffered = isKeyboardOfferedRef.current && event.target === cellsRef.current?.ownerDocument.body;
    if (isKeyboardOffered && event.repeat) {
      event.preventDefault();
      return event.stopImmediatePropagation();
    }
    if (!isFocusLostUntouchedRef.current && !isFirstKeyForCells && !isForOpenModal && !isEscapeWhileEditing && !isKeyboardOffered) return;
    if (isKeyboardOffered) {
      cancelKeyboardOfferRef.current?.();
      measureGridRef.current?.();
    }
    isFocusLostUntouchedRef.current = false;
    isFirstKeyAwaitedRef.current = false;
    let ownerDocument = cellsRef.current?.ownerDocument;
    if (event.target !== ownerDocument?.body) return;
    let isComposing2 = event.isComposing || event.keyCode === 229 || event.key === 'Dead';
    let mayForward = !event.defaultPrevented && !isComposing2;
    if (isEscapeWhileEditing) event.preventDefault();
    let forwardTo = (target?: Dynamic) => {
      if (target === null || target === ownerDocument.body || !mayForward) return;
      if (!target.dispatchEvent(redispatchedKeydown(event))) event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (isForOpenModal) {
      if (isDialogOwedCaretRef.current) focusLostToNothingRef.current = null;
      isDialogOwedCaretRef.current = false;
      focusOpenModal();
      let isSafeFocus =
        ownerDocument.activeElement === chooseFileButtonRef.current ||
        ownerDocument.activeElement?.matches(`[${INITIAL_FOCUS_IS_SAFE_ATTRIBUTE}] [data-initial-focus],${INITIAL_FOCUS_SELECTOR}`) === true;
      if (event.key === 'Tab' && isSafeFocus) return event.preventDefault();
      return forwardTo(ownerDocument.activeElement);
    }
    if (store.getView().find !== null) {
      findBarRef.current?.focus({
        preventScroll: true,
      });
      return forwardTo(ownerDocument.activeElement);
    }
    if (isEscapeWhileEditing) {
      forwardTo(getCaretElement());
      ReactDOM.flushSync(() => {
        return;
      });
      return restoreFocus();
    }
    return restoreFocus(undefined, () => {
      forwardTo(getCaretElement());
      ReactDOM.flushSync(() => {
        return;
      });
    });
  });
  React.useEffect(() => {
    let win = cellsRef.current?.ownerDocument.defaultView ?? null;
    if (win === null) return;
    let onBlur = () => onWindowBlur();
    let onFocusMove = ({ type: type, target: target, relatedTarget: relatedTarget }: Dynamic) => {
      isDialogOwedCaretRef.current = false;
      if (type === 'focusin') isKeyboardOfferedRef.current = false;
      focusLostToNothingRef.current = type === 'focusout' && relatedTarget === null ? target : null;
      if (focusLostToNothingRef.current !== null) isPointerHeldOutsideRef.current = false;
    };
    let check = () => restoreFocusEvent();
    let onClick = () => restoreFocusOnClick();
    let pressTracker = createPressTracker(win);
    focusTrackerRef.current = pressTracker;
    let stopHoldingFocus = holdProgrammaticFocus(
      win,
      () => !isTrustedPointerDownEvent(win) && mayFocusReturnToCellsEvent(),
      giveUpPopupAround,
    );
    let pasteKeys = createPasteKeyTracker(win);
    pasteKeyRef.current = pasteKeys;
    let focusCheck = createWindowFocusCheck({
      check: check,
      isDialogOpen: () => isModalOpenNow(),
      isDialogOwedCaret: () => isDialogOwedCaretRef.current,
      timesFocusLeft: pressTracker.timesFocusLeft,
    });
    let onFocus = () => {
      try {
        onWindowFocus();
      } finally {
        pressTracker.afterPress(focusCheck.windowGotFocus);
      }
    };
    let onCopy = (input?: Dynamic) => onCopyOrCut(input);
    let onPasteEvent = (input?: Dynamic) => onPaste(input);
    let onBeforeClipboardEvent = (input?: Dynamic) => onBeforeClipboard(input);
    let onKeyDownEvent = (input?: Dynamic) => onWindowKeyDown(input);
    let onKeyDownFirstEvent = (input?: Dynamic) => onWindowKeyDownFirst(input);
    let beforeEvents = ['beforecopy', 'beforecut', 'beforepaste'];
    win.addEventListener('blur', onBlur);
    win.addEventListener('focusout', onFocusMove);
    win.addEventListener('focusin', onFocusMove);
    win.addEventListener('focus', onFocus);
    win.addEventListener('click', onClick);
    win.addEventListener('copy', onCopy);
    win.addEventListener('cut', onCopy);
    win.addEventListener('paste', onPasteEvent);
    win.addEventListener('keydown', onKeyDownFirstEvent, true);
    win.addEventListener('keydown', onKeyDownEvent, true);
    for (let type of beforeEvents as Dynamic) win.addEventListener(type, onBeforeClipboardEvent);
    offerCaretAtFirstEvent();
    return () => {
      clearTimeout(focusLeftRef.current?.timer);
      cancelKeyboardOfferRef.current?.();
      cancelKeyboardOfferRef.current = null;
      focusCheck.stop();
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('focusout', onFocusMove);
      win.removeEventListener('focusin', onFocusMove);
      pressTracker.stop();
      stopHoldingFocus();
      pasteKeys.stop();
      win.removeEventListener('focus', onFocus);
      win.removeEventListener('click', onClick);
      win.removeEventListener('copy', onCopy);
      win.removeEventListener('cut', onCopy);
      win.removeEventListener('paste', onPasteEvent);
      win.removeEventListener('keydown', onKeyDownFirstEvent, true);
      win.removeEventListener('keydown', onKeyDownEvent, true);
      for (let value of beforeEvents as Dynamic) win.removeEventListener(value, onBeforeClipboardEvent);
    };
  }, []);
  let askLinkCard2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'linkCardAsked',
        at: null,
      }),
    [store],
  );
  let linkOpener = React.useMemo(
    () => ({
      open: (url?: Dynamic, place?: Dynamic) =>
        place !== 'typed' && store.getView().linksAmongTextOfActiveCell?.urls.includes(url) === true
          ? openLinkFromCard(url, place)
          : openLink(url, place),
      askForCard: askLinkCard2,
      isCardHeldBack: isAnyLayerHeldBack,
    }),
    [store, openLink, openLinkFromCard, askLinkCard2, isAnyLayerHeldBack],
  );
  let menuKeyEventRef = React.useRef(null);
  let isKeyForLayer = React.useCallback(
    (event?: Dynamic, layer?: Dynamic) =>
      (layer !== null && heldBackLayersRef.current.has(layer)) ||
      (event.key === 'Escape' && heldBackLayersRef.current.size > 0) ||
      event.nativeEvent === menuKeyEventRef.current,
    [],
  );
  let isKeyOfMenu = React.useCallback(
    (event?: Dynamic) => isKeyForLayer(event, null) || (event.key === 'Enter' && heldBackLayersRef.current.size > 0),
    [isKeyForLayer],
  );
  let mayKeyActHere = (event?: Dynamic, act?: Dynamic, mode2?: Dynamic) => {
    let { formatOfSelection: formatOfSelection2, viewOnlyBecause: viewOnlyBecause } = store.getView();
    let isActOfModifiedKey =
      act.kind === 'showSheetBeside' ||
      act.kind === 'actOnGroups' ||
      act.kind === 'writeInEntry' ||
      (act.kind === 'actOnLists' && act.key === 'lineBreak');
    if (isAltShortcutKey(event) && !isActOfModifiedKey) return false;
    if (event.ctrlKey && event.altKey && isActLeftToCtrlAlt(normalizedKeyEvent(event).key, act)) return false;
    if (act.kind === 'formatCells' && formatOfSelection2 === null) return false;
    if (act.kind === 'fill' && viewOnlyBecause !== null) return false;
    if (act.kind === 'askForLinkForm') return !isMacCtrlLetterWhileEditing(event, mode2) && store.isNextEventHandledAtOnce();
    return !(act.kind === 'formatCells' && isMacCtrlLetterWhileEditing(event, mode2));
  };
  let typeAheadIntoEntry = (event?: Dynamic, onKeyDown?: Dynamic) => {
    if (!store.mayAnEntryOpenOrEnd()) return false;
    let keyEvent = normalizedKeyEvent(event);
    let {
      mode: mode2,
      openUnderCell: openUnderCell,
      escapeInCells: escapeInCells,
      isSteppedOutOfCells: isSteppedOutOfCells,
    } = store.getView();
    if (keyEvent.key === 'Tab' && isSteppedOutOfCells) return false;
    if (
      ![[NAVIGATING_MODE, null], ...BLANK_AND_FORMULA_ENTRY_MODES.map((input?: Dynamic) => [input, null]), [mode2, openUnderCell]].some(
        ([mode3, openUnderCell2]: Dynamic) => {
          let act = keyActOf(mode3, keyEvent, openUnderCell2, escapeInCells);
          return act !== null && mayKeyActHere(event, act, mode3);
        },
      ) &&
      !isOpenLinkShortcut(NAVIGATING_MODE, keyEvent)
    )
      return false;
    event.preventDefault();
    let actWhileNavigating = keyActOf(NAVIGATING_MODE, keyEvent, null, 'leaves');
    let shouldReplay =
      (actWhileNavigating?.kind === 'startEditing' && actWhileNavigating.text !== null && actWhileNavigating.text !== ' ') ||
      /^(Arrow(Up|Down|Left|Right)|Escape)$/.test(keyEvent.key);
    afterFocusLeavesTypedAhead(
      () => onKeyDown(event, true),
      (mode3?: Dynamic) => {
        let view2 = store.getView();
        return (
          keyActOf(mode3, keyEvent, view2.openUnderCell, view2.escapeInCells, view2) === null && entryTextAfterKey(mode3.text, keyEvent) !== null
        );
      },
      shouldReplay ? () => void getActiveElement()?.dispatchEvent(redispatchedKeydown(event.nativeEvent)) : undefined,
    );
    return true;
  };
  let endWaitForPeopleOnKey = (event?: Dynamic, isComposing2?: Dynamic) => {
    if (isComposing2) noteInputMethodIfKeyboard();
    if (isComposing2) store.endWaitForPeople('goOn');
    else if (event.key === 'Escape' && !isKeyForLayer(event, null)) store.endWaitForPeople('callOff');
  };
  let isComposingRef = React.useRef(false);
  let isSpaceHeldRef = React.useRef(false);
  let isShiftHeldRef = React.useRef(false);
  let noteModifierKeys = ({ type: type, key: key, code: code, keyCode: keyCode, shiftKey: shiftKey }: Dynamic) => {
    if (type === 'keyup' || code !== 'Space') isSpaceHeldRef.current = false;
    if (type === 'keyup' && keyCode === 229) return;
    isShiftHeldRef.current = type === 'keydown' ? shiftKey || key === 'Shift' : shiftKey && key !== 'Shift';
  };
  let placedViewPressRef = React.useRef(null);
  let notePlacedViewPress = React.useCallback((press?: Dynamic) => {
    placedViewPressRef.current = press;
  }, []);
  let placementLeftRef = React.useRef(null);
  let onPlacedViewCaret = (placementId?: Dynamic, how?: Dynamic, target?: Dynamic) => {
    let caretTarget =
      typeof target === 'string'
        ? target
        : {
            partOf: placementIdOfElement(target),
          };
    if (how === 'left' && doesCaretStayWithPlacement(placementId, caretTarget)) return;
    let isLeftForNothing = target === 'onNothing' && placementIdOfElement(getActiveElement()) !== null;
    if (how === 'left' && !isLeftForNothing) placementLeftRef.current = placementId;
    let isByKey = typeof target !== 'string' && !isPointerPressedLastRef.current;
    let isFromCells = target === cellEditorRef.current || target === gridFocusRef.current;
    let act =
      how === 'come'
        ? {
            kind: 'select',
            isByKey: isByKey,
            isForAskBox: isPlacedViewAskInput(getActiveElement()),
          }
        : {
            kind: 'leave',
            isForCells: isByKey && isFromCells,
          };
    store.dispatch({
      kind: 'placedViewActedOn',
      placementId: placementId,
      act: act,
    });
  };
  let actOnPlacedView = (placementId?: Dynamic, act?: Dynamic) => {
    store.dispatch({
      kind: 'placedViewActedOn',
      placementId: placementId,
      act: act,
    });
    if (act.kind === 'delete')
      swallowRepeatedDeleteKeys(cellsRef.current?.ownerDocument.defaultView, (then?: Dynamic) => store.lookOnceEventsAreFinished(then));
    whenFocusStays(refocusTypingTarget, 'dispatchesNothing');
  };
  let askForPlacedViewMenu = (placementId?: Dynamic, at?: Dynamic) => {
    let { placedViews: placedViews } = store.getView().grid;
    if (placedViews.find((placed?: Dynamic) => placed.placementId === placementId)?.canBeChanged !== true) return;
    if (cardUnderChartRef.current?.isChangeUnderWay(placementId) === true) return;
    actOnPlacedView(placementId, {
      kind: 'askForMenu',
      at: at,
      canAgentChangeIt: cardUnderChartRef.current?.canAgentChange(placementId) === true,
    });
  };
  let leavePlacedViewOnPress = (event?: Dynamic) => {
    let { target: target, button: button } = event;
    let placementId = getSelectedPlacementId();
    let isOnBarButton = button === 0 && target instanceof Element && target.closest(`button, [${CONTEXT_BAR_PART_ATTRIBUTE}]`) !== null;
    if (placementId !== null && isOnBarButton)
      actOnPlacedView(placementId, {
        kind: 'leave',
        isForCells: false,
      });
  };
  let placedViewPressedRef = React.useRef(null);
  let placedViewPointerRef = React.useRef(null);
  let tapHoldEndRef = React.useRef(null);
  let placedViewLiftRef = React.useRef(null);
  let fitZoomRef = React.useRef(null);
  React.useEffect(() => gridZoom.subscribe(() => void (fitZoomRef.current = null)), [gridZoom]);
  let [placedViewTap, setPlacedViewTap] = React.useState(null);
  let noteCaretAtEnd = () =>
    store.dispatch({
      kind: 'caretAtEndChanged',
      at: caretAtEndRef.current,
    });
  let noteCaretAtEndOnKey = (key?: Dynamic) => {
    if (!MODIFIER_KEYS.has(key) && !/^(?:F\d+|Page(?:Up|Down)|ContextMenu|Tab)$/.test(key)) noteCaretAtEnd();
  };
  let onAtEndOfSheetKeyDown = (event?: Dynamic) => {
    if (!isAtEndOfSheetInput(event.target) && isRepeatedEnterOrSpace(event)) return event.preventDefault();
    if (event.key !== 'Escape') noteCaretAtEndOnKey(event.key);
    if (event.key === 'ArrowDown' && event.target === getAddColumnsButton()) {
      event.preventDefault();
      return askColumnCountCard(true);
    }
    let focusMove = focusMoveOfKey(normalizedKeyEvent(event));
    let isArrowKey = !isAtEndOfSheetInput(event.target) && event.key in ARROW_KEY_STEPS;
    if (event.key === 'F6' || isArrowKey || focusMove !== null) event.preventDefault();
    if (focusMove === 'cells') return focusTypingTarget('grid');
    if (focusMove !== null) return void moveCaretTo('endOfSheet', focusMove === 'nextPart' ? 1 : -1);
    if (isArrowKey) return void focusAtEndOfSheetField(event.target, ARROW_KEY_STEPS[event.key] ?? 1);
    if (event.key !== 'Tab') return;
    let step = event.shiftKey ? -1 : 1;
    let hasMoved = focusAtEndOfSheetField(event.target, step);
    if (hasMoved) noteCaretAtEnd();
    let isTypingElsewhere = whereTypingGoes(store.getView()) !== 'grid';
    if (hasMoved || (isTypingElsewhere && moveCaretFromCells(step === -1 ? 'charts' : 'endOfSheet', step))) event.preventDefault();
    return;
  };
  let startsEditing = (event?: Dynamic) => {
    let view2 = store.getView();
    let { mode: mode2, openUnderCell: openUnderCell, escapeInCells: escapeInCells } = view2;
    let act = keyActOf(mode2, normalizedKeyEvent(event), openUnderCell, escapeInCells, view2);
    return act?.kind === 'startEditing' && act.text !== null && act.text !== ' ' && mayKeyActHere(event, act, mode2);
  };
  let onOffersAtSelectionKeyDown = (event?: Dynamic) => {
    if (isRepeatedEnterOrSpace(event)) return event.preventDefault();
    let focusMove = focusMoveOfKey(normalizedKeyEvent(event));
    let step = ARROW_KEY_STEPS[event.key];
    if (event.key === 'F6' || event.key === 'Tab' || step !== undefined || focusMove !== null) event.preventDefault();
    if (focusMove === 'cells' || event.key === 'Tab') return focusTypingTarget('grid');
    if (focusMove !== null) return void moveCaretTo('offersAtSelection', focusMove === 'nextPart' ? 1 : -1);
    if (step !== undefined) focusNeighbourOffer(event.target, step);
    return;
  };
  let onCellsKeyDown = (event?: Dynamic, isReplayed: Dynamic = false) => {
    isComposingRef.current = event.nativeEvent.isComposing || event.keyCode === 229;
    if (!isReplayed) noteModifierKeys(event);
    if (!isReplayed) endWaitForPeopleOnKey(event, isComposingRef.current);
    if (isComposingRef.current && isInAtEndOfSheet(event.target)) noteCaretAtEnd();
    if (isComposingRef.current) return;
    let wereCommentsUp = mouseAroundComments.isUp();
    if (!MODIFIER_KEYS.has(event.key)) mouseAroundComments.putAway();
    if (wereCommentsUp && event.key === 'Escape' && store.getView().escapeInCells !== 'leaves') {
      event.preventDefault();
      return;
    }
    let isInAtEndOfSheet2 = isInAtEndOfSheet(event.target) && !isAtEndOfSheetInput(event.target);
    let isCommandInAtEnd = isInAtEndOfSheet2 && isCommandHeld(event);
    let startsEditingFromEnd = isInAtEndOfSheet2 && !isCommandInAtEnd && (isReplayed || startsEditing(event));
    if (isInAtEndOfSheet(event.target) && !isCommandInAtEnd && !startsEditingFromEnd) return onAtEndOfSheetKeyDown(event);
    if (startsEditingFromEnd && !isReplayed) {
      forgetComeToByTab();
      focusTypingTarget('grid');
    }
    if (isInOffersAtSelection(event.target) && !isCommandHeld(event)) return onOffersAtSelectionKeyDown(event);
    let placementId = placementIdOfElement(event.target);
    if (placementId !== null) {
      let value = cellsRef.current?.ownerDocument;
      if (
        value !== undefined &&
        !isPlacedViewAskInput(event.target) &&
        cardUnderChartRef.current?.takeKey(placementId, {
          key: event.key,
          isCharacter: isTypingKey(event, IS_APPLE_PLATFORM),
          isOnChartItself: event.target === findPlacedViewCaret(value, placementId),
          madeAtMs: event.nativeEvent.timeStamp,
        }) === true
      ) {
        event.preventDefault();
        return;
      }
      let value2 = focusMoveOfKey(normalizedKeyEvent(event));
      if (event.key === 'F6' && !event.altKey) event.preventDefault();
      if (value2 === 'nextPart' || value2 === 'partBefore') {
        store.dispatch({
          kind: 'placedViewActedOn',
          placementId: placementId,
          act: {
            kind: 'leave',
            isForCells: value2 === 'partBefore',
          },
        });
        return whenFocusStays(() => void moveCaretTo('charts', value2 === 'nextPart' ? 1 : -1));
      }
      if (isPlacedViewAskInput(event.target)) return;
      if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && !isInPlacedViewAskBox(event.target)) {
        event.preventDefault();
        return askForPlacedViewMenu(placementId, null);
      }
      let value3 = placedViewKeyAct(normalizedKeyEvent(event));
      let value4 = isInPlacedViewControls(event.target) && value3?.kind !== 'leave' ? null : value3;
      if (value4 === null && !isCommandHeld(event)) return;
      if (value4 !== null) {
        event.preventDefault();
        return actOnPlacedView(placementId, value4);
      }
    }
    if (!isReplayed && typeAheadIntoEntry(event, onCellsKeyDown)) return;
    if (isKeyForLayer(event, null)) return;
    let isAltEnter = event.key === 'Enter' && event.altKey && !event.metaKey && (IS_APPLE_PLATFORM || !event.ctrlKey);
    let isCommandEnter = event.key === 'Enter' && isCommandHeld(event) && !event.altKey && !event.shiftKey;
    let { openUnderCell: openUnderCell, viewOnlyBecause: viewOnlyBecause, hasCellsToFill: hasCellsToFill } = store.getView();
    if ((isAltEnter || (isCommandEnter && !hasCellsToFill)) && doesPopupLetLineBreak(openUnderCell, isAltEnter) && viewOnlyBecause === null)
      giveEntryBoxOfItsOwn(store, entryFieldRefs);
    if (event.key === 'Enter' && isCommandHeld(event) && event.shiftKey && !event.altKey && openUnderCell === null && viewOnlyBecause === null)
      giveEntryBoxOfItsOwn(store, entryFieldRefs);
    if (fontMarkOfShortcut(normalizedKeyEvent(event)) !== undefined && viewOnlyBecause === null) giveEntryBoxToFormat(store, entryFieldRefs);
    if (listKindOfShortcut(normalizedKeyEvent(event)) !== undefined && viewOnlyBecause === null) giveEntryBoxOfItsOwn(store, entryFieldRefs);
    let view2 = store.getView();
    let isPlainTabFromCells =
      !isReplayed && placementId === null && isPlainTabWhileNavigating(event, view2.mode, isNotComeToByTabRef.current);
    if (isPlainTabFromCells && REDISPATCHED_KEYDOWNS.has(event.nativeEvent)) {
      event.preventDefault();
      return markComeToByTab();
    }
    if (isPlainTabFromCells) {
      ReactDOM.flushSync(
        () =>
          store.dispatch({
            kind: 'tabGoesOnFromCells',
          }),
      );
      return gridFocusRef.current?.focus({
        preventScroll: true,
      });
    }
    let isCtrlAltEnter =
      IS_APPLE_PLATFORM && event.ctrlKey && event.altKey && !event.metaKey && event.key === 'Enter' && view2.mode.kind === 'editing';
    let keyEvent = {
      ...normalizedKeyEvent(event),
      ...(isCtrlAltEnter && {
        isAltHeld: true,
      }),
      ...caretInEntryPatch(view2.mode, entryFieldRefs),
    };
    if (placementId === null && openLinkFromKey(event, keyEvent, view2, linkOpener)) return;
    let { mode: mode2, openUnderCell: openUnderCell2, escapeInCells: escapeInCells, notice: notice2 } = view2;
    let allCommandsAction = !isAllCommandsMenuKey(event, IS_APPLE_PLATFORM)
      ? null
      : allCommandsMenuKeyAction({
          isPointerCoarse: isCoarsePointerNow(),
          canPersonEdit: view2.viewOnlyBecause === null,
          isFromCells: placementId === null && mode2.kind === 'navigating' && openUnderCell2 === null,
          menu: view2.menu,
          isRepeat: event.repeat,
        });
    if (allCommandsAction !== null) {
      event.preventDefault();
      return allCommandsAction === 'opens'
        ? store.dispatch({
            kind: 'menuAsked',
            at: null,
            isToSearch: true,
          })
        : undefined;
    }
    let act = keyActOf(mode2, keyEvent, openUnderCell2, escapeInCells, view2);
    if ((placementId !== null || isCommandInAtEnd || isInOffersAtSelection(event.target)) && act !== null && !isUndoOrFormulasToggle(act)) return;
    let isAltEnterInEntry = mode2.kind === 'editing' && keyEvent.key === 'Enter' && keyEvent.isAltHeld;
    if (act === null && isAltEnterInEntry) return event.preventDefault();
    if (act === null || !mayKeyActHere(event, act, mode2)) {
      if (isReplayed && mode2.kind === 'editing') completeEditText(mode2, (text?: Dynamic) => entryTextAfterKey(text, keyEvent));
      let value = isCommandHeld(event) || (IS_APPLE_PLATFORM && event.ctrlKey);
      let isUnhandled =
        act === null || ((act.kind === 'formatCells' || act.kind === 'askForLinkForm') && isMacCtrlLetterWhileEditing(event, mode2));
      if (
        isUnhandled &&
        mode2.kind === 'editing' &&
        movesCaretInEntry({
          ...keyEvent,
          isModifierHeld: value,
        })
      )
        store.dispatch({
          kind: 'caretPlacedInEntry',
        });
      let value2 = /^Page(?:Up|Down)$/.test(keyEvent.key) && !isCommandHeld(event) && !event.altKey;
      let value3 =
        mode2.kind === 'editing' &&
        (mode2.typingIn === 'formulaBar'
          ? formulaBarLines.lineCountWithCaret === 1
          : !mode2.text.includes(`
`) && view2.grid.editorLineCount === 1);
      let { caretInEntry: value4 } = keyEvent;
      let isCaretAtEnd = value4 !== undefined && value4.start === value4.text.length;
      let isShiftPageDownAtEnd = keyEvent.key === 'PageDown' && keyEvent.isShiftHeld && isCaretAtEnd;
      if (isUnhandled && value2 && (value3 || isShiftPageDownAtEnd)) event.preventDefault();
      return;
    }
    if (
      act.kind === 'startEditing' &&
      act.text !== null &&
      act.text !== ' ' &&
      !event.repeat &&
      event.target === activeEditorRef.current &&
      event.nativeEvent.isTrusted &&
      !isReplayed
    )
      return;
    event.preventDefault();
    if (notice2 !== null && doesStepOutLeaveNotice(act, notice2, saveStatusCard2))
      return event.repeat
        ? undefined
        : store.dispatch({
            kind: 'noticeDismissed',
            notice: notice2,
          });
    let opensCell = act.kind === 'openCell' || (act.kind === 'startEditing' && act.text === null);
    let { isFormulaBarReadOnly: isFormulaBarReadOnly, isPressOrEnterAComment: isPressOrEnterAComment } = store.getView();
    if (opensCell && isFormulaBarReadOnly && !isPressOrEnterAComment) return event.repeat ? undefined : focusTypingTarget('formulaBar');
    let todayPatch =
      act.kind === 'enterToday' || act.kind === 'showSheetBeside'
        ? {
            today: todayDate(),
          }
        : null;
    let newSheetPatch =
      act.kind === 'addSheet'
        ? {
            newSheetNameStem: defaultSheetName(),
          }
        : null;
    let fixFields = fixFieldsOfKeyPress(
      keyEvent.key,
      {
        cameForKeys: fixKeysCameAt.current,
        hold: view2.holdsOnAgentsAnswers.fixes,
      },
      eventTimeMs(event),
      isReplayed,
    );
    store.dispatch({
      kind: 'keyPressed',
      ...keyEvent,
      ...todayPatch,
      ...newSheetPatch,
      ...fixFields,
    });
    if (act.kind === 'goOnOutOfGrid' && !event.repeat) whenFocusStays(() => void moveCaretTo('cells', act.by));
    if (act.kind === 'writeInEntry' && !event.repeat) entryBoxes(act);
    if (act.kind === 'askForLinkForm' && !event.repeat) askLinkForm();
    return;
  };
  let clicksSinceCaretMovedRef = React.useRef(2);
  let lastProgrammaticActMsRef = React.useRef(Number.NEGATIVE_INFINITY);
  let isContextBarMenuByKeyRef = React.useRef(false);
  let isChartMenuRef = React.useRef(false);
  let lastKeyDownRef = React.useRef(null);
  let didFocusLeaveByTab2 = (input?: Dynamic) => didFocusLeaveByTab(input, lastKeyDownRef.current, isPointerPressedLastRef.current);
  let wasFocusLostToNothingRef = React.useRef(false);
  let pressPointRef = React.useRef(null);
  let edgeStretch = useOverscrollBounce(zoomedGridRef, gridZoom.now, IS_APPLE_PLATFORM);
  let speedAtLetGoRef = React.useRef({
    x: 0,
    y: 0,
  });
  let edgeStretchPressProps = {
    onPointerDownCapture: () => void edgeStretch.letGo(),
    onPointerUpCapture: ({ pointerType: pointerType }: Dynamic) => {
      if (pointerType === 'touch') speedAtLetGoRef.current = edgeStretch.letGo();
    },
    onPointerCancelCapture: () => void edgeStretch.letGo(),
    onLostPointerCaptureCapture: () => void edgeStretch.letGo(),
  };
  let scrollPastEdges = React.useCallback((delta?: Dynamic) => overscrollOf(store.getView().grid.scroll, delta), [store]);
  let bumpAtStandstill = React.useCallback(
    (speed?: Dynamic) => {
      let pastEdges = scrollPastEdges(speed);
      edgeStretch.bumpedAt({
        x: pastEdges.x === 0 ? 0 : speed.x,
        y: pastEdges.y === 0 ? 0 : speed.y,
      });
    },
    [edgeStretch, scrollPastEdges],
  );
  let fingerFling = useFingerFling({
    store: store,
    grid: cellsRef,
    gridZoom: gridZoom,
    isOnApple: IS_APPLE_PLATFORM,
    atStandstill: bumpAtStandstill,
  });
  let stopOnFingerDown = React.useCallback(() => fingerFling.stop() || edgeStretch.isOnWayBack(), [fingerFling, edgeStretch]);
  let captureSwipe = React.useCallback((pointerId?: Dynamic) => {
    try {
      cellsRef.current?.setPointerCapture(pointerId);
    } catch {}
  }, []);
  let pullByFinger = (delta?: Dynamic) => {
    let zoomNow = gridZoom.now();
    let eased = edgeStretch.easedBy({
      x: delta.x * zoomNow,
      y: delta.y * zoomNow,
    });
    let wheelDelta = {
      x: eased.x / zoomNow,
      y: eased.y / zoomNow,
    };
    let pastEdges = scrollPastEdges(wheelDelta);
    edgeStretch.pulledBy(
      {
        x: pastEdges.x * zoomNow,
        y: pastEdges.y * zoomNow,
      },
      delta,
    );
    store.dispatch({
      kind: 'wheelTurned',
      deltaX: wheelDelta.x,
      deltaY: wheelDelta.y,
      isByFinger: true,
    });
  };
  let pinchZoom = usePinchZoom({
    store: store,
    grid: cellsRef,
    gridZoom: gridZoom,
  });
  let isClickToSwallowRef = React.useRef(false);
  let lastPointerRef = React.useRef({
    at: {
      x: 0,
      y: 0,
    },
    atMs: 0,
  });
  let pressPointerIdRef = React.useRef(null);
  let [fingerPresses] = React.useState(createFingerPressTracker);
  let [chartTaps] = React.useState(createChartTapTracker);
  let [fingerTapCaret] = React.useState(createFingerTapCaret);
  let dragStartMsRef = React.useRef(null);
  let hasPointerMovedRef = React.useRef(false);
  let askLinkCardAtPointer = React.useCallback(
    (cell?: Dynamic, event?: Dynamic) => {
      let cells = cellsRef.current;
      if (cells === null) return;
      let zoomNow = gridZoom.now();
      let link = cellTextUnderPointer(cell, cells, zoomNow, store.getView().grid.scroll, event);
      if (link !== null)
        store.dispatch({
          kind: 'linkCardAsked',
          at: pointInZoomedElement(cells, zoomNow, event),
          link: link,
        });
    },
    [store, gridZoom],
  );
  let linkPress = useLinkPressHandler(openLink, linkCardSeen, askLinkCardAtPointer);
  let lineBoxPresses = React.useMemo(
    () =>
      createLineBoxPresses(
        (paragraph?: Dynamic) =>
          store.dispatch({
            kind: 'boxOfLinePressedInCell',
            paragraph: paragraph,
          }),
      ),
    [store],
  );
  let opensNoLink = React.useCallback(() => {
    let { mode: mode2, isCommentModeOn: isCommentModeOn } = store.getView();
    return mode2.kind === 'editing' || isCommentModeOn;
  }, [store]);
  useLinkPressCursor({
    gridRef: cellsRef,
    card: linkCardSeen,
    opensNone: opensNoLink,
  });
  let [isPointerHeldInCells, setIsPointerHeldInCells] = React.useState(false);
  let heldPointerIdRef = React.useRef(null);
  let isPointerKeptRef = React.useRef(true);
  let isPressForMenuRef = React.useRef(false);
  let wasLastPressByMouseRef = React.useRef(false);
  let wasPressOnOfferRef = React.useRef(false);
  let isMouseDownHandledRef = React.useRef(false);
  let isRestOfPressSwallowedRef = React.useRef(false);
  let tapsRef = React.useRef(NO_TAPS);
  let actsCountRef = React.useRef(0);
  let actsAtLastPressRef = React.useRef({
    act: 0,
    timesFocusLeft: 0,
  });
  let updateTaps = (update?: Dynamic) => {
    let apply = () => {
      tapsRef.current = update(tapsRef.current);
    };
    if (store.mayAnEntryOpenOrEnd()) store.onceEventsAreFinished(apply);
    else apply();
  };
  let isGridHeld = () => {
    let {
      edgeHeldOf: edgeHeldOf,
      isFillHandleHeld: isFillHandleHeld,
      isFingerSelecting: isFingerSelecting,
      areCellsHeld: areCellsHeld,
      freezeBarHeld: freezeBarHeld,
      placedViewHeldBy: placedViewHeldBy,
    } = store.getView().grid;
    return edgeHeldOf !== null || isFillHandleHeld || isFingerSelecting || areCellsHeld || freezeBarHeld !== null || placedViewHeldBy !== null;
  };
  let isOtherPointerWhileHeld = ({ pointerId: pointerId }: Dynamic) => isGridHeld() && pointerId !== heldPointerIdRef.current;
  let firstFingerIdRef = React.useRef(null);
  let secondFingerIdRef = React.useRef(null);
  let isSecondFinger = ({ pointerType: pointerType, pointerId: pointerId }: Dynamic) =>
    pointerType === 'touch' && firstFingerIdRef.current !== null && pointerId !== firstFingerIdRef.current;
  let beginPinch = (element?: Dynamic, event?: Dynamic, cell?: Dynamic) => {
    if (event.pointerId === secondFingerIdRef.current) secondFingerIdRef.current = null;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      return pinchZoom.forget();
    }
    firstFingerIdRef.current = event.pointerId;
    pinchZoom.firstCameDown(event);
    pressPointRef.current = pointInZoomedElement(element, gridZoom.now(), event);
    hasPointerMovedRef.current = true;
    fingerFling.stop();
    fingerFling.fingerMovedTo(event, cell);
  };
  let tapHoldTimerRef = React.useRef(undefined);
  let pressTargetRef = React.useRef(null);
  let returnFocusAfterPressMenu = () =>
    store.onceEventsAreFinished(() => {
      if (store.getView().menu === null) return;
      tapsRef.current = NO_TAPS;
      if (pressTargetRef.current !== null) armCellMenuTouchGuard(pressTargetRef.current);
      pressPointRef.current = null;
    });
  let [isFilterCleared, setIsFilterCleared] = React.useState(false);
  let dispatchToOwnFilterList = React.useCallback(
    (event?: Dynamic) => {
      let hadOwnFilterBar = store.getView().ownFilterBar !== null;
      store.dispatch(event);
      store.lookOnceEventsAreFinished(() => setIsFilterCleared(hadOwnFilterBar && store.getView().ownFilterBar === null));
    },
    [store],
  );
  let lastPressMsRef = React.useRef(0);
  let beforeAnswerSeenPatch = () => {
    let pressMs = eventTimeMs({
      timeStamp: lastPressMsRef.current,
    });
    return isBeforeAnswerSeen(store.getView().holdsOnAgentsAnswers.rowsAskedFor, pressMs)
      ? {
          hasBegunBeforeAnswerWasSeen: true,
        }
      : {};
  };
  let dispatchPointerEvent = (event?: Dynamic) =>
    store.getView().ownFilterList === null ? store.dispatch(event) : dispatchToOwnFilterList(event);
  let startTapHoldMenu = (at?: Dynamic, isOnBoxOfEntry?: Dynamic, win?: Dynamic) => {
    if (win?.CSS.supports('-webkit-touch-callout', 'none') !== true) return;
    tapHoldTimerRef.current = setTimeout(() => {
      if (!isTapOnGrid(at, store.getView().grid)) return;
      dispatchPointerEvent({
        kind: 'menuAsked',
        at: at,
        ...(isOnBoxOfEntry && {
          isOnBoxOfEntry: isOnBoxOfEntry,
        }),
        ...beforeAnswerSeenPatch(),
      });
      whenFocusStays(refocusTypingTarget, 'dispatchesNothing');
      returnFocusAfterPressMenu();
    }, TAP_HOLD_LIMIT_MS);
  };
  React.useEffect(() => () => clearTimeout(tapHoldTimerRef.current), [tapHoldTimerRef]);
  let isFillHandleJustTouched = () => {
    let dragStartMs = dragStartMsRef.current;
    return (
      store.getView().grid.isFillHandleOnlyTouched && dragStartMs !== null && dragStartMs - lastPointerRef.current.atMs < FILL_HANDLE_TOUCH_WINDOW_MS
    );
  };
  let isCellEditorTarget = (target?: Dynamic) => entryEditorOf(target) === activeEditorRef.current;
  let isPressInEntryBox = ({ target: target }: Dynamic) =>
    isCellEditorTarget(target) && store.getView().mode.kind === 'editing' && store.mayAnEntryOpenOrEnd();
  let isRefocusingAfterPressRef = React.useRef(false);
  let refocusAfterPress = (when?: Dynamic, placementId?: Dynamic) => {
    if (store.isEventUnfinished() && !isFocusInCells()) {
      if (when === 'atLift')
        ReactDOM.flushSync(() => {
          return;
        });
      getCaretElement(placementId)?.focus({
        preventScroll: true,
      });
    }
    whenFocusStays(() => {
      isRefocusingAfterPressRef.current = true;
      try {
        if (when === 'atLift' || cellsRef.current?.contains(getActiveElement()) !== true)
          ReactDOM.flushSync(() => {
            return;
          });
        refocusTypingTarget();
      } finally {
        isRefocusingAfterPressRef.current = false;
      }
    }, 'dispatchesNothing');
  };
  let pointInPlacedView = (
    { currentTarget: currentTarget, clientX: clientX, clientY: clientY }: Dynamic,
    placementId?: Dynamic,
  ) => {
    let placedRect = getPlacedViewRect(currentTarget.ownerDocument, placementId);
    return placedRect === null
      ? null
      : {
          x: (clientX - placedRect.left) / zoom,
          y: (clientY - placedRect.top) / zoom,
        };
  };
  let onGridPointerDown = (event?: Dynamic) => {
    lastPressMsRef.current = event.timeStamp;
    if (event.pointerType === 'touch' && event.isPrimary) {
      firstFingerIdRef.current = null;
      secondFingerIdRef.current = null;
      pinchZoom.forget();
      if (isPressForMenuRef.current && isGridHeld())
        store.dispatch({
          kind: 'pointerCanceled',
        });
    }
    let onlyFinger = firstFingerIdRef.current === null ? pinchZoom.onlyFingerDown() : null;
    if (event.pointerType === 'touch' && onlyFinger !== null) beginPinch(event.currentTarget, onlyFinger, event.timeStamp);
    clearTimeout(tapHoldTimerRef.current);
    tapHoldEndRef.current = null;
    let hasFlingStopped = !isSecondFinger(event) && fingerFling.stop();
    let isStretchOnWayBack = edgeStretch.isOnWayBack();
    let isFlingStopped = (hasFlingStopped || isStretchOnWayBack) && event.pointerType === 'touch';
    isClickToSwallowRef.current = isFlingStopped || isStretchOnWayBack;
    if (isStretchOnWayBack && !isFlingStopped) return;
    wasColumnCountCardOpenRef.current = isColumnCountCardOpen;
    isShiftHeldRef.current = event.shiftKey;
    isSpaceHeldRef.current = false;
    if (event.pointerType === 'mouse') linkCardHover.isPressed();
    let isOnCommentCorner = commentCornerKeyAtTarget(event) !== null;
    let isPlainMousePress =
      event.pointerType === 'mouse' && event.button === 0 && !(event.ctrlKey || event.shiftKey || event.metaKey || event.altKey);
    let isOnControl =
      tableKeyOfHandleAt(event.target) !== undefined ||
      isInPlacedViewControls(event.target) ||
      isAtEndOfSheetInput(event.target) ||
      isOnWordsOfferedButton(event.target) ||
      isInExpandedEntry(event.target) ||
      isInAtEndOfSheet(event.target) ||
      isInOffersAtSelection(event.target) ||
      isOnSkipTarget(event);
    putAwayCommentsRef.current = null;
    if (isPlainMousePress && !isOnCommentCorner && !isOnControl)
      mouseAroundComments.isPressedOnCells({
        x: event.clientX,
        y: event.clientY,
      });
    else if (event.button !== 0 || event.ctrlKey || !isOnCommentCorner) putAwayCommentsRef.current = mouseAroundComments.putAway();
    setIsLinkCardPressedAway(event.pointerType === 'mouse');
    pressPointerIdRef.current = null;
    chartTaps.forget();
    fingerTapCaret.forget();
    setPlacedViewTap(null);
    let actsNow = {
      act: actsCountRef.current,
      timesFocusLeft: focusTrackerRef.current?.timesFocusLeft() ?? 0,
    };
    let { act: actBefore, timesFocusLeft: timesFocusLeftBefore } = actsAtLastPressRef.current;
    let hasPersonActedSinceLast = actsNow.act !== actBefore + 1 || actsNow.timesFocusLeft !== timesFocusLeftBefore;
    actsAtLastPressRef.current = actsNow;
    let tapsAtPress = tapsRef.current;
    let isSoonAfterTap = event.pointerType === 'touch' && isSoonAfterCellTap(tapsAtPress, event.timeStamp);
    let tapsBefore: Dynamic = NO_TAPS;
    updateTaps((taps?: Dynamic) => ((tapsBefore = taps), tapsAfterPress(taps, null)));
    let placedViewPress = placedViewPressRef.current;
    placedViewPressRef.current = null;
    let placementOfCardOrTools = isInPlacedViewCardOrTools(event.target) ? placementIdOfElement(event.target) : null;
    if (event.button === 0 && placementOfCardOrTools !== null && placementOfCardOrTools !== getSelectedPlacementId()) {
      let select = {
        kind: 'select',
        isByKey: false,
      };
      store.dispatch({
        kind: 'placedViewActedOn',
        placementId: placementOfCardOrTools,
        act: select,
      });
      refocusAfterPress('atPress', placementOfCardOrTools);
    }
    if (isInPlacedViewControls(event.target) || isAtEndOfSheetInput(event.target)) return;
    if (isOnWordsOfferedButton(event.target) || isInExpandedEntry(event.target)) return;
    let placementId = placementIdOfElement(event.target);
    let selectedPlacementId2 = getSelectedPlacementId();
    let isOnSelectedPlacement = placementId !== null && placementId === selectedPlacementId2;
    let isPlacementCaretElsewhere =
      !event.currentTarget.ownerDocument.hasFocus() || placementIdOfElement(getActiveElement()) !== selectedPlacementId2;
    if (selectedPlacementId2 !== null && !isOnSelectedPlacement && isPlacementCaretElsewhere)
      store.dispatch({
        kind: 'placedViewActedOn',
        placementId: selectedPlacementId2,
        act: {
          kind: 'leave',
          isForCells: false,
        },
      });
    let isInEntryBox = isPressInEntryBox(event);
    let isInCellEditor = isCellEditorTarget(event.target) && store.getView().mode.kind === 'editing' && !isInEntryBox;
    let isMiddleButton = event.button === 1;
    let isPrimaryButton = event.button === 0 && !isContextMenuClick(event);
    isMouseDownHandledRef.current = false;
    isRestOfPressSwallowedRef.current = isInCellEditor && isSoonAfterTap;
    if (isRestOfPressSwallowedRef.current) {
      let { pointerId: pointerId2, timeStamp: timeStamp2 } = event;
      let taps = tapsPressedOnLastTap(tapsAtPress, {
        pointerId: pointerId2,
        atMs: timeStamp2,
        at: pointInGrid(event),
      });
      return updateTaps(() => taps);
    }
    if (isInCellEditor)
      store.dispatch({
        kind: 'caretPlacedInEntry',
      });
    let isPrimaryFinger = event.pointerType === 'touch' && event.isPrimary && !isFlingStopped;
    if (isInCellEditor && isPrimaryFinger && activeEditorRef.current !== null)
      fingerTapCaret.fingerCameDownIn(activeEditorRef.current, event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    if (isInCellEditor && isPrimaryButton && event.pointerType !== 'touch' && activeEditorRef.current !== null)
      forgetCaretPlacement(activeEditorRef.current, store.getView().mode);
    if (!(isMiddleButton || isPrimaryButton) || isInCellEditor) return;
    if (!isInEntryBox && event.pointerType === 'touch') isMouseDownHandledRef.current = true;
    else if (!isInEntryBox) event.preventDefault();
    if (Math.abs(event.timeStamp - lastProgrammaticActMsRef.current) <= POINTER_DOWN_REPEAT_MS) return;
    let { isTapYetToBeTold: isTapYetToBeTold, isFingerSelecting: isFingerSelecting } = store.getView().grid;
    if (isSecondFinger(event) && (!isGridHeld() || isTapYetToBeTold)) {
      store.dispatch({
        kind: 'pointerCanceled',
      });
      if (isFingerSelecting) pressPointRef.current = dragHoldTracker.lastAt() ?? lastPointerRef.current.at;
    }
    if (isSecondFinger(event)) {
      secondFingerIdRef.current = event.pointerId;
      let value = pressPointRef.current !== null && !isGridHeld();
      if (pinchZoom.secondCameDown(event, value)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        hasPointerMovedRef.current = true;
        fingerFling.stop();
      }
    }
    if (isOtherPointerWhileHeld(event) || isSecondFinger(event)) return;
    if (isGridHeld())
      store.dispatch({
        kind: 'pointerCanceled',
      });
    let isEditing = store.getView().mode.kind === 'editing';
    let linkPressResult = isFlingStopped ? 'isForCells' : linkPress.pressed(event, isEditing);
    let { doesCommentModePickCells: doesCommentModePickCells, viewOnlyBecause: viewOnlyBecause } = store.getView();
    let isLineBoxPress = lineBoxPresses.pressed(event, isEditing || isFlingStopped || doesCommentModePickCells || viewOnlyBecause !== null);
    let showsLinkCard = linkPressResult === 'showsCardFirst' && store.getView().canLinkCardCome && !isAnyLayerHeldBack;
    let linkAmongText = event.target instanceof Element ? event.target.closest(`[${LINK_AMONG_TEXT_ATTR}]`) : null;
    if (showsLinkCard && linkAmongText !== null) askLinkCardAtPointer(linkAmongText, event);
    else if (showsLinkCard)
      store.dispatch({
        kind: 'linkCardAsked',
        at: pointInGrid(event),
      });
    let isLinkPress = linkPressResult === 'opensLink' || showsLinkCard;
    let isOnSheetEndOrOffers = isInAtEndOfSheet(event.target) || isInOffersAtSelection(event.target);
    if (isLinkPress || isOnSkipTarget(event) || isOnSheetEndOrOffers) clicksSinceCaretMovedRef.current = 0;
    if (isLinkPress) hasPointerMovedRef.current = false;
    if (
      (isOnSkipTarget(event) || isOnSheetEndOrOffers || isLinkPress || commentCornerKeyAtTarget(event) !== null) &&
      !isMiddleButton &&
      !isFlingStopped
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      firstFingerIdRef.current = event.pointerId;
      pinchZoom.firstCameDown(event);
      fingerFling.fingerMovedTo(event, event.timeStamp);
    }
    if (isMiddleButton || isFlingStopped) {
      pressPointRef.current = pointInGrid(event);
      hasPointerMovedRef.current = isFlingStopped;
      if (isStretchOnWayBack && isFlingStopped) edgeStretch.heldAgain();
      return setIsPointerHeldInCells(isMiddleButton);
    }
    clicksSinceCaretMovedRef.current = isLineBoxPress ? 0 : clicksSinceCaretMovedRef.current + 1;
    let isByFinger = event.pointerType === 'touch';
    isPressForMenuRef.current = isByFinger;
    wasLastPressByMouseRef.current = event.pointerType === 'mouse';
    let at = pointInGrid(event);
    let { pointerId: pointerId, timeStamp: timeStamp } = event;
    pressPointRef.current = isByFinger ? at : null;
    dragHoldTracker.forget();
    lastPointerRef.current = {
      at: at,
      atMs: timeStamp,
    };
    isPointerKeptRef.current = false;
    dragStartMsRef.current = null;
    hasPointerMovedRef.current = false;
    pressPointerIdRef.current = pointerId;
    pressTargetRef.current = isByFinger && event.target instanceof Element ? event.target : null;
    if (isByFinger && placementId === null) startTapHoldMenu(at, isInEntryBox, event.currentTarget.ownerDocument.defaultView);
    let isPhoneFingerOnPlacement = isByFinger && placedViewPress === null && isOnPhone();
    placedViewPressedRef.current = isByFinger && (!isOnSelectedPlacement || isPhoneFingerOnPlacement) ? placementId : null;
    placedViewPointerRef.current =
      isByFinger && placementId !== null
        ? {
            pointerId: pointerId,
            placementId: placementId,
          }
        : null;
    let pointInPlacement = placementId === null ? null : pointInPlacedView(event, placementId);
    chartTaps.cameDown(
      event,
      placementId !== null && pointInPlacement !== null && placedViewPress === null && !isEditing
        ? {
            placementId: placementId,
            at: pointInPlacement,
          }
        : null,
      store.getView().grid.placedViews,
    );
    let gripOfColumn = cellOfGripPressed(event.target, store.getView().grid);
    if (event.pointerType === 'mouse') errorCardHover.mouseIsPressed();
    let tableHandleKey = tableKeyOfHandleAt(event.target);
    wasPressOnOfferRef.current = tableHandleKey !== undefined;
    if (event.pointerType === 'mouse') tableHandleCall.pointerMovedTo(event);
    if (placementId === null)
      dispatchPointerEvent({
        kind: 'pointerPressed',
        ...at,
        isShiftHeld: event.shiftKey,
        isModifierHeld: event.metaKey || event.ctrlKey,
        isByFinger: isByFinger,
        ...(event.pointerType === 'mouse' && {
          isByMouse: true,
        }),
        ...(isInEntryBox && {
          isOnBoxOfEntry: isInEntryBox,
        }),
        ...(tableHandleKey !== undefined && {
          onHandleOfTable: tableHandleKey,
        }),
        ...(gripOfColumn !== undefined && {
          onGripOfColumn: gripOfColumn,
        }),
        ...beforeAnswerSeenPatch(),
        ...caretInEntryPatch(store.getView().mode, entryFieldRefs),
      });
    let takeHoldOfPlacement = (placementId2?: Dynamic) => {
      loseFocus(false);
      store.dispatch({
        kind: 'placedViewActedOn',
        placementId: placementId2,
        act: {
          kind: 'takeHold',
          at: at,
          sides: placedViewPress,
          isByFinger: isByFinger,
        },
      });
    };
    if (placementId !== null && placedViewPressedRef.current === null) takeHoldOfPlacement(placementId);
    if (!isByFinger || placementId === null) placedViewLiftRef.current = null;
    if (placementId !== null && isPhoneFingerOnPlacement && !isViewOnly) {
      let ownerDocument = event.currentTarget.ownerDocument;
      let { clientX: clientX, clientY: clientY } = event;
      let holdPlacement = () => {
        tapHoldEndRef.current = null;
        if (
          !(
            placedViewPressedRef.current === placementId &&
            dragStartMsRef.current === null &&
            pinchZoom.onlyFingerDown()?.pointerId === pointerId &&
            placementIdOfElement(ownerDocument.elementFromPoint(clientX, clientY)) === placementId
          )
        )
          return;
        chartTaps.forget();
        takeHoldOfPlacement(placementId);
        store.onceEventsAreFinished(() => {
          let isSamePress = lastPointerRef.current.atMs === timeStamp && placedViewPointerRef.current?.pointerId === pointerId;
          let isHeld = store
            .getView()
            .grid.placedViews.some((input?: Dynamic) => input.placementId === placementId && input.isHeld);
          if (!isSamePress && isHeld)
            store.dispatch({
              kind: 'pointerCanceled',
            });
          if (!isSamePress || !isHeld) return;
          placedViewPressedRef.current = null;
          pressPointRef.current = null;
          heldPointerIdRef.current = pointerId;
          findPlacedViewCaret(ownerDocument, placementId)?.focus({
            preventScroll: true,
          });
        });
      };
      tapHoldEndRef.current = holdPlacement;
      if (ownerDocument.defaultView?.CSS.supports('-webkit-touch-callout', 'none') === true)
        tapHoldTimerRef.current = setTimeout(() => {
          if (tapHoldEndRef.current === holdPlacement) holdPlacement();
        }, TAP_HOLD_LIMIT_MS);
    }
    if (isInEntryBox)
      store.onceEventsAreFinished(() => {
        if (store.getView().mode.kind === 'editing') moveEntryToUnlessThere('cell');
      });
    store.onceEventsAreFinished(() => {
      let isFingerDragSelecting =
        lastPointerRef.current.atMs === timeStamp && hasPointerMovedRef.current && store.getView().grid.isFingerSelecting;
      if (isFillHandleJustTouched() || isFingerDragSelecting)
        store.dispatch({
          kind: 'pointerCanceled',
        });
      let isHeld = isGridHeld();
      if (isHeld) heldPointerIdRef.current = pointerId;
      if (isHeld) pressPointRef.current = null;
      let tap = tapOnGrid(at, store.getView().grid);
      if (isByFinger && tap !== null && placementId === null)
        tapsRef.current = tapsAfterPress(tapsBefore, {
          pointerId: pointerId,
          atMs: timeStamp,
          at: at,
          on: tap.on,
          hasPersonActedSinceLast: hasPersonActedSinceLast,
        });
    });
    let isOnChart = placementId !== null;
    if (
      !fingerPresses.notePress({
        pointerId: pointerId,
        isByFinger: isByFinger,
        isOnChart: isOnChart,
        hadCaret: getActiveElement(),
      })
    )
      return;
    refocusAfterPress('atPress', placedViewPressedRef.current === null ? placementId : null);
  };
  let onGridMouseDown = (event?: Dynamic) => {
    let isHandled = isMouseDownHandledRef.current;
    isMouseDownHandledRef.current = false;
    if (isPickerField(event.target)) return;
    let isEditing = store.getView().mode.kind === 'editing';
    let gridOrEditor = getGridOrEditorElement();
    let keepsFocus = isEditing
      ? !isCellEditorTarget(event.target)
      : gridOrEditor !== null && gridOrEditor === gridOrEditor.ownerDocument.activeElement;
    let isOnPlacement = placementIdOfElement(event.target) !== null;
    let isOnSheetEndOrOffers = isInAtEndOfSheet(event.target) || isInOffersAtSelection(event.target) || isInExpandedEntry(event.target);
    if (isHandled || keepsFocus || isOnPlacement || isOnSheetEndOrOffers) event.preventDefault();
  };
  let addLinesAtEnd2 = (what?: Dynamic, count?: Dynamic) => {
    let { rowCount: rowCount, columnCount: columnCount } = store.getView().grid;
    let countSeen = what === 'rows' ? rowCount : columnCount;
    if (isAtEndOfSheetInput(getActiveElement())) {
      if (what === 'rows') noteCaretAtEnd();
      setCaretAtEnd(null);
      focusTypingTarget('grid');
      forgetComeToByTab();
    }
    store.dispatch({
      kind: 'linesAtEndAsked',
      what: what,
      count: count,
      countSeen: countSeen,
    });
  };
  let caretAtEndRef = React.useRef(null);
  let setCaretAtEnd = (at?: Dynamic, nextFocus: Dynamic = null) => {
    if (at === caretAtEndRef.current || (at === null && isColumnCountCardOpen)) return;
    let isLeaving = at === null && caretAtEndRef.current !== null;
    caretAtEndRef.current = at;
    store.dispatch({
      kind: 'caretAtEndChanged',
      at: at,
    });
    if (
      isLeaving &&
      nextFocus !== null &&
      !isPointerPressedLastRef.current &&
      (nextFocus === cellEditorRef.current || nextFocus === gridFocusRef.current)
    )
      store.dispatch({
        kind: 'endOfSheetLeftByKey',
      });
    if (at !== null) loseFocus(false);
  };
  let syncCaretAtEndWithCard = React.useEffectEvent((isCardOpen?: Dynamic) => {
    if (isCardOpen) setCaretAtEnd('columns');
    else if (!isInAtEndOfSheet(getActiveElement())) setCaretAtEnd(null);
  });
  React.useEffect(() => syncCaretAtEndWithCard(isColumnCountCardOpen), [isColumnCountCardOpen]);
  let askColumnCountCard = (isByKey?: Dynamic) => setIsColumnCountCardOpen(isByKey || !wasColumnCountCardOpenRef.current);
  let getAddColumnsButton = () => cellsRef.current?.querySelector(`#${ADD_MORE_COLUMNS_BUTTON_ID}`) ?? null;
  let askFigures = () => {
    let { body: body, selectionSummary: selectionSummary } = store.getView().grid;
    if (selectionSummary === null) return;
    let { center: center, top: top, height: height } = selectionSummary;
    store.dispatch({
      kind: 'figuresAsked',
      at: {
        x: body.left + center,
        y: body.top + top,
      },
      height: height,
    });
  };
  let onGridContextMenu = (event?: Dynamic) => {
    let isOnBoxOfEntry = isPressInEntryBox(event);
    let isEditing = store.getView().mode.kind === 'editing';
    if (isCellEditorTarget(event.target) && isEditing && !isOnBoxOfEntry) return;
    if (isPickerField(event.target)) return;
    event.preventDefault();
    clearTimeout(tapHoldTimerRef.current);
    let placementId = placementIdOfElement(event.target);
    if (placementId !== null && isTouchOrPenPointer(event)) return tapHoldEndRef.current?.();
    if (placementId !== null && isInPlacedViewAskBox(event.target)) return;
    if (placementId !== null) return askForPlacedViewMenu(placementId, opensMenuAtPointer(event) ? pointInGrid(event) : null);
    let summary = store.getView().grid.selectionSummary?.summary ?? null;
    if (isOnSkipTarget(event) && isSumWithFormulaCell(summary)) return askFigures();
    if (isInAtEndOfSheet(event.target) || isInOffersAtSelection(event.target)) return;
    if (isOnWordsOfferedButton(event.target) || isInExpandedEntry(event.target)) return;
    if (tableKeyOfHandleAt(event.target) !== undefined && !isAtTableHandleOverRowNumber(event.target)) return;
    let { grid: grid2 } = store.getView();
    let isFillHandleTap = grid2.isFillHandleOnlyTouched && tapOnGrid(lastPointerRef.current.at, grid2) !== null;
    if (isGridHeld() && !isFillHandleTap && !grid2.isTapYetToBeTold && !isContextMenuClick(event)) return;
    let isByMouse = isContextMenuClick(event) && !isTouchOrPenPointer(event);
    if (isByMouse) errorCardHover.mouseIsPressed();
    dispatchPointerEvent({
      kind: 'menuAsked',
      at: opensMenuAtPointer(event) ? pointInGrid(event) : null,
      ...(isByMouse && {
        isByMouse: isByMouse,
      }),
      ...(isOnBoxOfEntry && {
        isOnBoxOfEntry: isOnBoxOfEntry,
      }),
      ...beforeAnswerSeenPatch(),
    });
    whenFocusStays(refocusTypingTarget, 'dispatchesNothing');
    if (isPressForMenuRef.current && pressPointerIdRef.current !== null) returnFocusAfterPressMenu();
  };
  let onGridPointerMove = (event?: Dynamic) => {
    nameFlagsAtPointer.pointerMovedTo(event.pointerType === 'touch' ? null : event);
    filterButtonPointedAt.pointerMovedTo(event.pointerType === 'touch' ? null : event);
    tableHandleCall.pointerMovedTo(event.pointerType === 'touch' ? null : event);
    columnHeadingsCall.pointerMovedTo(event.pointerType === 'touch' ? null : event);
    let pinch = event.pointerType === 'touch' ? pinchZoom.fingerMovedTo(event, event.timeStamp) : 'isOfNoPinch';
    if (pinch === 'isOfPinch') return;
    if (
      (event.pointerType === 'touch' &&
        firstFingerIdRef.current === null &&
        (event.pointerId === secondFingerIdRef.current ||
          event.pointerId === pinchZoom.onlyFingerDown()?.pointerId ||
          event.currentTarget.hasPointerCapture(event.pointerId))) ||
      pinch === 'isFirstAfterPinch'
    )
      return beginPinch(event.currentTarget, event, event.timeStamp);
    if (isSecondFinger(event)) return;
    let commentLayer: Dynamic = null;
    if (event.pointerType === 'mouse') {
      commentLayersRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      commentLayer = markCommentLayersUnderMouse(
        {
          grid: view.grid,
          gridElement: event.currentTarget,
          zoom: zoom,
        },
        commentLayersRef.current,
      );
    }
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      if (event.pointerType !== 'mouse') return;
      if (view.fixesOnCells?.stage === 'waiting') {
        let fixCell = fixWaitingUnderPointer(event);
        let fixAt = fixCell === null ? null : pointInZoomedElement(event.currentTarget, zoom, pointClampedToRight(fixCell, event));
        fixPointer.isOver(fixCell, fixAt);
      }
      let value = errorCellUnderMouse(event);
      let isErrorCardTold = errorCardHover.tell(
        value === null
          ? null
          : {
              cell: value,
              at: pointInGrid(event),
            },
        {
          x: event.clientX,
          y: event.clientY,
        },
      );
      let value2 = isErrorCardTold ? null : linkUnderMouse(event);
      linkCardHover.isOver(value2 === null ? null : cellPointOf(value2, event));
      let isOverCardTarget = value !== null || isErrorCardTold || value2 !== null;
      let isOverPlacedView = event.target instanceof Element && event.target.closest('.sheet-placed-view') !== null;
      mouseAroundComments.isOver(isOverCardTarget || isOverPlacedView || isAnyLayerHeldBack ? null : commentLayer, {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }
    if (event.pointerType === 'mouse')
      mouseAroundComments.isDraggedTo({
        x: event.clientX,
        y: event.clientY,
      });
    if (isOtherPointerWhileHeld(event)) return;
    if ((event.buttons & -2) !== 0) chartTaps.forget();
    let at = pointInGrid(event);
    let lastPointer = lastPointerRef.current;
    if (dragStartMsRef.current === null) {
      let nativeEvent = event.nativeEvent;
      let match = ('getCoalescedEvents' in nativeEvent ? [...nativeEvent.getCoalescedEvents(), nativeEvent] : [nativeEvent]).find(
        ({ clientX: clientX, clientY: clientY }: Dynamic) =>
          Math.hypot(
            at.x + unzoomLength(clientX - event.clientX, zoom) - lastPointer.at.x,
            at.y + unzoomLength(clientY - event.clientY, zoom) - lastPointer.at.y,
          ) >= dragStartDistance,
      );
      dragStartMsRef.current = match?.timeStamp ?? null;
    }
    if (isFillHandleJustTouched()) {
      store.dispatch({
        kind: 'pointerCanceled',
      });
      pressPointRef.current = lastPointer.at;
    }
    let pressPoint = pressPointRef.current;
    let buttonsNeeded = pressPoint === null ? 1 : 4;
    let isWrongButton = event.buttons !== 0 && (event.buttons & buttonsNeeded) === 0;
    let isLostRelease = event.buttons === 0 && isGridHeld();
    let isByFingerOrPen = event.pointerType === 'touch' || event.pointerType === 'pen';
    if ((isWrongButton || isLostRelease) && !isByFingerOrPen) return event.currentTarget.releasePointerCapture(event.pointerId);
    if (pressPoint === null)
      return dragHoldTracker.movedTo(at, {
        pressedAt: lastPointer.at,
        isButtonDown: event.buttons !== 0,
        isByFinger: event.pointerType === 'touch',
      });
    if (event.pointerType === 'touch') fingerFling.fingerMovedTo(event, event.timeStamp);
    if (event.pointerType === 'touch' && !hasPointerMovedRef.current && Math.hypot(pressPoint.x - at.x, pressPoint.y - at.y) < dragStartDistance)
      return;
    hasPointerMovedRef.current = true;
    pressPointRef.current = at;
    if (event.pointerType === 'touch')
      return pullByFinger({
        x: pressPoint.x - at.x,
        y: pressPoint.y - at.y,
      });
    return store.dispatch({
      kind: 'wheelTurned',
      deltaX: pressPoint.x - at.x,
      deltaY: pressPoint.y - at.y,
      ...(isByFingerOrPen
        ? {
            isByFinger: true,
          }
        : {}),
    });
  };
  let onGridPointerCancel = (event?: Dynamic) => {
    if (event.pointerType === 'mouse') mouseAroundComments.isPressLost();
    pinchZoom.fingerLifted(event.pointerId, event.timeStamp);
    if (event.pointerId === secondFingerIdRef.current) secondFingerIdRef.current = null;
    if (isSecondFinger(event)) return;
    clearTimeout(tapHoldTimerRef.current);
    tapHoldEndRef.current = null;
    fingerFling.stop();
    updateTaps(() => NO_TAPS);
    placedViewPressedRef.current = null;
    placedViewPointerRef.current = null;
    chartTaps.forget();
    if (!isOtherPointerWhileHeld(event))
      store.dispatch({
        kind: 'pointerCanceled',
      });
  };
  let fitPlacedViewInSight = (placementId?: Dynamic, isForced?: Dynamic) => {
    let {
      placedViews: placedViews,
      clearBodyHeight: clearBodyHeight2,
      endOfFrozenRows: endOfFrozenRows,
      endOfFrozenColumns: endOfFrozenColumns,
    } = store.getView().grid;
    let placed = placedViews.find((input?: Dynamic) => input.placementId === placementId);
    if (placed === undefined || cellsRef.current === null) return;
    let zoomNow = gridZoom.now();
    let fitZoom = zoomToFit(
      {
        width: (endOfFrozenColumns?.at ?? 0) + placed.box.width,
        height: (endOfFrozenRows?.at ?? 0) + placed.box.height,
      },
      {
        width: cellsRef.current.clientWidth,
        height: (COLUMN_HEADER_HEIGHT + clearBodyHeight2) * zoomNow,
      },
    );
    let fitting = zoomForFitting(placementId, fitZoom, zoomNow, fitZoomRef.current);
    if (isForced || fitting.fit !== null) {
      gridZoom.set(fitting.zoom);
      fitZoomRef.current = fitting.fit === null ? null : withFitZoom(fitting.fit, gridZoom.now());
    }
    store.dispatch({
      kind: 'placedViewActedOn',
      placementId: placementId,
      act: {
        kind: 'select',
        isByKey: true,
      },
    });
  };
  let onPressedTwice = (at?: Dynamic, isByFinger?: Dynamic, isUnhurried: Dynamic = false) => {
    if (clicksSinceCaretMovedRef.current < 2) return;
    let noticeBefore = store.getView().notice;
    store.dispatch({
      kind: 'pointerPressedTwice',
      ...(isUnhurried && {
        isUnhurried: isUnhurried,
      }),
      ...at,
      isByFinger: isByFinger,
      ...beforeAnswerSeenPatch(),
    });
    if (!isByFinger || !isNarrowPhone) return;
    store.onceEventsAreFinished(() => {
      let { notice: notice2, linkExplained: linkExplained, grid: grid2 } = store.getView();
      let isEditRefused = notice2 !== noticeBefore && notice2?.kind === 'editRefused';
      let isOnActiveCell = gridSpotAt(at, grid2) === grid2.activeCellElementId;
      if (isEditRefused && isOnActiveCell && linkExplained === null && formulaBarLines.opensAsCard)
        setTimeout(
          () =>
            formulaBarRef.current?.focus({
              preventScroll: true,
            }),
        );
    });
  };
  let onGridPointerUp = (event?: Dynamic) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId) || isSecondFinger(event)) return;
    if (event.pointerType === 'mouse') mouseAroundComments.isPressLost();
    if (event.pointerId === firstFingerIdRef.current) firstFingerIdRef.current = null;
    clearTimeout(tapHoldTimerRef.current);
    tapHoldEndRef.current = null;
    pressPointerIdRef.current = null;
    chartTaps.forget();
    setIsPointerHeldInCells(false);
    if (!isOtherPointerWhileHeld(event)) {
      dragHoldTracker.forget();
      dispatchPointerEvent({
        kind: 'pointerReleased',
        ...(!isPointerKeptRef.current && {
          isPointerLost: true,
        }),
      });
    }
    let { pointerId: pointerId } = event;
    if (fingerPresses.noteLift(pointerId, isFocusNowhere() ? null : getActiveElement())) refocusAfterPress('atLift', null);
    let point = {
      x: event.clientX,
      y: event.clientY,
    };
    let [pressAtMs, putAwayComment] = [lastPointerRef.current.atMs, putAwayCommentsRef.current];
    store.onceEventsAreFinished(() => {
      let down = tapsRef.current.down;
      let { taps: taps, pressedTwiceAt: pressedTwiceAt } = settleTaps(
        tapsRef.current,
        pointerId,
        (input?: Dynamic) => gridSpotAt(input, store.getView().grid),
      );
      tapsRef.current = taps;
      if (pressedTwiceAt !== null) onPressedTwice(pressedTwiceAt, true, down?.isUnhurried);
      let grid2 = store.getView().grid;
      if (!(down?.pointerId === pointerId && taps.last?.on === grid2.activeCellElementId) || lastPointerRef.current.atMs !== pressAtMs) return;
      let commentMark = commentMarksAtPoint(grid2, down.at).at(-1);
      if (commentMark === undefined || grid2.explainedCellBox !== null) return;
      if (commentMark === putAwayComment) mouseAroundComments.putAway();
      else mouseAroundComments.isTappedByFinger(commentMark, point);
    });
  };
  let { isDragToldOfWhileStill: isDragToldOfWhileStill } = view.grid;
  React.useEffect(() => {
    if (!isDragToldOfWhileStill) return;
    let interval = setInterval(() => {
      let heldPointerId = heldPointerIdRef.current;
      dragHoldTracker.timeCame(heldPointerId !== null && cellsRef.current?.hasPointerCapture(heldPointerId) === true);
    }, DRAG_HELD_STILL_TICK_MS);
    return () => clearInterval(interval);
  }, [isDragToldOfWhileStill, dragHoldTracker, heldPointerIdRef]);
  let moveEntryTo = (target?: Dynamic) => {
    let isEditing = store.getView().mode.kind === 'editing';
    let move = () => {
      let view2 = store.getView();
      let { formulaBarText: formulaBarText, mode: mode2 } = view2;
      let isReadOnly = view2.isFormulaBarReadOnly || view2.formulaOfFixOnEntryCell !== null;
      let mayMove = target === 'formulaBar' || mode2.kind === 'editing';
      if (isReadOnly || !mayMove || whereTypingGoes(view2) === target) return;
      if (target === 'formulaBar' && mode2.kind !== 'editing') ReactDOM.flushSync(() => dispatchEditText(target, formulaBarText));
      else dispatchEditText(target, formulaBarText);
    };
    if (isEditing) store.onceEventsAreFinished(move);
    else store.onceWhatIsShownOfSelectionIsKnown(move);
  };
  let moveEntryToUnlessThere = (target?: Dynamic) => {
    if (typingTarget === target || whereTypingGoes(store.getView()) === target) return;
    moveEntryTo(target);
  };
  let moveEntryToFormulaBar = () => {
    if (store.mayAnEntryOpenOrEnd()) moveEntryTo('formulaBar');
  };
  let isInBoxOfOneLine = view.mode.kind === 'editing' && view.mode.isInBoxOfOneLine === true && !view.isCaretWithCellsBeforeEntryEnds;
  React.useLayoutEffect(() => {
    let cellEditor2 = cellEditorRef.current;
    if (isInBoxOfOneLine || cellEditor2 === null || store.getView().mode.kind !== 'editing') return;
    if (cellEditor2 === cellEditor2.ownerDocument.activeElement && cellEditor2.ownerDocument.hasFocus()) refocusTypingTargetEvent();
  }, [store, isInBoxOfOneLine]);
  let { isEntryAmongPeople: isEntryAmongPeople2 } = view.grid;
  let entryCellOnPhone = isOnPhoneHere ? view.entryCellKey : null;
  let entryPlaceKey = `${isEntryAmongPeople2} ${entryCellOnPhone}`;
  let entryPlaceKeyRef = React.useRef(entryPlaceKey);
  React.useLayoutEffect(() => {
    let ownerDocument = cellsRef.current?.ownerDocument;
    let isSame = entryPlaceKeyRef.current === entryPlaceKey;
    entryPlaceKeyRef.current = entryPlaceKey;
    if (isSame || ownerDocument === undefined || whereTypingGoes(store.getView()) !== 'cell') return;
    if (ownerDocument.activeElement === ownerDocument.body && ownerDocument.hasFocus()) refocusTypingTargetEvent();
  }, [store, entryPlaceKey]);
  let [waitingBoxText, setWaitingBoxText] = React.useState('');
  let typeIntoWaitingBox = (text?: Dynamic) => {
    let pending = pendingTypingRef.current;
    if (pending !== null && store.isMoreHeldBehind(pending.typeOntoCell)) return;
    setWaitingBoxText(text);
    if (pending !== null)
      return void (pendingTypingRef.current = {
        ...pending,
        text: text,
      });
    let clear = () => {
      pendingTypingRef.current = null;
      setWaitingBoxText('');
    };
    let typeOntoCell = afterFocusLeaves(
      () => {
        if (pendingTypingRef.current === null) throw Error('the text kept in the waiting box was gone before its turn to be typed');
        let { text: text2 } = pendingTypingRef.current;
        clear();
        let { mode: mode2 } = store.getView();
        if (text2 === '') return;
        if (mode2.kind === 'navigating')
          dispatchEditText('cell', text2, {
            isInBoxOfOneLine: true,
          });
        if (mode2.kind === 'editing') completeEditText(mode2, (input?: Dynamic) => input + text2);
      },
      clear,
      () => true,
    );
    pendingTypingRef.current = {
      text: text,
      typeOntoCell: typeOntoCell,
    };
    store.onceEventsAreFinished(typeOntoCell, clear, 'asTypedAhead');
  };
  let onFieldInput = (typingIn: Dynamic, { target: target, nativeEvent: nativeEvent }: Dynamic) => {
    forgetComeToByTab();
    wasFormulaBarFocusedRef.current = false;
    let isTypedBeforeEntryEnds = target === cellEditorRef.current && store.getView().isCaretWithCellsBeforeEntryEnds;
    if (isTypedBeforeEntryEnds) store.endWaitForPeople('goOn');
    if (store.mayAnEntryOpenOrEnd()) return isTypedBeforeEntryEnds ? typeIntoWaitingBox(target.value) : undefined;
    let isComposing2 = isComposingRef.current || ('isComposing' in nativeEvent && nativeEvent.isComposing === true);
    let { mode: mode2 } = store.getView();
    let isEditing = mode2.kind === 'editing';
    let isInGridFocus = target === cellEditorRef.current && !isEditing;
    if (target === cellEditorRef.current && isEditing && mode2.isInBoxOfOneLine !== true) return;
    if (typingIn === 'cell' && target !== cellEditorRef.current && !isEditing) return;
    if (isInGridFocus && (target.value === ' ' || target.value === '　')) {
      if (isSpaceHeldRef.current) return;
      isSpaceHeldRef.current = true;
      if (isShiftHeldRef.current) {
        store.dispatch({
          kind: 'keyPressed',
          ...SHIFT_SPACE_KEY,
        });
        return;
      }
    }
    if (isEditing && isEntryEditor(target) && target.value === mode2.text)
      return store.dispatch({
        kind: 'entryLooksChanged',
        looks: target.looks,
      });
    let inputType = 'inputType' in nativeEvent && typeof nativeEvent.inputType === 'string' ? nativeEvent.inputType : undefined;
    let signsInLastInput = isEntryEditor(target) ? target.signsInLastInput : null;
    let areSignsRead = signsInLastInput === 'read';
    let stepInHistory = historyStepOfInputType(inputType);
    dispatchEditText(typingIn, target.value, {
      ...(target.selectionEnd !== null && {
        caretAt: target.selectionEnd,
      }),
      ...(isInGridFocus &&
        isComposing2 && {
          isInBoxOfOneLine: true,
        }),
      ...(isHistoryOrDropInputType(inputType) && {
        isOfHistory: true,
      }),
      ...((!isTypingInputType(inputType) || isPastingIntoEntryNow()) && {
        isNotTyped: true,
      }),
      ...(isEntryEditor(target) &&
        (isHistoryOrDropInputType(inputType) || areSignsRead) && {
          looks: target.looks,
        }),
      ...(stepInHistory !== undefined && {
        stepInHistory: stepInHistory,
      }),
      ...(areSignsRead &&
        target.selectionStart !== null && {
          caretAfterSignsRead: target.selectionStart,
        }),
      ...(signsInLastInput === 'putBack' && {
        areSignsPutBack: true,
      }),
    });
  };
  let onFieldKeyDown = (event?: Dynamic, isReplayed: Dynamic = false) => {
    let isComposing2 = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key === 'F6' && event.repeat && !event.altKey && !isComposing2) return event.preventDefault();
    if (!isReplayed) endWaitForPeopleOnKey(event, isComposing2);
    if (!isComposing2 && !isReplayed && typeAheadIntoEntry(event, onFieldKeyDown)) return;
    let isReplayedOutsideEdit = isReplayed && store.getView().mode.kind !== 'editing';
    let { mode: mode2, openUnderCell: openUnderCell } = store.getView();
    let tabStep = openUnderCell === null ? partStepOfTabInEntry(event, mode2, wasFormulaBarFocusedRef.current) : null;
    let focusMove = isComposing2 || isReplayedOutsideEdit ? null : (tabStep ?? focusMoveOfKey(normalizedKeyEvent(event)));
    if ((focusMove === 'nextPart' || (focusMove === 'partBefore' && !isViewOnly)) && !isKeyForLayer(event, null)) {
      event.preventDefault();
      lastTypingTargetRef.current = 'grid';
      store.dispatch({
        kind: 'entryLeft',
      });
      return whenFocusStays(() => {
        let view2 = store.getView();
        if (view2.mode.kind === 'editing') focusTypingTarget(whereTypingGoes(view2));
        else if (!moveCaretTo('formulaBar', focusMove === 'nextPart' ? 1 : -1)) focusTypingTarget('grid');
      });
    }
    if (isReplayedOutsideEdit || store.getView().mode.kind === 'editing') return onCellsKeyDown(event, isReplayed);
    if (event.key === 'Escape' && !isKeyForLayer(event, null)) focusTypingTarget('grid');
    return;
  };
  let chartOfMenu = view.menu?.ofChart ?? null;
  let chartMenuOf = React.useMemo(
    () =>
      chartOfMenu === null
        ? null
        : {
            ...chartOfMenu,
            mark: placementIdAttributes(chartOfMenu.placementId),
          },
    [chartOfMenu],
  );
  let chooseChartDelete = React.useCallback(
    (isByKey?: Dynamic) => {
      let placementId = store.getView().menu?.ofChart?.placementId;
      if (placementId === undefined) return;
      store.dispatch({
        kind: 'placedViewActedOn',
        placementId: placementId,
        act: {
          kind: 'delete',
          isByKey: isByKey,
        },
      });
      swallowRepeatedDeleteKeys(cellsRef.current?.ownerDocument.defaultView, (then?: Dynamic) => store.lookOnceEventsAreFinished(then));
    },
    [store],
  );
  let menuAt = view.menu?.at ?? null;
  let menuAnchor = useZoomedVirtualAnchor(
    cellsRef,
    zoom,
    React.useMemo(() => (menuAt === null ? null : new (DOMRect as Dynamic)(menuAt.x, menuAt.y)), [menuAt]),
  );
  let menuOpenedByRef = React.useRef(null);
  let withMenuOpenedBy = React.useCallback((isByKey?: Dynamic, action?: Dynamic) => {
    menuOpenedByRef.current = isByKey ? 'key' : 'pointer';
    try {
      action();
    } finally {
      menuOpenedByRef.current = null;
    }
  }, []);
  let contextBarMenuOpenedByRef = React.useRef(null);
  let getContextBarMenuOpenedBy = React.useCallback(() => contextBarMenuOpenedByRef.current, []);
  let getTypingTargetElement = React.useCallback(() => {
    switch (whereTypingGoes(store.getView())) {
      case 'grid':
        return getGridOrEditorElement();
      case 'cell':
        return activeEditorRef.current;
      case 'formulaBar':
        return formulaBarRef.current;
    }
  }, [store, getGridOrEditorElement]);
  let dispatchThenFocusTyping = React.useCallback(
    (kind?: Dynamic) =>
      store.onceEventsAreFinished(() => {
        if (isPageReallyLeft()) return;
        ReactDOM.flushSync(
          () =>
            store.dispatch({
              kind: kind,
            }),
        );
        getTypingTargetElement()?.focus({
          preventScroll: true,
        });
      }),
    [store, isPageReallyLeft, getTypingTargetElement],
  );
  let whatHasCaretAfter = React.useCallback(() => {
    if (cellsRef.current?.ownerDocument.hasFocus() !== true) return false;
    let view2 = store.getView();
    let isCalendarOpen = view2.calendar !== null && view2.mode.kind === 'navigating';
    let sidePane = sidePaneRef.current;
    let isInSidePane = sidePane?.contains(sidePane.ownerDocument.activeElement) === true;
    let isInFindFields = [findBarRef, replaceFieldRef].some(
      ({ current: current }: Dynamic) => current !== null && current === current.ownerDocument.activeElement,
    );
    let isAtEndOfSheet = isAtEndOfSheetInput(cellsRef.current.ownerDocument.activeElement);
    let active = cellsRef.current.ownerDocument.activeElement;
    let isOnPlacement = placementIdOfElement(active) !== null && (active?.closest('[role="menu"]') ?? null) === null;
    let isRenamingSheet = view2.listedSheets.some(({ renaming: renaming }: Dynamic) => renaming !== null);
    let isFocusTaken =
      hasElementAwaitingKeyboard(cellsRef.current.ownerDocument) ||
      isFilterBarAskOpen(view2) ||
      isInSidePane ||
      isInFindFields ||
      isRenamingSheet ||
      isCalendarOpen ||
      view2.linkForm !== null ||
      isAtEndOfSheet ||
      isOnPlacement;
    if (view2.menu !== null || isFocusTaken || isModalOpen(view2)) return false;
    let { contextBarMenu: contextBarMenu2 } = view2;
    if (
      (contextBarMenu2 !== null && isPaneMenuOfContextBar(contextBarMenu2) && isTouchBelowSm()) ||
      (contextBarMenu2 !== null && contextBarMenuOpenedByRef.current === 'key')
    )
      return false;
    return getTypingTargetElement() ?? false;
  }, [store, getTypingTargetElement]);
  let whatHasCaretAfterMenu = React.useCallback(() => {
    let target = whatHasCaretAfter();
    if (target !== false && target === cellEditorRef.current) markZoomSettling();
    return target;
  }, [whatHasCaretAfter, markZoomSettling]);
  let whatHasCaretAfterLayer = React.useCallback(() => {
    let lastFocused = lastKeyDownRef.current?.key === 'Escape' ? getLastFocusedByKey() : null;
    return lastFocused !== null && whatHasCaretAfter() !== false ? lastFocused : whatHasCaretAfterMenu();
  }, [getLastFocusedByKey, whatHasCaretAfter, whatHasCaretAfterMenu]);
  let whatHasCaretAfterPaneLayer = React.useCallback(
    (isInPane?: Dynamic) => (isInPane ? sidePaneRef.current?.querySelector(`[${SORT_BUTTON_ATTRIBUTE}]`) : null) ?? whatHasCaretAfterLayer(),
    [whatHasCaretAfterLayer],
  );
  let whatHasCaretAfterKeysList = React.useCallback(() => {
    let focusBefore = focusBeforeKeysListRef.current;
    let caretAfter = whatHasCaretAfter();
    let isTypingTarget =
      focusBefore === gridFocusRef.current ||
      focusBefore === cellEditorRef.current ||
      focusBefore === activeEditorRef.current ||
      (focusBefore === formulaBarRef.current && !store.getView().isFormulaBarReadOnly);
    let returnTo = focusBefore instanceof HTMLElement && isElementLiveAndNotInert(focusBefore) && !isTypingTarget ? focusBefore : null;
    let target = pickFocusTarget(returnTo, caretAfter, whatHasCaretAfterLayer);
    if (target === false || placementIdOfElement(target) !== placementBeforeKeysListRef.current) placementBeforeKeysListRef.current = null;
    return target;
  }, [store, whatHasCaretAfter, whatHasCaretAfterLayer]);
  let menu = view.menu;
  React.useEffect(() => {
    if (menu === null || isMenuHoldingField(menu)) return;
    isContextBarMenuByKeyRef.current = menu.isOfContextBar === true && menu.isAskedByKey;
    isChartMenuRef.current = menu.ofChart !== undefined;
  }, [menu]);
  let isOneCellSelected2 = view.selectedCellCount === 1;
  React.useEffect(() => {
    if (menu?.holds === 'all' && isOneCellSelected2 && menu.tableToSort === undefined)
      store.dispatch({
        kind: 'tableToSortAsked',
      });
  }, [store, menu, isOneCellSelected2]);
  let whatHasCaretAfterContextBarMenu = React.useCallback(() => {
    if (isCaretLeftForComment()) return false;
    let active = cellsRef.current?.ownerDocument.activeElement ?? null;
    if (active !== null && active.closest(`[${ERRORS_OFFERED_ATTRIBUTE}]`) !== null) return false;
    let caretAfter = whatHasCaretAfter();
    let chartPlacementId = caretAfter !== false && isChartMenuRef.current ? getSelectedPlacementId() : null;
    if (chartPlacementId !== null && active !== null) return findPlacedViewCaret(active.ownerDocument, chartPlacementId) ?? caretAfter;
    let isEditing = store.getView().mode.kind === 'editing';
    if (!isContextBarMenuByKeyRef.current || caretAfter === false || isEditing) return caretAfter;
    return toolbarTabStopOf(formatToolsRef.current) ?? caretAfter;
  }, [store, whatHasCaretAfter, isCaretLeftForComment, getSelectedPlacementId]);
  let askContextBarMenu = React.useCallback(
    (button?: Dynamic, isByKey?: Dynamic) => {
      let cells = cellsRef.current;
      if (cells === null) return;
      let { left: left, top: top, height: height } = button.getBoundingClientRect();
      let zoomNow = gridZoom.now();
      store.dispatch({
        kind: 'menuAsked',
        at: pointInZoomedElement(cells, zoomNow, {
          clientX: left,
          clientY: top,
        }),
        inContextBar: {
          height: unzoomLength(height, zoomNow),
          isByKey: isByKey,
        },
      });
    },
    [store, gridZoom],
  );
  let closeMenu = React.useCallback(() => {
    clicksSinceCaretMovedRef.current = 0;
    if (store.getView().menu?.ofHandleOfTable !== undefined) menuOfHandleShut();
    store.dispatch({
      kind: 'menuClosed',
    });
  }, [store, menuOfHandleShut]);
  let closeMenuIfAskedAt = React.useCallback(
    (at?: Dynamic) =>
      store.dispatch({
        kind: 'menuClosed',
        onlyIfAskedAt: at,
      }),
    [store],
  );
  let onLayerOpenChange = React.useCallback(
    (layer?: Dynamic, isOpen?: Dynamic, event?: Dynamic) => {
      let win = cellsRef.current?.ownerDocument.defaultView;
      let isNewlyOpen = isOpen && !heldBackLayersRef.current.has(layer);
      let isUserActive = win?.navigator.userActivation?.isActive !== false;
      if (isNewlyOpen && isUserActive && win?.document.hasFocus() === false) {
        win.focus();
        if (!win.document.hasFocus())
          getTypingTargetElement()?.focus({
            preventScroll: true,
          });
      }
      if (isOpen) heldBackLayersRef.current.add(layer);
      else heldBackLayersRef.current.delete(layer);
      setIsAnyLayerHeldBack(heldBackLayersRef.current.size > 0);
      setIsNonWaysInLayerHeldBack([...heldBackLayersRef.current].some((input?: Dynamic) => input !== 'ofWaysIn'));
      menuKeyEventRef.current = event;
      let isPressInCells = event?.type === 'mousedown' && event.target instanceof Node && cellsRef.current?.contains(event.target) === true;
      let isBarOfPhone = (cellsRef.current?.closest('[data-is-bar-of-phone]') ?? null) !== null;
      if (!isOpen && !(event === null && isBarOfPhone)) clicksSinceCaretMovedRef.current = isPressInCells ? 1 : 0;
    },
    [getTypingTargetElement],
  );
  let notedContextBarMenuRef = React.useRef(null);
  let isPickerAskedByKeyRef = React.useRef(false);
  let contextBarMenuHandlers2 = React.useCallback(
    () =>
      contextBarMenuHandlers({
        store: store,
        noted: notedContextBarMenuRef,
        note: (layer?: Dynamic, isOpen?: Dynamic) => onLayerOpenChange('ofToolbar', layer, isOpen),
        onCardAsked: () =>
          store.lookOnceEventsAreFinished(() => {
            if (!((formatToolsRef.current?.getClientRects().length ?? 0) > 0) || store.getView().isAgentWorking) return;
            let { isOfFilterBar: value = false, isFilterNotDrawnYet: value2 = false } = store.getView().rowsAskedFor ?? {};
            if (value && !value2 && !isTouchBelowSm()) return;
          }),
      }),
    [store, shell, onLayerOpenChange],
  );
  let chartMenuOpenCountRef = React.useRef(0);
  let leaveEntryKeepingSelection = React.useCallback(() => {
    let selectedCaretInEntry = () => {
      let { caretInEntry: caretInEntry2 } = caretInEntryPatch(store.getView().mode, entryFieldRefs);
      return caretInEntry2 !== undefined && caretInEntry2.start < caretInEntry2.end ? caretInEntry2 : undefined;
    };
    if (selectedCaretInEntry() === undefined) return;
    giveEntryBoxToFormat(store, entryFieldRefs);
    let caretInEntry = selectedCaretInEntry();
    if (caretInEntry !== undefined)
      store.dispatch({
        kind: 'entryLeft',
        isForToolAboutWholeCells: true,
        caretInEntry: caretInEntry,
      });
  }, [store, entryFieldRefs]);
  let onMenuOpenChange = React.useCallback(
    (menuKind?: Dynamic, isOpen?: Dynamic, event?: Dynamic, at?: Dynamic) => {
      contextBarMenuOpenedByRef.current = null;
      if (menuKind === 'chart' && isOpen) chartMenuOpenCountRef.current += 1;
      if (menuKind === 'chart' && isOpen && store.getView().mode.kind === 'editing')
        store.dispatch({
          kind: 'entryLeft',
        });
      if (menuKind === 'sort' && isOpen && store.getView().mode.kind === 'editing')
        store.dispatch({
          kind: 'entryLeft',
        });
      if (isOpen && isFormatMenuKeepingEntrySelection(menuKind)) leaveEntryKeepingSelection();
      contextBarMenuHandlers2().onOpenChange(menuKind, isOpen, event, at);
    },
    [store, contextBarMenuHandlers2, leaveEntryKeepingSelection],
  );
  let { contextBarMenu: contextBarMenu } = view;
  React.useEffect(() => {
    if (contextBarMenu === null) contextBarMenuHandlers2().onNoMenuInState();
  });
  let onWaysInLayerOpenChange = React.useCallback(
    (input?: Dynamic, options?: Dynamic) => onLayerOpenChange('ofWaysIn', input, input ? null : options),
    [onLayerOpenChange],
  );
  let onZoomLayerOpenChange = React.useCallback(
    (input?: Dynamic, options?: Dynamic) => onLayerOpenChange('ofZoom', input, input ? null : options),
    [onLayerOpenChange],
  );
  let onFiguresLayerOpenChange = React.useCallback(
    (input?: Dynamic, options?: Dynamic) => onLayerOpenChange('ofFigures', input, input ? null : options),
    [onLayerOpenChange],
  );
  let onSheetsLayerOpenChange = React.useCallback(
    (input?: Dynamic, options?: Dynamic) => onLayerOpenChange('ofSheets', input, input ? null : options),
    [onLayerOpenChange],
  );
  let entryCellLabel =
    view.entrySheetName === null
      ? null
      : {
          sheet: sheetPrefixForFormula(view.entrySheetName).slice(0, -1),
          cell: `!${view.entryCellText}`,
        };
  let { body: gridBody } = view.grid;
  let entryBox = view.grid.editorBox ?? view.grid.activeCellBox;
  let isCalendarShown = view.calendar !== null && entryBox !== null;
  let {
    left: entryBoxLeft,
    top: entryBoxTop,
    width: entryBoxWidth,
    height: entryBoxHeight,
  } = entryBox === null
    ? {
        ...gridBody,
        width: 0,
        height: 0,
      }
    : zoomedEntryBox(entryBox, gridBody, view.grid.editorScale);
  let calendarAnchor = useZoomedVirtualAnchor(
    cellsRef,
    zoom,
    React.useMemo(
      () => (isCalendarShown ? new (DOMRect as Dynamic)(entryBoxLeft, entryBoxTop, entryBoxWidth, entryBoxHeight) : null),
      [isCalendarShown, entryBoxLeft, entryBoxTop, entryBoxWidth, entryBoxHeight],
    ),
  );
  let isLinkFormShown = view.linkForm !== null && entryBox !== null;
  let linkFormAnchor = useZoomedVirtualAnchor(
    cellsRef,
    zoom,
    React.useMemo(
      () => (isLinkFormShown ? new (DOMRect as Dynamic)(entryBoxLeft, entryBoxTop, entryBoxWidth, entryBoxHeight) : null),
      [isLinkFormShown, entryBoxLeft, entryBoxTop, entryBoxWidth, entryBoxHeight],
    ),
  );
  let isCellHistoryShown = view.cellHistory !== null && entryBox !== null;
  let cellHistoryAnchor = useZoomedVirtualAnchor(
    cellsRef,
    zoom,
    React.useMemo(
      () => (isCellHistoryShown ? new (DOMRect as Dynamic)(entryBoxLeft, entryBoxTop, entryBoxWidth, entryBoxHeight) : null),
      [isCellHistoryShown, entryBoxLeft, entryBoxTop, entryBoxWidth, entryBoxHeight],
    ),
  );
  let { dropdownAnchorBox: dropdownAnchorBox, editorScale: editorScale } = view.grid;
  let dropdownAnchor = useZoomedVirtualAnchor(
    cellsRef,
    zoom,
    React.useMemo(
      () => (dropdownAnchorBox === null ? null : toDomRect(zoomedEntryBox(dropdownAnchorBox, gridBody, editorScale))),
      [dropdownAnchorBox, gridBody, editorScale],
    ),
  );
  let onDropdownRowChosen = React.useCallback(
    (rowKey?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      lastProgrammaticActMsRef.current = performance.now();
      store.dispatch({
        kind: 'dropdownListRowChosen',
        key: rowKey,
      });
    },
    [store],
  );
  let onDropdownBlur = React.useCallback(
    (event?: Dynamic) => {
      let goingTo = 'relatedTarget' in event && event.relatedTarget !== null ? event.relatedTarget : event.target;
      if (goingTo instanceof Node && cellsRef.current?.contains(goingTo) === true) return;
      clicksSinceCaretMovedRef.current = 0;
      store.dispatch({
        kind: 'dropdownShut',
      });
    },
    [store],
  );
  let giveUpSidePane = React.useCallback(() => {
    pointerPressesRef.current += 1;
    store.dispatch({
      kind: 'sidePaneShut',
      isGivenUp: true,
    });
  }, [store]);
  let shutSidePane = React.useCallback(() => {
    clicksSinceCaretMovedRef.current = 0;
    getLastFocusedByKey()?.focus({
      preventScroll: true,
    });
    store.dispatch({
      kind: 'sidePaneShut',
    });
  }, [store, getLastFocusedByKey]);
  let dispatchThenNoteChange = React.useCallback(
    (event?: Dynamic, onDone?: Dynamic) => {
      if (onDone === undefined) return store.dispatch(event);
      let onNotDone = () => onDone(false);
      return store.onceEventsAreFinished(() => {
        let viewBefore = store.getView();
        try {
          store.dispatch(event);
        } finally {
          store.onceEventsAreFinished(() => onDone(store.getView() !== viewBefore), onNotDone);
        }
      }, onNotDone);
    },
    [store],
  );
  let onDropdownEditorAct = React.useCallback(
    (act?: Dynamic, onDone?: Dynamic) =>
      dispatchThenNoteChange(
        {
          kind: 'dropdownEditorActedIn',
          act: act,
        },
        onDone,
      ),
    [dispatchThenNoteChange],
  );
  let onConditionalFormatsAct = React.useCallback(
    (act?: Dynamic, onDone?: Dynamic) =>
      dispatchThenNoteChange(
        {
          kind: 'conditionalFormatsActedIn',
          act: act,
        },
        onDone,
      ),
    [dispatchThenNoteChange],
  );
  let onSortPaneAct = React.useCallback(
    (act?: Dynamic, onDone?: Dynamic) => {
      if (act.kind === 'sort' && store.getView().mode.kind === 'editing')
        store.dispatch({
          kind: 'entryLeft',
        });
      let isWithNoKeyboard = act.kind === 'sort' && !likelyHasKeyboard();
      dispatchThenNoteChange(
        {
          kind: 'sortPaneActedIn',
          act: isWithNoKeyboard
            ? {
                ...act,
                isWithNoKeyboard: isWithNoKeyboard,
              }
            : act,
        },
        onDone,
      );
    },
    [store, dispatchThenNoteChange],
  );
  let askSortPane = React.useCallback(
    (of?: Dynamic, options: Dynamic = NO_CHOSEN_IN) => {
      if (store.getView().mode.kind === 'editing')
        store.dispatch({
          kind: 'entryLeft',
        });
      store.dispatch({
        kind: 'sortPaneAsked',
        of: of,
        ...options,
      });
    },
    [store],
  );
  let askSortPaneFromMenu = React.useCallback((of?: Dynamic) => askSortPane(of, CHOSEN_IN_MENU), [askSortPane]);
  let onVersionHistoryAct = React.useCallback(
    (act?: Dynamic) =>
      store.dispatch({
        kind: 'versionHistoryActedIn',
        act: act,
      }),
    [store],
  );
  let lookAtVersionsAgain = React.useCallback(
    () =>
      store.dispatch({
        kind: 'versionsLookedAtAgain',
      }),
    [store],
  );
  let returnFocusFromSidePaneWhen = React.useCallback(
    (isStillOpen?: Dynamic) => {
      if (!isPointerPressedLastRef.current || !likelyHasKeyboard()) return;
      store.lookOnceEventsAreFinished(() => {
        if (isStillOpen(store.getView())) return;
        let sidePane = sidePaneRef.current;
        let active = sidePane?.ownerDocument.activeElement ?? null;
        if (sidePane?.contains(active) === true && !isTextInputOrEntryEditor(active) && sidePane.ownerDocument.hasFocus())
          getTypingTargetElement()?.focus({
            preventScroll: true,
          });
      });
    },
    [store, getTypingTargetElement],
  );
  let returnFocusFromConditionalFormats = React.useCallback(
    () =>
      returnFocusFromSidePaneWhen(({ conditionalFormats: conditionalFormats2 }: Dynamic) => conditionalFormats2?.keepsKeys !== false),
    [returnFocusFromSidePaneWhen],
  );
  let returnFocusFromVersionHistory = React.useCallback(
    () => returnFocusFromSidePaneWhen(({ versionHistory: versionHistory }: Dynamic) => versionHistory === null),
    [returnFocusFromSidePaneWhen],
  );
  let askRulesFromCells = React.useCallback(() => {
    isPickerAskedByKeyRef.current = false;
    contextBarMenuOpenedByRef.current = null;
    let isContextBarShown = (formatToolsRef.current?.getClientRects().length ?? 0) > 0;
    contextBarMenuHandlers2().onRulesAskedByRow('cells', !isContextBarShown);
  }, [contextBarMenuHandlers2]);
  let askSortFromMenu = React.useCallback(() => {
    isPickerAskedByKeyRef.current = false;
    let { menu: menu2, grid: grid2 } = store.getView();
    let filterButton = grid2.filterButtons.find(
      ({ isOfFoundTable: isOfFoundTable, tableKey: tableKey }: Dynamic) => isOfFoundTable && tableKey === menu2?.ofHandleOfTable,
    );
    if (filterButton !== undefined) {
      store.dispatch({
        kind: 'menuClosed',
      });
      return onMenuOpenChange('sort', true, null, {
        r: filterButton.r,
        c: filterButton.c,
      });
    }
    let isContextBarShown = (formatToolsRef.current?.getClientRects().length ?? 0) > 0;
    if (!isContextBarShown && store.getView().ownFilterOffers?.filter.kind !== 'turnOn') return;
    if (!isContextBarShown)
      return store.dispatch({
        kind: 'ownFilterAsked',
        chosenIn: 'menu',
      });
    onMenuOpenChange('sort', true, null, GUESS_TABLE_FOR_ROWS_ASK);
    contextBarMenuOpenedByRef.current = menuOpenedByRef.current;
    return;
  }, [store, onMenuOpenChange]);
  let askChartFromMenu = React.useCallback(
    (isByKey?: Dynamic) => {
      isPickerAskedByKeyRef.current = false;
      store.dispatch({
        kind: 'menuClosed',
      });
      onMenuOpenChange('chart', true, null);
      contextBarMenuOpenedByRef.current = isByKey ? 'key' : 'pointer';
    },
    [store, onMenuOpenChange],
  );
  let onTableMenuKeyDown = React.useCallback(
    (event?: Dynamic, menuKind?: Dynamic) => {
      if (event.nativeEvent.isComposing || isAltShortcutKey(event)) return;
      let key = normalizedKeyEvent(event);
      let keyTarget = keyTargetAtTableMenu(key, menuKind);
      if (keyTarget === 'menu') return;
      event.preventDefault();
      event.stopPropagation();
      if (keyTarget === 'cells')
        store.dispatch({
          kind: 'keyPressed',
          ...key,
        });
    },
    [store],
  );
  let { dropdownList: dropdownList } = view;
  let highlightedDropdownRow = dropdownList?.rows[dropdownList.highlightedRow ?? -1];
  let isEntryHelperShown =
    view.peopleList !== null ||
    view.timeList !== null ||
    view.functionList !== null ||
    view.functionGuide !== null ||
    formulaFromWords.stage !== null;
  let peopleListField = view.peopleList?.inField ?? null;
  let peopleListCellBox = peopleListField === null ? null : view.grid.activeCellBox;
  let editorVerticalAlign = view.grid.editorFormat.alignment.vertical;
  let { clearBodyHeight: clearBodyHeight } = view.grid;
  let { over: editorClearOver, under: editorClearUnder, right: editorClearRight } = view.grid.editorKeepsClear;
  let { density: density } = view;
  let cellPaddingBeside2 = cellPaddingBesideBox(density);
  let peopleListPlacement = React.useMemo(() => {
    if (peopleListCellBox === null) return null;
    let keepsClear = {
      over: editorClearOver,
      under: editorClearUnder,
      left: cellPaddingBeside2,
      right: editorClearRight,
    };
    let {
      left: left,
      top: top,
      height: height,
      minWidth: minWidth,
      clipPath: clipPath,
    } = cellEntryBoxStyle(peopleListCellBox, gridBody, DEFAULT_CELL_FORMAT, keepsClear);
    let scrollSlop = DROPDOWN_SCROLL_SLOP;
    let { showsIn: showsIn } = peopleListCellBox;
    let showsInBottom = Math.min(showsIn.top + showsIn.height, clearBodyHeight);
    let isChipsAlignedFits = (
      {
        top: peopleListCellBox.top >= showsIn.top - scrollSlop,
        center: true,
        bottom: peopleListCellBox.top + peopleListCellBox.height <= showsInBottom + scrollSlop,
      } as Dynamic
    )[editorVerticalAlign];
    return {
      left: left,
      top: top,
      width: minWidth,
      height: height,
      linesBefore: entryGridlineOverlap(peopleListCellBox, 1),
      chipsAt: isChipsAlignedFits ? editorVerticalAlign : 'center',
      clearOfText: textClearanceStyle(keepsClear, density),
      ...(clipPath !== undefined && {
        clipPath: clipPath,
      }),
    };
  }, [
    peopleListCellBox,
    gridBody,
    editorClearOver,
    editorClearUnder,
    density,
    cellPaddingBeside2,
    editorClearRight,
    editorVerticalAlign,
    clearBodyHeight,
  ]);
  let popupBounds = React.useMemo(
    () => ({
      left: gridBody.left,
      right: gridBody.left + gridBody.width - POPUP_EDGE_GAP,
    }),
    [gridBody.left, gridBody.width],
  );
  let [entryHelperRect, setEntryHelperRect] = React.useState(null);
  let noteEntryHelperRect = React.useCallback(
    (box?: Dynamic) =>
      setEntryHelperRect((rectBefore?: Dynamic) => {
        if (box === null) return null;
        let { left: value, top: value2, width: value3, height: value4 } = box;
        return rectBefore?.x === value && rectBefore.y === value2 && rectBefore.width === value3 && rectBefore.height === value4
          ? rectBefore
          : new (DOMRect as Dynamic)(value, value2, value3, value4);
      }),
    [],
  );
  let entryHelperAnchor = useZoomedVirtualAnchor(
    cellsRef,
    zoom,
    React.useMemo(() => {
      if (!isEntryHelperShown) return null;
      if (peopleListPlacement !== null && entryHelperRect !== null) return entryHelperRect;
      return new (DOMRect as Dynamic)(entryBoxLeft, entryBoxTop, entryBoxWidth, entryBoxHeight);
    }, [isEntryHelperShown, peopleListPlacement, entryHelperRect, entryBoxLeft, entryBoxTop, entryBoxWidth, entryBoxHeight]),
  );
  let removePersonFromField = React.useCallback(
    (userId?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      getTypingTargetElement()?.focus({
        preventScroll: true,
      });
      store.dispatch({
        kind: 'personRemovedFromField',
        userId: userId,
      });
    },
    [store, getTypingTargetElement],
  );
  let {
    left: explainedCellLeft = null,
    top: explainedCellTop = 0,
    width: explainedCellWidth = 0,
    height: explainedCellHeight = 0,
  } = view.grid.explainedCellBox ?? {};
  let explainedCellRect = React.useMemo(
    () =>
      explainedCellLeft === null
        ? null
        : {
            x: gridBody.left + explainedCellLeft,
            y: gridBody.top + explainedCellTop,
            width: explainedCellWidth,
            height: explainedCellHeight,
          },
    [explainedCellLeft, explainedCellTop, explainedCellWidth, explainedCellHeight, gridBody.left, gridBody.top],
  );
  let errorExplainedAnchor = useZoomedVirtualAnchor(cellsRef, zoom, view.errorExplained === null ? null : explainedCellRect);
  let { cornerOfErrorsOffered: cornerOfErrorsOffered } = view.grid;
  let [errorCornerLeft, errorCornerTop] = [cornerOfErrorsOffered?.left, cornerOfErrorsOffered?.top];
  let errorCornerRect = React.useMemo(
    () =>
      errorCornerLeft === undefined || errorCornerTop === undefined
        ? null
        : {
            x: gridBody.left + errorCornerLeft,
            y: gridBody.top + errorCornerTop,
            width: 0,
            height: 0,
          },
    [errorCornerLeft, errorCornerTop, gridBody.left, gridBody.top],
  );
  let errorCornerAnchor = useZoomedVirtualAnchor(cellsRef, zoom, errorCornerRect);
  let { pillOfFix: pillOfFix } = view.grid;
  let { left: fixPillLeft, top: fixPillTop, width: fixPillWidth, height: fixPillHeight } = pillOfFix?.box ?? {};
  let fixPillRect = React.useMemo(
    () =>
      fixPillLeft === undefined || fixPillTop === undefined
        ? null
        : {
            x: gridBody.left + fixPillLeft,
            y: gridBody.top + fixPillTop,
            width: fixPillWidth ?? 0,
            height: fixPillHeight ?? 0,
          },
    [fixPillLeft, fixPillTop, fixPillWidth, fixPillHeight, gridBody.left, gridBody.top],
  );
  let fixPillAnchor = useZoomedVirtualAnchor(cellsRef, zoom, fixPillRect);
  let fixPillKey = pillOfFix?.key ?? null;
  let actableFixPillKey = isAnyLayerHeldBack ? null : fixPillKey;
  let onFixActedOn = React.useCallback(
    (act?: Dynamic, options?: Dynamic) => {
      if (actableFixPillKey !== null)
        store.dispatch({
          kind: 'fixActedOn',
          act: act,
          pillOf: actableFixPillKey,
          ...options,
        });
    },
    [store, actableFixPillKey],
  );
  let holdActAtFixes = React.useCallback(
    () =>
      store.dispatch({
        kind: 'actHeldAtAgentsAnswer',
        at: 'fixes',
      }),
    [store],
  );
  let fixPointer = useFixPointer(store, fixPillKey);
  let fixKeyCameAt = useWhenKeyCame(actableFixPillKey);
  let fixPillKeyForKeys = pillOfFix?.areKeysForIt === true ? actableFixPillKey : null;
  let fixKeysCameAt = useWhenKeyCame(fixPillKeyForKeys);
  let linkExplainedRect = view.linkExplained?.wordsBox ?? explainedCellRect;
  let linkExplainedAnchor = useZoomedVirtualAnchor(cellsRef, zoom, view.linkExplained === null ? null : linkExplainedRect);
  let formulaBarTextStartAnchor = React.useMemo(
    () => ({
      getBoundingClientRect() {
        let formulaBar = formulaBarRef.current;
        let style = formulaBar?.ownerDocument.defaultView?.getComputedStyle(formulaBar);
        if (formulaBar === null || style === undefined) return new (DOMRect as Dynamic)();
        let { left: bounds, top: bounds2, height: bounds3 } = formulaBar.getBoundingClientRect();
        let insetLeft = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft);
        return new (DOMRect as Dynamic)(bounds + insetLeft, bounds2, 0, bounds3);
      },
    }),
    [],
  );
  let closeCalendar = React.useCallback(() => {
    clicksSinceCaretMovedRef.current = 0;
    store.dispatch({
      kind: 'calendarClosed',
    });
  }, [store]);
  let closeCalendarIfStill = React.useCallback(
    (ifStill?: Dynamic) =>
      store.dispatch({
        kind: 'calendarClosed',
        ifStill: ifStill,
      }),
    [store],
  );
  let chooseDay = React.useCallback(
    (day?: Dynamic, time?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      lastProgrammaticActMsRef.current = performance.now();
      store.dispatch({
        kind: 'dayChosen',
        day: day,
        ...(time !== null && {
          time: time,
        }),
      });
    },
    [store],
  );
  let chooseTime = React.useCallback(
    (time?: Dynamic, today2?: Dynamic, thenCalendar?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      store.dispatch({
        kind: 'timeChosen',
        time: time,
        today: today2,
        thenCalendar: thenCalendar,
      });
    },
    [store],
  );
  let onCalendarKeyDown = React.useCallback(
    (event?: Dynamic) => {
      if (event.nativeEvent.isComposing || isAltShortcutKey(event)) return;
      let key = normalizedKeyEvent(event);
      let { mode: mode2, viewOnlyBecause: viewOnlyBecause } = store.getView();
      let actWhileNavigating = keyActOf(NAVIGATING_MODE, key, null, 'leaves');
      let isTypingStart = actWhileNavigating?.kind === 'startEditing' && actWhileNavigating.text !== null && actWhileNavigating.text !== ' ';
      if (mode2.kind === 'editing' && (isTypingStart || actWhileNavigating?.kind === 'clearCells'))
        return activeEditorRef.current?.focus({
          preventScroll: true,
        });
      let act = keyActOf(mode2, key, null, 'leaves');
      if (
        !(
          (act?.kind === 'startEditing' && act.text !== ' ') ||
          act?.kind === 'clearCells' ||
          (act?.kind === 'fill' && viewOnlyBecause === null) ||
          act?.kind === 'undoOrRedo' ||
          act?.kind === 'formatCells' ||
          act?.kind === 'askForMenu'
        )
      )
        return;
      event.preventDefault();
      store.dispatch({
        kind: 'keyPressed',
        ...key,
      });
    },
    [store],
  );
  let isColumnWidthFieldOpen = view.menu?.holds === 'columnWidthField';
  let chooseColumnWidth2 = React.useCallback(
    (widthInPixels?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      store.dispatch({
        kind: 'columnWidthChosen',
        widthInPixels: widthInPixels,
      });
    },
    [store],
  );
  let chooseCellsToSort = React.useCallback(
    (chosen?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      store.dispatch({
        kind: 'cellsToSortChosen',
        chosen: chosen,
        ...(likelyHasKeyboard()
          ? {}
          : {
              isWithNoKeyboard: true,
            }),
      });
    },
    [store],
  );
  let isRowHeightFieldOpen = view.menu?.holds === 'rowHeightField';
  let chooseRowHeight2 = React.useCallback(
    (chosen?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      store.dispatch({
        kind: 'rowHeightChosen',
        chosen: chosen,
      });
    },
    [store],
  );
  let typeCustomNumberFormat = React.useCallback(
    (pattern?: Dynamic, isOfUndoOrRedo?: Dynamic) =>
      store.dispatch({
        kind: 'customNumberFormatTyped',
        pattern: pattern,
        ...(isOfUndoOrRedo && {
          isOfUndoOrRedo: isOfUndoOrRedo,
        }),
      }),
    [store],
  );
  let enterCustomNumberFormat = React.useCallback(
    (input?: Dynamic) =>
      store.dispatch({
        kind: 'customNumberFormatEntered',
        ...input,
      }),
    [store],
  );
  let dropCustomNumberFormat = React.useCallback(
    () =>
      store.dispatch({
        kind: 'customNumberFormatDropped',
      }),
    [store],
  );
  let escapeCustomNumberFormat = React.useCallback(
    () =>
      store.dispatch({
        kind: 'customNumberFormatEscaped',
      }),
    [store],
  );
  let askAgentForNumberFormat2 = React.useCallback(
    (input?: Dynamic) =>
      store.dispatch({
        kind: 'agentAskedForNumberFormat',
        ...input,
      }),
    [store],
  );
  let holdActAtNumberFormat = React.useCallback(
    (input: Dynamic = {}) =>
      store.dispatch({
        kind: 'actHeldAtAgentsAnswer',
        at: 'numberFormat',
        ...input,
      }),
    [store],
  );
  let answerPasteThatWaits = React.useCallback(
    (nth?: Dynamic, isToBePasted?: Dynamic) =>
      store.dispatch({
        kind: 'pasteThatWaitsAnswered',
        nth: nth,
        isToBePasted: isToBePasted,
      }),
    [store],
  );
  let { timeZone: timeZone, locale: locale, examplesOfNumberFormats: examplesOfNumberFormats } = view;
  let dateExample = React.useMemo(
    () => ({
      locale: locale,
      march15: exampleOfChoice(examplesOfNumberFormats, 'date'),
    }),
    [locale, examplesOfNumberFormats],
  );
  let leaveEntryIfEditing = React.useCallback(() => {
    if (store.getView().mode.kind === 'editing')
      store.dispatch({
        kind: 'entryLeft',
      });
  }, [store]);
  let workbookSettings = React.useMemo(
    () => ({
      locale: locale,
      examples: examplesOfNumberFormats,
      onLocaleAsked: () => {
        leaveEntryIfEditing();
        store.dispatch({
          kind: 'pickForWorkbookAsked',
          of: 'locale',
        });
      },
      timeZone: timeZone,
      onTimeZoneAsked: () => {
        leaveEntryIfEditing();
        store.dispatch({
          kind: 'pickForWorkbookAsked',
          of: 'timeZone',
          nameInBrowser: browserTimeZone(),
        });
      },
    }),
    [store, locale, examplesOfNumberFormats, timeZone, leaveEntryIfEditing],
  );
  let pickForWorkbook = React.useCallback(
    (of?: Dynamic, value?: Dynamic) =>
      store.dispatch({
        kind: 'pickedForWorkbook',
        of: of,
        value: value,
      }),
    [store],
  );
  let enterPickForWorkbook = React.useCallback(
    () =>
      store.dispatch({
        kind: 'pickForWorkbookEntered',
      }),
    [store],
  );
  let dropPickForWorkbook = React.useCallback(
    () =>
      store.dispatch({
        kind: 'pickForWorkbookDropped',
      }),
    [store],
  );
  let answerImportQuestion2 = React.useCallback(
    (questionId?: Dynamic, optionIndex?: Dynamic) =>
      store.dispatch({
        kind: 'importQuestionAnswered',
        questionId: questionId,
        optionIndex: optionIndex,
      }),
    [store],
  );
  let chooseImportDestination2 = React.useCallback(
    (input?: Dynamic) =>
      store.dispatch({
        kind: 'importDestinationChosen',
        picked: input,
      }),
    [store],
  );
  let changeImportByHand2 = React.useCallback(
    (input?: Dynamic) =>
      store.dispatch({
        kind: 'importChangedByHand',
        change: input,
      }),
    [store],
  );
  let askImportKinds = React.useCallback(
    (input?: Dynamic) =>
      store.dispatch({
        kind: 'importKindsAskedFor',
        columnIndex: input,
      }),
    [store],
  );
  let sendImportWish2 = React.useCallback(
    (input?: Dynamic) =>
      store.dispatch({
        kind: 'importWishSent',
        wish: input,
      }),
    [store],
  );
  let askImportPlanAgain2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'importPlanAskedAgain',
      }),
    [store],
  );
  let stopAwaitingImportPlan2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'importPlanAwaitedNoLonger',
      }),
    [store],
  );
  let confirmImport2 = React.useCallback(
    (plansHeardCount?: Dynamic) =>
      store.dispatch({
        kind: 'importConfirmed',
        plansHeardCount: plansHeardCount,
      }),
    [store],
  );
  let latestAfterDialogRef = React.useRef(isPageLeftUnpressed);
  React.useInsertionEffect(() => {
    latestAfterDialogRef.current = isPageLeftUnpressed;
  });
  let callLatestAfterDialog = React.useCallback(() => latestAfterDialogRef.current(), []);
  let noteDialogReturn = React.useCallback((returnTo?: Dynamic) => {
    focusLostToNothingRef.current = returnTo;
    isDialogOwedCaretRef.current = true;
    fieldLeftForMenuRef.current = null;
  }, []);
  let shutXlsxFileDialog = React.useCallback(() => {
    store.dispatch({
      kind: 'xlsxFileDialogShut',
    });
  }, [store]);
  let chooseSheetChange = React.useCallback(
    (input?: Dynamic) =>
      store.dispatch({
        kind: 'sheetChangeChosen',
        change: input,
        ...(likelyHasKeyboard()
          ? {}
          : {
              isWithNoKeyboard: true,
            }),
      }),
    [store],
  );
  let chooseColumnToSortBy = React.useCallback(
    (columnId?: Dynamic) =>
      store.dispatch({
        kind: 'columnToSortByChosen',
        columnId: columnId,
        ...(likelyHasKeyboard()
          ? {}
          : {
              isWithNoKeyboard: true,
            }),
      }),
    [store],
  );
  let chooseFreeze = React.useCallback(
    (what?: Dynamic, count?: Dynamic) =>
      store.dispatch({
        kind: 'freezeChosen',
        what: what,
        count: count,
      }),
    [store],
  );
  let leaveGroupMargin = React.useCallback(() => {
    if (((cellsRef.current?.ownerDocument.activeElement ?? null)?.closest('.sheet-group-margin') ?? null) !== null) focusCaret();
  }, [focusCaret]);
  let onGroupMarkPressed = React.useCallback(
    (of: Dynamic, { groupIds: groupIds, isCollapsed: isCollapsed }: Dynamic) => {
      store.dispatch({
        kind: 'groupMarkPressed',
        of: of,
        groupIds: groupIds,
        isToCollapse: !isCollapsed,
      });
      leaveGroupMargin();
    },
    [store, leaveGroupMargin],
  );
  let chooseGroupLevel = React.useCallback(
    (of?: Dynamic, level?: Dynamic, options: Dynamic = NO_CHOSEN_IN) => {
      store.dispatch({
        kind: 'groupLevelChosen',
        of: of,
        level: level,
        ...options,
      });
      leaveGroupMargin();
    },
    [store, leaveGroupMargin],
  );
  let chooseGroupLevelFromMenu = React.useCallback(
    (input?: Dynamic, options?: Dynamic) => chooseGroupLevel(input, options, CHOSEN_IN_MENU),
    [chooseGroupLevel],
  );
  let onZoomTyped = React.useCallback(
    (zoom2?: Dynamic) => {
      openLink(zoom2, 'typed');
      focusCaret();
    },
    [openLink, focusCaret],
  );
  let chooseComment = React.useCallback(() => {
    store.dispatch({
      kind: 'commentChosen',
      chosenIn: 'menu',
    });
    noteCommentChosen();
  }, [store, noteCommentChosen]);
  let askWhetherAgentCanBeSent = React.useCallback(() => commentsOfHost.askWhetherAgentCanBeSent(), [commentsOfHost]);
  React.useEffect(() => commentsOfHost.askWhetherAgentCanBeSent(), [commentsOfHost]);
  let couldSendToAgent = React.useCallback(() => commentsOfHost.couldSendToAgentWhenLastAnswered(), [commentsOfHost]);
  let isChatOfferedInMenu = React.useCallback(
    () => chatWithAgent.isToBeHad() === true && !chatWithAgent.isBesidePage(),
    [chatWithAgent],
  );
  let chooseCommentForAgent = React.useCallback(() => {
    store.dispatch({
      kind: 'commentChosen',
      isForAgent: true,
      chosenIn: 'menu',
    });
    noteCommentChosen();
  }, [store, noteCommentChosen]);
  let askCellsMenu = (at?: Dynamic, how?: Dynamic) => {
    let view2 = store.getView();
    let offers = {
      isFieldOnTop: !isCoarsePointerNow() && view2.viewOnlyBecause === null,
      isChatToBeHad: chatWithAgent.isToBeHad(),
      isCommentOffered: view2.isCommentOffered,
      doCellsShowError: doesSelectionShowError(view2),
      couldCommentGoToAgent: couldSendToAgent(),
    };
    let where = {
      selected: view2.selectionByAddress,
      place: whereIsFocus(),
      isInMenuThatPressShut: view2.menu === null && (getActiveElement()?.closest(`[${MENU_ON_CELLS_ATTRIBUTE}]`) ?? null) !== null,
      hasPauseHeld: how,
      isEventUnfinished: !store.isNextEventHandledAtOnce(),
      areCellsInView: (view2.grid.selectionBox ?? view2.grid.activeCellBox) !== null,
    };
    if (!shouldEnterCommentForAgent(offers, at, where)) return false;
    store.dispatch({
      kind: 'commentChosen',
      isForAgent: true,
    });
    noteCommentChosen();
    return true;
  };
  let askCopyOrCutFromMenu = React.useCallback(
    (asked?: Dynamic) => {
      store.dispatch({
        kind: 'menuClosed',
      });
      if (clipboard.askBrowserToCopyOrCutCells(asked)) return;
      isContextBarMenuByKeyRef.current = false;
      store.dispatch({
        kind: 'copyRefused',
        asked: asked,
        keyInstead: likelyHasKeyboard() ? PRIMARY_MODIFIER_NAME : null,
      });
    },
    [store, clipboard],
  );
  let chooseChartCopy = React.useCallback(() => {
    store.dispatch({
      kind: 'menuClosed',
    });
    let doc = cellsRef.current?.ownerDocument;
    if (doc === undefined || !wasExecCommandHandled(doc, 'copy'))
      store.dispatch({
        kind: 'copyRefused',
        asked: 'copy',
        keyInstead: likelyHasKeyboard() ? PRIMARY_MODIFIER_NAME : null,
      });
  }, [store]);
  let pasteFromMenu = React.useCallback(
    (asked?: Dynamic) => {
      let pasteEvent = pasteOfLastPutHere(clipboard, asked);
      let { menu: menu2 } = store.getView();
      if (pasteEvent === null || menu2 === null || isMenuHoldingField(menu2)) return;
      store.dispatch({
        kind: 'menuClosed',
      });
      store.dispatch(pasteEvent);
    },
    [store, clipboard],
  );
  let clearCellsFromMenu = React.useCallback(
    () =>
      store.dispatch({
        kind: 'sheetChangeChosen',
        change: 'clearCells',
        ...(likelyHasKeyboard()
          ? {}
          : {
              isWithNoKeyboard: true,
            }),
      }),
    [store],
  );
  let toggleFormulasShown2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'formulasShownToggled',
      }),
    [store],
  );
  let chooseDensity = React.useCallback(
    (density2?: Dynamic) => {
      store.dispatch({
        kind: 'densityChosen',
        density: density2,
      });
      store.onceEventsAreFinished(() => {
        if (store.getView().density === density2) storeDensity(density2);
      });
    },
    [store],
  );
  let chooseUndoOrRedo = React.useCallback(
    (direction?: Dynamic) =>
      store.dispatch({
        kind: 'undoOrRedoChosen',
        direction: direction,
      }),
    [store],
  );
  let askListOfKeys = React.useCallback(() => {
    focusBeforeKeysListRef.current = null;
    placementBeforeKeysListRef.current = null;
    store.dispatch({
      kind: 'listOfKeysAsked',
    });
  }, [store]);
  let shutListOfKeys = React.useCallback(
    () =>
      store.dispatch({
        kind: 'listOfKeysShut',
      }),
    [store],
  );
  let askCellHistory = React.useCallback(
    () =>
      store.dispatch({
        kind: 'cellHistoryAsked',
        chosenIn: 'menu',
      }),
    [store],
  );
  let chooseCellHistoryScope = React.useCallback(
    (scope?: Dynamic) =>
      store.dispatch({
        kind: 'cellHistoryScopeChosen',
        scope: scope,
      }),
    [store],
  );
  let askCellHistoryAgain2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'cellHistoryAskedAgain',
      }),
    [store],
  );
  let lookAtCellHistoryAgain = React.useCallback(
    () =>
      store.dispatch({
        kind: 'cellHistoryLookedAtAgain',
      }),
    [store],
  );
  let shutCellHistory = React.useCallback(
    () =>
      store.dispatch({
        kind: 'cellHistoryShut',
      }),
    [store],
  );
  let askOwnFilter = React.useCallback(
    () =>
      store.dispatch({
        kind: 'ownFilterAsked',
        chosenIn: 'menu',
      }),
    [store],
  );
  let chooseOwnFilterByCell = React.useCallback(
    (keeps?: Dynamic) =>
      store.dispatch({
        kind: 'ownFilterByCellChosen',
        keeps: keeps,
        chosenIn: 'menu',
      }),
    [store],
  );
  let shutOwnFilterList = React.useCallback(
    () =>
      dispatchToOwnFilterList({
        kind: 'ownFilterListShut',
      }),
    [dispatchToOwnFilterList],
  );
  let removeOwnFilterLine2 = React.useCallback(
    (tableKey?: Dynamic, lineIndex?: Dynamic) => {
      let { ownFilterList: ownFilterList } = store.getView();
      if (ownFilterList !== null) shutOwnFilterList();
      if (ownFilterList?.isOnTrial !== true || ownFilterList.tableKey !== tableKey)
        dispatchToOwnFilterList({
          kind: 'ownFilterLineRemoved',
          tableKey: tableKey,
          lineIndex: lineIndex,
        });
    },
    [store, shutOwnFilterList, dispatchToOwnFilterList],
  );
  let removeOwnSort = React.useCallback(
    (tableKey?: Dynamic) =>
      dispatchToOwnFilterList({
        kind: 'ownSortRemoved',
        tableKey: tableKey,
      }),
    [dispatchToOwnFilterList],
  );
  let makeOwnSortForEveryone = React.useCallback(
    (tableKey?: Dynamic) => {
      store.dispatch({
        kind: 'ownSortMadeForEveryone',
        tableKey: tableKey,
        ...(likelyHasKeyboard()
          ? {}
          : {
              isWithNoKeyboard: true,
            }),
      });
      focusCaret();
    },
    [store, focusCaret],
  );
  let clearOwnFilters2 = React.useCallback(
    (of?: Dynamic, options: Dynamic = NO_CHOSEN_IN) =>
      dispatchToOwnFilterList({
        kind: 'ownFiltersCleared',
        of: of,
        ...options,
      }),
    [dispatchToOwnFilterList],
  );
  let clearOwnFiltersOfTable = React.useCallback(
    (tableKey?: Dynamic) =>
      clearOwnFilters2(
        {
          tableKey: tableKey,
        },
        CHOSEN_IN_MENU,
      ),
    [clearOwnFilters2],
  );
  let clearOwnFiltersOfSheet = React.useCallback(
    (sheetId?: Dynamic) =>
      clearOwnFilters2({
        sheetId: sheetId,
      }),
    [clearOwnFilters2],
  );
  let isTableFormatKeptOffRef = React.useRef(false);
  let chooseFormatAsTable = React.useCallback(
    (isOn?: Dynamic) => {
      let kept = isTableFormatKeptOffRef.current ? null : readTablesNotFormatted();
      store.dispatch({
        kind: 'formatAsTableChosen',
        chosenIn: 'menu',
        isOn: isOn,
        kept: kept,
      });
    },
    [store],
  );
  let tablesNotFormattedSeenRef = React.useRef(view.tablesNotFormatted);
  React.useEffect(() => {
    if (view.tablesNotFormatted === tablesNotFormattedSeenRef.current) return;
    tablesNotFormattedSeenRef.current = view.tablesNotFormatted;
    isTableFormatKeptOffRef.current = !writeTablesNotFormatted(view.tablesNotFormatted);
  }, [view.tablesNotFormatted]);
  let refreshOwnFilters = React.useCallback(
    (sheetId?: Dynamic) =>
      store.dispatch({
        kind: 'ownFiltersRefreshed',
        sheetId: sheetId,
      }),
    [store],
  );
  let lookAtOwnFiltersAgain = React.useCallback(
    (sheetId?: Dynamic) =>
      store.dispatch({
        kind: 'ownFiltersLookedAtAgain',
        sheetId: sheetId,
      }),
    [store],
  );
  let askOwnFilterList = React.useCallback(
    (tableKey?: Dynamic, c?: Dynamic) =>
      store.dispatch({
        kind: 'ownFilterListAsked',
        tableKey: tableKey,
        c: c,
        today: todayDate(),
      }),
    [store],
  );
  let isFilterListLeftByPressRef = React.useRef(false);
  let clearFilterListLeftByPress = React.useCallback(() => {
    isFilterListLeftByPressRef.current = false;
  }, []);
  let [filterListOpener, setFilterListOpener] = React.useState(null);
  let filterListOpenerElement = filterListOpener?.opener ?? null;
  let onFilterButtonPressed = React.useCallback(
    ({ tableKey: tableKey, r: r2, c: c, isOfFoundTable: isOfFoundTable, isListOpen: isListOpen }: Dynamic) => {
      if (isListOpen && store.getView().ownFilterList !== null) return shutOwnFilterList();
      setFilterListOpener(null);
      if (!isOfFoundTable) return askOwnFilterList(tableKey, c);
      if (store.getView().rowsAskedFor !== null) onMenuOpenChange('sort', false, null);
      return isListOpen
        ? undefined
        : onMenuOpenChange('sort', true, null, {
            r: r2,
            c: c,
          });
    },
    [store, askOwnFilterList, shutOwnFilterList, onMenuOpenChange],
  );
  let openFilterListAt = React.useCallback(
    (tableKey?: Dynamic, c?: Dynamic, opener?: Dynamic) => {
      let chip = opener?.closest('li') ?? null;
      let { ownFilterList: ownFilterList } = store.getView();
      if (chip !== null && ownFilterList?.tableKey === tableKey && ownFilterList.c === c) return shutOwnFilterList();
      isFilterListLeftByPressRef.current = false;
      let rect = (chip ?? opener ?? cellsRef.current)?.getBoundingClientRect() ?? new (DOMRect as Dynamic)();
      setFilterListOpener({
        opener: opener,
        isChip: chip !== null,
        anchor: {
          getBoundingClientRect: () => rect,
        },
        tableKey: tableKey,
        c: c,
      });
      if (store.getView().mode.kind === 'editing')
        store.dispatch({
          kind: 'entryLeft',
        });
      askOwnFilterList(tableKey, c);
      store.lookOnceEventsAreFinished(() => {
        if (store.getView().ownFilterList === null) setFilterListOpener(null);
      });
    },
    [store, askOwnFilterList, shutOwnFilterList],
  );
  let onFilterListAct = React.useCallback(
    (act?: Dynamic) => {
      if (act.kind === 'take') {
        lastProgrammaticActMsRef.current = performance.now();
        clicksSinceCaretMovedRef.current = 0;
      }
      store.dispatch({
        kind: 'ownFilterListActedIn',
        act: act,
      });
    },
    [store],
  );
  let chooseFilterListSort = React.useCallback(
    (direction?: Dynamic) => {
      lastProgrammaticActMsRef.current = performance.now();
      clicksSinceCaretMovedRef.current = 0;
      store.dispatch({
        kind: 'ownFilterListSortChosen',
        direction: direction,
        ...(likelyHasKeyboard()
          ? {}
          : {
              isWithNoKeyboard: true,
            }),
      });
    },
    [store],
  );
  let forgetClosedFilterListOpener = React.useCallback(() => {
    if (store.getView().ownFilterList === null) setFilterListOpener(null);
  }, [store]);
  let whatHasCaretAfterFilterList2 = React.useCallback(() => {
    let { rowsAskedFor: rowsAskedFor2, ownFilterList: ownFilterList } = store.getView();
    return whatHasCaretAfterFilterList({
      opener: filterListOpenerElement?.isConnected === true ? filterListOpenerElement : null,
      isOtherCardOpen: rowsAskedFor2 !== null || ownFilterList !== null,
      isLeftByPress: isFilterListLeftByPressRef.current,
      otherwise: whatHasCaretAfterLayer,
    });
  }, [store, filterListOpenerElement, whatHasCaretAfterLayer]);
  let chooseFigure = React.useCallback(
    (figure?: Dynamic) =>
      store.dispatch({
        kind: 'figureChosen',
        figure: figure,
      }),
    [store],
  );
  let onPartKeyDown = React.useCallback(
    (event?: Dynamic, part?: Dynamic, layer?: Dynamic, cellsTarget: Dynamic = null) => {
      let key = normalizedKeyEvent(event);
      let isInLayer = isKeyForLayer(event, layer);
      if (key.key === 'F6' && !key.isAltHeld && (key.isRepeat || isInLayer)) event.preventDefault();
      let focusMove = isInLayer ? null : focusMoveOfKey(key);
      if (focusMove === null) return;
      if (focusMove === 'cells')
        (cellsTarget ?? getTypingTargetElement())?.focus({
          preventScroll: true,
        });
      else if (!moveCaretTo(part, focusMove === 'nextPart' ? 1 : -1)) return;
      if (focusMove !== 'cells' || !store.getView().isCommentModeOn) event.preventDefault();
      if (part === 'formatTools' && focusMove === 'cells')
        store.dispatch({
          kind: 'contextBarLeftByKey',
        });
    },
    [store, moveCaretTo, isKeyForLayer, getTypingTargetElement],
  );
  let onToolsKeyDownForCells = React.useCallback(
    (event?: Dynamic, layer?: Dynamic, actKind?: Dynamic, isFromInputAllowed: Dynamic = false) => {
      let isInInput = event.target instanceof HTMLInputElement && !isFromInputAllowed;
      if (event.defaultPrevented || isInInput || isKeyForLayer(event, layer)) return;
      let key = normalizedKeyEvent(event);
      let keyActKind = keyActOf(store.getView().mode, key, null, 'leaves')?.kind;
      if (keyActKind === undefined || (keyActKind !== 'undoOrRedo' && keyActKind !== actKind)) return;
      event.preventDefault();
      store.dispatch({
        kind: 'keyPressed',
        ...key,
      });
    },
    [store, isKeyForLayer],
  );
  let returnFocusIfOnBody = React.useCallback(() => {
    let active = cellsRef.current?.ownerDocument.activeElement ?? null;
    if (active === active?.ownerDocument.body) focusCaret();
  }, [focusCaret]);
  let watchCaretLeaving = React.useCallback(() => {
    let timesBefore = focusTrackerRef.current?.timesCaretLeft();
    return () => focusTrackerRef.current?.timesCaretLeft() !== timesBefore;
  }, []);
  let askPersonActions2 = React.useCallback(() => {
    let hasCaretLeft = watchCaretLeaving();
    store.onceEventsAreFinished(() => {
      if (hasCaretLeft()) return;
      askPersonActions(store.getView().mode).forEach((input?: Dynamic) => store.dispatch(input));
    });
  }, [store, watchCaretLeaving]);
  let returnFocusToEntry = React.useCallback(() => {
    let { mode: mode2 } = store.getView();
    if (mode2.kind !== 'editing') return;
    let entryElement = (mode2.typingIn === 'cell' ? activeEditorRef : formulaBarRef).current;
    let active = entryElement?.ownerDocument.activeElement ?? null;
    if (active === entryElement) return;
    if (isPageLeftWithoutPointer()) {
      isEditKeptOnBlurRef.current = true;
      if (functionsButtonRef.current?.contains(active) === true) blurQuietly(active);
      return;
    }
    isFocusingFieldRef.current = true;
    try {
      entryElement?.focus({
        preventScroll: true,
      });
    } finally {
      isFocusingFieldRef.current = false;
    }
  }, [store, isPageLeftWithoutPointer, blurQuietly]);
  let askAllFunctions = React.useCallback(
    (
      { detail: detail }: Dynamic = {
        detail: 0,
      },
    ) => {
      if (detail > 1) return;
      let hasCaretLeft = watchCaretLeaving();
      store.onceEventsAreFinished(() => {
        if (hasCaretLeft()) return;
        let { mode: mode2 } = store.getView();
        if (mode2.kind === 'editing' && !isFormulaText(mode2.text))
          store.dispatch({
            kind: 'entryLeft',
          });
        store.dispatch({
          kind: 'allFunctionsAskedFor',
        });
        store.lookOnceEventsAreFinished(() => {
          if (hasCaretLeft()) return;
          ReactDOM.flushSync(() => {
            return;
          });
          returnFocusToEntry();
        });
      });
    },
    [store, returnFocusToEntry, watchCaretLeaving],
  );
  let tabIntoFormulaBar = React.useCallback((event?: Dynamic, part?: Dynamic) => {
    let isTowardFormulaBar = event.shiftKey === (part === 'viewTools');
    if (event.defaultPrevented || event.key !== 'Tab' || !isTowardFormulaBar) return;
    if (hasShortcutModifier(event)) return;
    if (part === 'viewTools' && event.target !== viewToolsRef.current?.querySelector('button')) return;
    let formulaBar = formulaBarRef.current;
    if (formulaBar === null) return;
    isFocusMovingByCodeRef.current = true;
    formulaBar.setSelectionRange(0, formulaBar.value.length);
    formulaBar.focus({
      preventScroll: true,
    });
    isFocusMovingByCodeRef.current = false;
    if (formulaBar !== formulaBar.ownerDocument.activeElement) return;
    event.preventDefault();
    formulaRowRef.current?.querySelector('.sheet-formula-sign')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, []);
  let onFunctionsButtonKeyDown = React.useCallback(
    (input?: Dynamic) => {
      tabIntoFormulaBar(input, 'functionsButton');
      onPartKeyDown(input, 'functionsButton', null);
    },
    [onPartKeyDown, tabIntoFormulaBar],
  );
  let onFunctionListKeyDown = React.useCallback(
    (event?: Dynamic) => {
      if (event.key !== 'Escape' || store.getView().functionList === null) return;
      event.preventDefault();
      event.stopPropagation();
      store.dispatch({
        kind: 'functionListShut',
      });
      returnFocusToEntry();
    },
    [store, returnFocusToEntry],
  );
  let onFormatToolsKeyDown = React.useCallback((input?: Dynamic) => onPartKeyDown(input, 'formatTools', null), [onPartKeyDown]);
  let onUndoOfTurnKeyDown = React.useCallback((input?: Dynamic) => onPartKeyDown(input, 'undoOfTurn', null), [onPartKeyDown]);
  let onToolbarKeyDown = React.useCallback(
    (input?: Dynamic) => {
      onPartKeyDown(input, 'formatTools', 'ofToolbar');
      let isFormatOfSelectionShown = store.getView().formatOfSelection !== null;
      onToolsKeyDownForCells(input, 'ofToolbar', isFormatOfSelectionShown ? 'formatCells' : null);
      if (!input.defaultPrevented && !isKeyForLayer(input, 'ofToolbar'))
        openLinkFromKey(input, normalizedKeyEvent(input), store.getView(), linkOpener, false);
    },
    [onPartKeyDown, onToolsKeyDownForCells, isKeyForLayer, store, linkOpener],
  );
  let onSheetsTabsKeyDown = React.useCallback(
    (input?: Dynamic) => {
      onPartKeyDown(input, 'sheets', 'ofSheets');
      onToolsKeyDownForCells(input, 'ofSheets', null);
    },
    [onPartKeyDown, onToolsKeyDownForCells],
  );
  let onSheetsBarKeyDown = React.useCallback(
    (input?: Dynamic) => {
      onPartKeyDown(input, 'sheets', null);
      onToolsKeyDownForCells(input, null, null);
    },
    [onPartKeyDown, onToolsKeyDownForCells],
  );
  let onOwnFilterBarKeyDown = React.useCallback(
    (input?: Dynamic) => {
      onPartKeyDown(input, 'ownFilterBar', null);
      onToolsKeyDownForCells(input, null, null);
    },
    [onPartKeyDown, onToolsKeyDownForCells],
  );
  let onFiguresKeyDown = React.useCallback(
    (input?: Dynamic) => {
      onPartKeyDown(input, 'sheets', 'ofFigures');
      onToolsKeyDownForCells(input, 'ofFigures', null);
    },
    [onPartKeyDown, onToolsKeyDownForCells],
  );
  let onSidePaneKeyDown = React.useCallback(
    (event?: Dynamic) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      let isToCells = focusMoveOfKey(normalizedKeyEvent(event)) === 'cells' && !isKeyForLayer(event, null);
      let { conditionalFormats: conditionalFormats2, isCommentModeOn: isCommentModeOn } = store.getView();
      if (isToCells && conditionalFormats2?.doesEscapeStepBack === true) {
        if (!isCommentModeOn) event.preventDefault();
        return store.dispatch({
          kind: 'conditionalFormatsActedIn',
          act: {
            kind: 'stepBack',
          },
        });
      }
      onPartKeyDown(event, 'sidePane', null, getLastFocusedByKey());
      let isNothingTyped = !store.getView().isSomethingTypedInSidePane;
      if (isToCells && isNothingTyped) return shutSidePane();
      if (isToCells)
        getTypingTargetElement()?.focus({
          preventScroll: true,
        });
      if (isNothingTyped) onToolsKeyDownForCells(event, null, null, true);
      return;
    },
    [store, onPartKeyDown, onToolsKeyDownForCells, isKeyForLayer, shutSidePane, getLastFocusedByKey, getTypingTargetElement],
  );
  let onViewToolsKeyDown = React.useCallback(
    (input?: Dynamic) => {
      tabIntoFormulaBar(input, 'viewTools');
      onPartKeyDown(input, viewToolsRef.current === null ? 'sheets' : 'viewTools', 'ofZoom');
      if (!isAltShortcutKey(input)) onToolsKeyDownForCells(input, 'ofZoom', 'showOrHideFormulas');
    },
    [onPartKeyDown, onToolsKeyDownForCells, tabIntoFormulaBar],
  );
  let chooseCellFormat = React.useCallback(
    (choice?: Dynamic) => {
      if ('patternToType' in choice) leaveEntryIfEditing();
      else if (isFormatChoiceKeepingEntrySelection(choice)) leaveEntryKeepingSelection();
      if ('toggle' in choice) giveEntryBoxToFormat(store, entryFieldRefs);
      if ('list' in choice) giveEntryBoxOfItsOwn(store, entryFieldRefs);
      store.dispatch({
        kind: 'cellFormatChosen',
        choice: choice,
        chosenIn: 'toolbar',
        ...caretInEntryPatch(store.getView().mode, entryFieldRefs),
      });
      returnFocusIfOnBody();
    },
    [store, entryFieldRefs, leaveEntryIfEditing, leaveEntryKeepingSelection, returnFocusIfOnBody],
  );
  let chooseCellFormatAtFoot = React.useCallback(
    (choice?: Dynamic) => {
      chooseCellFormat(choice);
    },
    [chooseCellFormat],
  );
  let askSheetMenu = React.useCallback(
    (button?: Dynamic, isByKey?: Dynamic) => {
      leaveEntryIfEditing();
      askContextBarMenu(button, isByKey);
    },
    [leaveEntryIfEditing, askContextBarMenu],
  );
  let insertCellControl2 = React.useCallback(
    (control?: Dynamic) =>
      insertCellControl(control, {
        onFormatChosen: chooseCellFormat,
        onPersonChosen: askPersonActions2,
      }),
    [chooseCellFormat, askPersonActions2],
  );
  let askConditionalFormats = React.useCallback(
    (by?: Dynamic) => {
      if (by === 'menu') {
        contextBarMenuOpenedByRef.current = null;
        return contextBarMenuHandlers2().onRulesAskedByRow('toolbar', false);
      }
      store.dispatch({
        kind: 'conditionalFormatsAsked',
        by: by,
      });
    },
    [store, contextBarMenuHandlers2],
  );
  let askSortPaneFromToolbar = React.useCallback(
    (of?: Dynamic) => {
      askSortPane(of);
    },
    [askSortPane],
  );
  let { conditionalFormats: conditionalFormats } = view;
  let conditionalFormatsInMenu = conditionalFormats?.drawnAs === 'menu' ? conditionalFormats : null;
  let suggestRulesInMenu = React.useCallback(() => {
    if (menuAt !== null)
      store.dispatch({
        kind: 'rulesSuggestedInMenu',
        menuAt: menuAt,
      });
  }, [store, menuAt]);
  let onConditionalFormatsActFromCard = React.useCallback(
    (act?: Dynamic) => {
      onConditionalFormatsAct(act);
    },
    [onConditionalFormatsAct],
  );
  let askForCommands = React.useCallback(
    (words?: Dynamic, options?: Dynamic, signal?: Dynamic) => {
      menuAtBeforeCloseRef.current = store.getView().menu?.at ?? null;
      let answer = store.askForCommands(words, options, signal);
      pendingBlurRef.current = answer;
      let forgetAnswer = () => {
        if (pendingBlurRef.current === answer) pendingBlurRef.current = null;
      };
      answer.then(forgetAnswer, forgetAnswer);
      signal.addEventListener('abort', forgetAnswer, {
        once: true,
      });
      if (signal.aborted) forgetAnswer();
      return answer;
    },
    [store],
  );
  let askRuleInMenu = React.useCallback(
    (words?: Dynamic) => {
      let menuAt2 = menuAtBeforeCloseRef.current;
      if (menuAt2 !== null)
        store.dispatch({
          kind: 'ruleAskedInMenu',
          words: words,
          menuAt: menuAt2,
        });
    },
    [store],
  );
  let letGoOfRuleInMenu = React.useCallback(() => {
    store.dispatch({
      kind: 'ruleInMenuLetGo',
    });
    suggestRulesInMenu();
  }, [store, suggestRulesInMenu]);
  let pointAtRuleSuggestion = React.useCallback(
    (rules?: Dynamic) =>
      onConditionalFormatsAct({
        kind: 'pointAtSuggestion',
        rules: rules,
      }),
    [onConditionalFormatsAct],
  );
  let takeRuleSuggestion = React.useCallback(
    (rules?: Dynamic) =>
      onConditionalFormatsAct({
        kind: 'takeSuggestion',
        rules: rules,
      }),
    [onConditionalFormatsAct],
  );
  let startOrShowRules = React.useCallback(
    (choice?: Dynamic) =>
      onConditionalFormatsAct({
        kind: choice === 'newRule' ? 'startRule' : 'showInPane',
      }),
    [onConditionalFormatsAct],
  );
  let keepRulesOffer = React.useCallback(
    () =>
      onConditionalFormatsAct({
        kind: 'keepOffer',
      }),
    [onConditionalFormatsAct],
  );
  let stepBackInRules = React.useCallback(
    () =>
      onConditionalFormatsAct({
        kind: 'stepBack',
      }),
    [onConditionalFormatsAct],
  );
  let chooseBorders = React.useCallback(
    (choice?: Dynamic, pen?: Dynamic) =>
      store.dispatch({
        kind: 'bordersChosen',
        choice: choice,
        ...(pen !== undefined && {
          pen: pen,
        }),
      }),
    [store],
  );
  let chooseMergeChange = React.useCallback(
    (change?: Dynamic) => {
      leaveEntryIfEditing();
      store.dispatch({
        kind: 'mergeChangeChosenInToolbar',
        change: change,
      });
      returnFocusIfOnBody();
    },
    [store, leaveEntryIfEditing, returnFocusIfOnBody],
  );
  let setCheckboxesInToolbar = React.useCallback(
    (isChecking?: Dynamic) => {
      leaveEntryIfEditing();
      store.dispatch({
        kind: 'checkboxesSetInToolbar',
        isChecking: isChecking,
      });
      returnFocusIfOnBody();
    },
    [store, leaveEntryIfEditing, returnFocusIfOnBody],
  );
  let chooseSheetChangeInToolbar = React.useCallback(
    (change?: Dynamic) => {
      leaveEntryIfEditing();
      store.dispatch({
        kind: 'sheetChangeChosen',
        change: change,
        chosenIn: 'toolbar',
        ...(likelyHasKeyboard()
          ? {}
          : {
              isWithNoKeyboard: true,
            }),
      });
      returnFocusIfOnBody();
    },
    [store, leaveEntryIfEditing, returnFocusIfOnBody],
  );
  let actOnRowsAskedFor = React.useCallback(
    (act?: Dynamic) => {
      if (act.kind !== 'take' && act.kind !== 'takeAnswer')
        return store.dispatch({
          kind: 'rowsAskedForActedOn',
          act: act,
        });
      store.dispatch({
        kind: 'rowsAskedForActedOn',
        act: likelyHasKeyboard()
          ? act
          : {
              ...act,
              isWithNoKeyboard: true,
            },
      });
      return returnFocusIfOnBody();
    },
    [store, returnFocusIfOnBody],
  );
  let askCustomSort = React.useCallback(() => {
    let of = store.getView().areWholeColumnsSelected ? 'sheet' : 'range';
    store.dispatch({
      kind: 'rowsAskedForActedOn',
      act: {
        kind: 'customSort',
        of: of,
      },
    });
  }, [store]);
  let chooseFigureInToolbar = React.useCallback(
    (figure?: Dynamic) => {
      leaveEntryIfEditing();
      store.dispatch({
        kind: 'figureChosen',
        figure: figure,
        chosenIn: 'toolbar',
      });
      returnFocusIfOnBody();
    },
    [store, leaveEntryIfEditing, returnFocusIfOnBody],
  );
  let toggleSidePane = React.useCallback(() => {
    store.dispatch({
      kind: 'sidePaneToggled',
    });
  }, [store]);
  let changeBorderPen = React.useCallback(
    (change?: Dynamic) =>
      store.dispatch({
        kind: 'borderPenChanged',
        change: change,
      }),
    [store],
  );
  let toggleGridlines2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'gridlinesToggled',
      }),
    [store],
  );
  let chooseCellFormatInMenu = React.useCallback(
    (choice?: Dynamic) =>
      store.dispatch({
        kind: 'cellFormatChosen',
        choice: choice,
        chosenIn: 'menu',
      }),
    [store],
  );
  let insertCellControlFromMenu = React.useCallback(
    (control?: Dynamic) =>
      insertCellControl(control, {
        onToolUsed: () => {},
        onFormatChosen: chooseCellFormatInMenu,
        onPersonChosen: askPersonActions2,
      }),
    [chooseCellFormatInMenu, askPersonActions2],
  );
  let choosePeopleListRow = React.useCallback(
    (row?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      lastProgrammaticActMsRef.current = performance.now();
      store.dispatch({
        kind: 'peopleListRowChosen',
        row: row,
      });
    },
    [store],
  );
  let pressWordsOffered = React.useCallback(
    ({ cellId: cellId, typed: typed, offered: offered }: Dynamic, pressedAt?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      lastProgrammaticActMsRef.current = pressedAt;
      store.dispatch({
        kind: 'wordsOfferedPressed',
        cellId: cellId,
        typed: typed,
        offered: offered,
      });
    },
    [store],
  );
  let askCardByRestingPointer = React.useCallback(
    (ofRow?: Dynamic) =>
      store.dispatch({
        kind: 'cardAskedByRestingPointer',
        ofRow: ofRow,
      }),
    [store],
  );
  let askCardOfOption = React.useCallback(
    (optionId?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      store.dispatch({
        kind: 'cardOfOptionAsked',
        optionId: optionId,
      });
    },
    [store],
  );
  let nameOptionsInList = React.useCallback(
    (naming?: Dynamic, onDone?: Dynamic) =>
      dispatchThenNoteChange(
        {
          kind: 'optionsNamedInList',
          ...naming,
        },
        () => onDone(store.getView().dropdownList),
      ),
    [dispatchThenNoteChange, store],
  );
  let stopNamingNewOption = React.useCallback(
    () =>
      store.dispatch({
        kind: 'newOptionNoLongerNamed',
      }),
    [store],
  );
  let moveOptionInList = React.useCallback(
    (move?: Dynamic, onDone?: Dynamic) =>
      dispatchThenNoteChange(
        {
          kind: 'optionMovedInList',
          ...move,
        },
        onDone,
      ),
    [dispatchThenNoteChange],
  );
  let focusKeptOnListRowRef = React.useRef(null);
  let giveCaretBackToCells = React.useCallback(
    () =>
      getTypingTargetElement()?.focus({
        preventScroll: true,
      }),
    [getTypingTargetElement],
  );
  let isAnythingOpenUnderCell = view.openUnderCell !== null;
  React.useLayoutEffect(() => {
    let row = focusKeptOnListRowRef.current;
    if (row === null || (row.isConnected && isAnythingOpenUnderCell)) return;
    focusKeptOnListRowRef.current = null;
    let { activeElement: activeElement, body: body } = row.ownerDocument;
    let caretTarget = activeElement === row || activeElement === body ? whatHasCaretAfter() : false;
    if (caretTarget !== false)
      caretTarget.focus({
        preventScroll: true,
      });
  });
  let chooseCardRow = React.useCallback(
    (row?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      lastProgrammaticActMsRef.current = performance.now();
      store.dispatch({
        kind: 'cardRowChosen',
        row: row,
      });
    },
    [store],
  );
  let shutCard = React.useCallback(
    () =>
      store.dispatch({
        kind: 'cardShut',
      }),
    [store],
  );
  let onPeopleListBlur = React.useCallback(
    (event?: Dynamic) => {
      if (event.target instanceof Node && cellsRef.current?.contains(event.target) === true) return;
      if (event.target === formulaBarRef.current) return;
      clicksSinceCaretMovedRef.current = 0;
      store.dispatch({
        kind: 'peopleListShut',
      });
    },
    [store],
  );
  let chooseTimeListRow = React.useCallback(
    (row?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      lastProgrammaticActMsRef.current = performance.now();
      store.dispatch({
        kind: 'timeListRowChosen',
        row: row,
      });
    },
    [store],
  );
  let pointAtTimeListRow = React.useCallback(
    (row?: Dynamic) =>
      store.dispatch({
        kind: 'timeListRowPointedAt',
        row: row,
      }),
    [store],
  );
  let onTimeListBlur = React.useCallback(
    (event?: Dynamic) => {
      clicksSinceCaretMovedRef.current = 0;
      if (!(event.target instanceof Node && cellsRef.current?.contains(event.target) === true))
        store.dispatch({
          kind: 'timeListShut',
        });
    },
    [store],
  );
  let dispatchFromEntryHelper = React.useCallback(
    (event?: Dynamic) => {
      if (
        event.kind === 'functionListRowChosen' ||
        event.kind === 'formulaOfferRowChosen' ||
        event.kind === 'wordsOfFormulaAskedBack' ||
        event.kind === 'formulaOfAgentKept' ||
        event.kind === 'formulaAskStopped'
      ) {
        clicksSinceCaretMovedRef.current = 0;
        lastProgrammaticActMsRef.current = performance.now();
      }
      if (!(event.kind === 'entryCaretMoved' && !isFormulaText(event.text) && store.getView().grid.editorLooks === undefined)) store.dispatch(event);
    },
    [store],
  );
  let caretInEntryNow = React.useCallback(() => caretInEntryPatch(store.getView().mode, entryFieldRefs), [store, entryFieldRefs]);
  let isSheetPointingBlockedRef = React.useRef(false);
  let canSwitchSheet = React.useCallback(
    (sheetId?: Dynamic) => {
      let view2 = store.getView();
      let { mode: mode2, listedSheets: listedSheets, sheetPointedIn: sheetPointedIn, viewOnlyBecause: viewOnlyBecause } = view2;
      let sheet = listedSheets.find((input?: Dynamic) => input.sheetId === sheetId);
      if (sheetPointedIn === null && sheet?.isShown === true) return false;
      return canSwitchSheetWhileEditing(
        mode2,
        caretInEntryNow().caretInEntry,
        sheet?.holdsOpenEntry === true,
        viewOnlyBecause === null && !isSheetPointingBlockedRef.current && !isFormulaAskedOrProposed(view2),
      );
    },
    [store, caretInEntryNow],
  );
  let lookOnceEventsAreFinished = React.useCallback((input?: Dynamic) => store.lookOnceEventsAreFinished(input), [store]);
  let dispatchFromSheetTabs = React.useCallback(
    (event?: Dynamic) => {
      let isNameLeftWhileUnderWay = event.kind === 'sheetNameLeft' && focusTrackerRef.current?.isUnderWay() === true;
      let pointingPatch = isSheetPointingBlockedRef.current
        ? {
            canPoint: false,
          }
        : {};
      let eventToSend =
        event.kind === 'sheetChosen'
          ? {
              ...event,
              ...caretInEntryNow(),
              ...pointingPatch,
            }
          : event;
      store.dispatch(
        isNameLeftWhileUnderWay
          ? {
              kind: 'sheetNameLeft',
            }
          : eventToSend,
      );
      if (event.kind === 'sheetListShut' || event.kind === 'sheetListOpened') return;
      store.onceEventsAreFinished(() => {
        let formulaBar = formulaBarRef.current;
        if (formulaBar !== null && formulaBar === formulaBar.ownerDocument.activeElement && store.getView().mode.kind === 'navigating') focusCaret();
      });
      if ((event.kind === 'sheetChosen' || event.kind === 'sheetAddChosen') && cellsRef.current?.ownerDocument.hasFocus() === false) {
        cellsRef.current.ownerDocument.defaultView?.focus();
        getTypingTargetElement()?.focus({
          preventScroll: true,
        });
      }
    },
    [store, getTypingTargetElement, caretInEntryNow, focusCaret],
  );
  let closeToastIfFocusLeft = () => {
    let active = cellsRef.current?.ownerDocument.activeElement;
    if (isFocusOutsideSearchOrErrors(active)) refocusTypingTarget();
  };
  let closeToastIfInsideUnpinned = () => {
    let doc = cellsRef.current?.ownerDocument;
    if (doc?.hasFocus() === true && isInsideUnpinnedToast(doc.activeElement)) refocusTypingTarget();
  };
  let dispatchFileImport = React.useCallback(
    (event?: Dynamic) => {
      for (let eventBefore of EVENTS_BEFORE_FILE_IMPORT as Dynamic) store.dispatch(eventBefore);
      store.dispatch(event);
    },
    [store],
  );
  let importFilePicker = useImportFilePicker({
    mostBytes: view.mostBytesOfAFileToImport,
    dispatch: dispatchFileImport,
  });
  let { choose: chooseFileToImport, takeDropped: takeDroppedFile, forget: forgetFileToImport } = importFilePicker;
  let dropImport = React.useCallback(() => {
    forgetFileToImport();
    store.dispatch({
      kind: 'importDropped',
    });
  }, [store, forgetFileToImport]);
  let escapeImport2 = React.useCallback(
    (isWishTyped?: Dynamic) => {
      let isNoImport = store.getView().importOfAFile === null;
      store.dispatch({
        kind: 'importEscaped',
        ...(isWishTyped && {
          isWishTyped: isWishTyped,
        }),
      });
      if (isNoImport) return forgetFileToImport();
      store.onceEventsAreFinished(() => {
        if (store.getView().importOfAFile === null) forgetFileToImport();
      });
    },
    [store, forgetFileToImport],
  );
  let keepImport2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'importKept',
      }),
    [store],
  );
  let canImportFile = view.viewOnlyBecause === null && importFileChoices.length > 0;
  React.useEffect(() => {
    if (!canImportFile) return;
    shell.offerImport((isByKey?: Dynamic) => {
      if (isModalOpen(store.getView())) return;
      scrollGesture.begin();
      dispatchFileImport({
        kind: 'importAskedByHost',
        isByKey: isByKey,
      });
    });
    return () => shell.offerImport(null);
  }, [shell, store, dispatchFileImport, canImportFile, scrollGesture]);
  let chooseImportFile = React.useCallback(
    (choices?: Dynamic) => {
      if (store.getView().mode.kind !== 'editing') chooseFileToImport(choices);
    },
    [store, chooseFileToImport],
  );
  let chooseImportFileOfAnyKind = React.useCallback(() => chooseImportFile(importFileChoices), [chooseImportFile]);
  let isChatToBeHad = React.useSyncExternalStore(chatWithAgent.subscribe, chatWithAgent.isToBeHad, chatWithAgent.isToBeHad);
  let doesChatTakeWordsAtOnce = React.useSyncExternalStore(
    chatWithAgent.subscribe,
    chatWithAgent.takesWordsAtOnce,
    chatWithAgent.takesWordsAtOnce,
  );
  let cellsAddedToChat = React.useMemo(() => trackCellsAddedToChat(chatWithAgent), [chatWithAgent]);
  let askForRulesInChat = React.useCallback(
    (words?: Dynamic) => (
      (lastProgrammaticActMsRef.current = performance.now()),
      askAgentForRulesInChat(store, cellsAddedToChat, words).then((isAsked?: Dynamic) => {
        let conditionalFormats = store.getView().conditionalFormats;
        if (isAsked && conditionalFormats?.drawnAs === 'card' && conditionalFormats.isAskBeyondRules)
          store.dispatch({
            kind: 'contextBarMenuChanged',
            menu: 'conditionalFormatting',
            isOpen: false,
          });
        return isAsked;
      })
    ),
    [store, cellsAddedToChat],
  );
  let newestChatPressCount = React.useSyncExternalStore(
    cellsAddedToChat.subscribe,
    cellsAddedToChat.newestThatTellsPress,
    cellsAddedToChat.newestThatTellsPress,
  );
  React.useEffect(() => {
    if (newestChatPressCount > 0) observeToasts();
  }, [newestChatPressCount]);
  let selectedPlacementId = view.grid.placedViews.find(({ isSelected: isSelected }: Dynamic) => isSelected)?.placementId;
  let selectedPlacementIdOnPhone = isOnPhoneHere ? selectedPlacementId : undefined;
  let { areWaysInToComeSoon: areWaysInToComeSoon2 } = view;
  React.useEffect(() => {
    let win = cellsRef.current?.ownerDocument.defaultView ?? null;
    if (win === null || areWaysInToComeSoon2) return;
    let lookAtChat = () => void chatWithAgent.look();
    lookAtChat();
    win.addEventListener('focus', lookAtChat);
    return () => win.removeEventListener('focus', lookAtChat);
  }, [chatWithAgent, areWaysInToComeSoon2]);
  let { isAgentOfferedAmongWaysIn: isAgentOfferedAmongWaysIn } = view;
  let isMenuOpen = view.menu !== null;
  let isRuleEditorOpen = view.conditionalFormats !== null && view.conditionalFormats.editor !== null;
  let isChartMenuOpen = view.contextBarMenu === 'chart';
  let isPeopleListOpen = view.peopleList !== null;
  React.useEffect(() => {
    if (
      (isAgentOfferedAmongWaysIn ||
        selectedPlacementId !== undefined ||
        isMenuOpen ||
        isChartMenuOpen ||
        isRuleEditorOpen ||
        (isPeopleListOpen && !chatWithAgent.isKeptFromLeaving())) &&
      !areWaysInToComeSoon2
    )
      chatWithAgent.look();
  }, [
    chatWithAgent,
    isAgentOfferedAmongWaysIn,
    selectedPlacementId,
    isMenuOpen,
    isChartMenuOpen,
    isRuleEditorOpen,
    isPeopleListOpen,
    areWaysInToComeSoon2,
  ]);
  let askAgentToFixAfterEdit = React.useCallback(
    () => askAgentToFixOfferedErrors(store, cellsAddedToChat, 'afterEdit'),
    [store, cellsAddedToChat],
  );
  let areErrorsOffered = view.errorsOffered !== null || view.errorsAtOpening !== null;
  React.useEffect(() => {
    if (areErrorsOffered && !areWaysInToComeSoon2) chatWithAgent.look();
  }, [chatWithAgent, areErrorsOffered, areWaysInToComeSoon2]);
  let putAwayErrorsOffer2 = React.useCallback(
    () =>
      store.dispatch({
        kind: 'errorsOfferPutAway',
      }),
    [store],
  );
  let [pressForFixesTracker] = React.useState(createPressForFixesTracker);
  React.useEffect(() => pressForFixesTracker.forget, [pressForFixesTracker]);
  let onFixesAct = React.useCallback(
    (act?: Dynamic, options?: Dynamic) => {
      if (act !== 'asked')
        return store.dispatch({
          kind: act === 'kept' ? 'fixesKept' : 'fixesEnded',
          ...options,
        });
      if (store.isEventUnfinished()) return;
      pressForFixesTracker.note(cellsRef.current?.ownerDocument.defaultView ?? null);
      return store.dispatch({
        kind: 'fixesInPlaceAsked',
      });
    },
    [store, pressForFixesTracker],
  );
  let returnFocusAfterErrorsNotice = React.useCallback(() => {
    if (cellsRef.current?.ownerDocument.hasFocus() !== true) return;
    let caretAfter = whatHasCaretAfterMenu();
    (caretAfter === false ? getTypingTargetElement() : caretAfter)?.focus({
      preventScroll: true,
    });
  }, [whatHasCaretAfterMenu, getTypingTargetElement]);
  let onErrorsNoticeKeyDown = React.useCallback(
    (event?: Dynamic) => {
      if ((event.ctrlKey || event.metaKey || event.altKey) && event.key === 'Escape') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        returnFocusAfterErrorsNotice();
        return putAwayErrorsOffer2();
      }
      onPartKeyDown(event, 'errorsNotice', null);
      return onToolsKeyDownForCells(event, null, null);
    },
    [onPartKeyDown, onToolsKeyDownForCells, putAwayErrorsOffer2, returnFocusAfterErrorsNotice],
  );
  let shownSheetNumber = React.useCallback(
    () => store.getView().listedSheets.findIndex(({ isShown: isShown }: Dynamic) => isShown) + 1,
    [store],
  );
  let openChatAboutBlankSheet = React.useCallback(
    () => void chatWithAgent.openAboutBlankSheet(sheetMessages.blankSheet(), shownSheetNumber()),
    [chatWithAgent, shownSheetNumber],
  );
  let [chartMaking, setChartMaking] = React.useState(null);
  let openChatAboutChart = React.useCallback(
    (chart?: Dynamic) => {
      setChartMaking(dropAddedChartMaking);
      chatWithAgent.openAboutChart(chartMessages.chart(), chart, shownSheetNumber());
    },
    [chatWithAgent, shownSheetNumber],
  );
  let onChartMadeLastOvertaken = React.useCallback(() => {
    setChartMaking(dropAddedChartMaking);
    if (isTouchBelowSm() || store.getView().isAgentWorking) return;
  }, [store, shell]);
  let [chartChangeUndoNotice, setChartChangeUndoNotice] = React.useState(null);
  let stepOfChartChange = typeof chartChangeUndoNotice?.says === 'object' ? chartChangeUndoNotice.says.step : null;
  if (stepOfChartChange !== null && (stepOfChartChange !== view.latestStep || view.entryCellKey !== null)) setChartChangeUndoNotice(null);
  let undoChartChange = () => {
    if (stepOfChartChange !== null)
      store.dispatch({
        kind: 'undoOfStepAsked',
        step: stepOfChartChange,
      });
  };
  let renderSettledWordsAnnouncer = React.useCallback(
    (words?: Dynamic, about?: Dynamic) =>
      jsx(SettledWordsAnnouncer, {
        words: words,
        about: about,
        store: store,
        inPageOf: cellsRef,
      }),
    [store],
  );
  let sendToChatAboutChart = React.useCallback(
    (method?: Dynamic, chart?: Dynamic, options?: Dynamic) =>
      store.isEventUnfinished() || store.getView().hasUnsavedEdits
        ? Promise.resolve('failed')
        : chatWithAgent[method](chartMessages.chart(), chart, shownSheetNumber(), options),
    [chatWithAgent, shownSheetNumber, store],
  );
  let sendAboutChart = React.useCallback(
    (input?: Dynamic, options?: Dynamic) => sendToChatAboutChart('sendAboutChart', input, options),
    [sendToChatAboutChart],
  );
  let sendPressAboutChart = React.useCallback(
    (input?: Dynamic, options?: Dynamic) => sendToChatAboutChart('sendPressAboutChart', input, options),
    [sendToChatAboutChart],
  );
  let lookAtChatUnlessComingSoon = React.useCallback(() => {
    if (!areWaysInToComeSoon2 && chatWithAgent.isToBeHad() !== true) chatWithAgent.look();
    return !areWaysInToComeSoon2;
  }, [chatWithAgent, areWaysInToComeSoon2]);
  let [wasChatToBeHad, setWasChatToBeHad] = React.useState(false);
  if (isChatToBeHad !== null && isChatToBeHad !== wasChatToBeHad) setWasChatToBeHad(isChatToBeHad);
  let askAgentAboutRule2 = React.useCallback(
    (rule?: Dynamic) => askAgentAboutRule(store, chatWithAgent, rule),
    [chatWithAgent, store],
  );
  let isChatToBeHadOrWas = isChatToBeHad ?? wasChatToBeHad;
  let canAskInChatAboutRules = isChatToBeHadOrWas && view.selectionByAddress !== null;
  let conditionalFormatsCard = React.useMemo(
    () =>
      conditionalFormats?.drawnAs === 'card'
        ? jsx(ConditionalAskCard, {
            pane: conditionalFormats,
            onAct: onConditionalFormatsActFromCard,
            onAskedInChat: canAskInChatAboutRules ? askForRulesInChat : null,
          })
        : null,
    [conditionalFormats, onConditionalFormatsActFromCard, canAskInChatAboutRules, askForRulesInChat],
  );
  let { errorsFoundAtOpening: errorsFoundAtOpening } = view;
  let areMoreErrorsThanKnown2 = React.useMemo(
    () =>
      errorsFoundAtOpening !== null &&
      errorsFoundAtOpening !== 'toBeRead' &&
      areMoreErrorsThanKnown(errorsFoundAtOpening.sheetId, errorsFoundAtOpening.count),
    [errorsFoundAtOpening],
  );
  let fixesStage = view.fixesOnCells?.stage ?? null;
  let fixOfferInMenu2 = fixOfferInMenu(view, {
    canPersonEdit: canPersonEdit,
    isChatToBeHad: isChatToBeHad ?? wasChatToBeHad,
  });
  let areFixesOnOffer2 = areFixesOnOffer(view.fixesOnCells);
  let isErrorsAtOpeningOffered =
    view.errorsAtOpening !== null && areMoreErrorsThanKnown2 && canPersonEdit && (isChatToBeHad === true || areFixesOnOffer2);
  let isAskingFixesAtOpeningRef = React.useRef(false);
  let askFixesOfErrorsAtOpening = async (isInPlace?: Dynamic): Promise<Dynamic> => {
    let errorsAtOpening = store.getView().errorsAtOpening;
    if (errorsAtOpening === null || isAskingFixesAtOpeningRef.current) return;
    if (isInPlace) {
      if (store.isEventUnfinished()) return;
      pressForFixesTracker.note(cellsRef.current?.ownerDocument.defaultView ?? null);
      store.dispatch({
        kind: 'fixesOfErrorsAtOpeningAsked',
      });
      store.lookOnceEventsAreFinished(() => {
        if (store.getView().errorsAtOpening?.sheetId === errorsAtOpening.sheetId) return;
        noteErrorsKnownOf(errorsAtOpening.sheetId, errorsAtOpening.count);
        whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
      });
      return;
    }
    isAskingFixesAtOpeningRef.current = true;
    try {
      if (!(await askAgentToFixOfferedErrors(store, cellsAddedToChat, 'atOpening'))) return;
      noteErrorsKnownOf(errorsAtOpening.sheetId, errorsAtOpening.count);
      whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
    } finally {
      isAskingFixesAtOpeningRef.current = false;
    }
  };
  let isAskingChatAfterNoFixRef = React.useRef(false);
  let askChatAfterNoFix2 = async (): Promise<Dynamic> => {
    if (isAskingChatAfterNoFixRef.current) return;
    isAskingChatAfterNoFixRef.current = true;
    try {
      if (await askChatAfterNoFix(store, cellsAddedToChat)) whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
    } finally {
      isAskingChatAfterNoFixRef.current = false;
    }
  };
  let askAgentAboutSelection2 = React.useCallback(
    (isByKey?: Dynamic) => void askAgentAboutSelection(cellsAddedToChat, store, isByKey),
    [cellsAddedToChat, store],
  );
  let askFixFromMenu2 = React.useCallback(() => askFixFromMenu(store, closeMenu), [store, closeMenu]);
  let askFixesOfSelectedCells = React.useCallback(() => {
    let errorsAtOpening = store.getView().errorsAtOpening;
    pressForFixesTracker.note(cellsRef.current?.ownerDocument.defaultView ?? null);
    if (!askFixesOfSelectedCellsFromMenu(store, closeMenu)) return pressForFixesTracker.forget();
    store.lookOnceEventsAreFinished(() => {
      if (errorsAtOpening !== null && store.getView().errorsAtOpening?.sheetId !== errorsAtOpening.sheetId)
        noteErrorsKnownOf(errorsAtOpening.sheetId, errorsAtOpening.count);
    });
  }, [store, closeMenu, pressForFixesTracker]);
  React.useEffect(
    () =>
      watchAgentAskedUnderAt(
        store,
        {
          isInStaffTrials: isInStaffTrials,
          chatWithAgent: chatWithAgent,
          comments: commentsOfHost,
        },
        () => askAgentAboutSelection2(false),
      ),
    [store, isInStaffTrials, chatWithAgent, commentsOfHost, askAgentAboutSelection2],
  );
  let chartMakingNow = chartMakingForView(chartMaking, view);
  if (chartMakingNow !== chartMaking) setChartMaking(chartMakingNow);
  let addedChartView = placedViewOfAddedChart(chartMaking, view);
  React.useEffect(() => {
    if (chartMaking !== null) observeToasts();
  }, [chartMaking]);
  let addedChartOnCard = addedChartForCard(chartMaking, addedChartView !== undefined, view);
  let { undoOffer: undoOffer, undoOfTurnOffered: undoOfTurnOffered } = view;
  let undoOfferShown = React.useMemo(
    () =>
      undoOfferToShow({
        undoOffer: undoOffer,
        undoOfTurnOffered: undoOfTurnOffered,
      }),
    [undoOffer, undoOfTurnOffered],
  );
  let undoOfferOnCard = React.useMemo(
    () => (addedChartOnCard === null ? undoOfferShown : undoOfferOfChartAdded(addedChartOnCard)),
    [addedChartOnCard, undoOfferShown],
  );
  let isPlainUndoOfferShown = addedChartOnCard === null && undoOfferShown?.taken === 'undoOfferTaken';
  let takeUndoOfferShown = () => {
    if (undoOfferShown !== null)
      store.dispatch({
        kind: undoOfferShown.taken,
      });
  };
  let undoAddedChart = () => {
    if (addedChartOnCard === null || addedChartOnCard.step === null) return;
    store.dispatch({
      kind: 'undoOfStepAsked',
      step: addedChartOnCard.step,
    });
    setChartMaking((input?: Dynamic) => dropChartMakingOfNth(input, addedChartOnCard.nth));
  };
  let dropChartMaking = (nth?: Dynamic, isToCloseToast?: Dynamic) => {
    setChartMaking((input?: Dynamic) => dropChartMakingOfNth(input, nth));
    if (isToCloseToast) whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
  };
  let isMakingChartRef = React.useRef(false);
  let mayTakeCaretFromBarRef = React.useRef(true);
  let chartMakingNthRef = React.useRef(0);
  let whyChartNotMadeByPageRef = React.useRef('busy');
  let makeChartByPage = React.useMemo(
    () =>
      async (chartKind?: Dynamic, words?: Dynamic, options?: Dynamic): Promise<Dynamic> => {
        let view2 = store.getView();
        if (!chartsMadeByPage.isToBeHad || view2.viewOnlyBecause !== null) return null;
        if (view2.isCommentModeOn) return null;
        if (chartKind === 'any' || words !== '') return null;
        if (options !== undefined && !view2.chartsOnOffer.some((input?: Dynamic) => input.kind === chartKind)) return null;
        let cells =
          options !== undefined &&
          (view2.selectionByAddress?.sheetNumber !== options.cells?.sheetNumber || view2.selectionByAddress?.range !== options.cells?.range)
            ? null
            : store.cellsForChartByPage();
        if (cells === null) return null;
        whyChartNotMadeByPageRef.current = 'busy';
        if (isMakingChartRef.current) return false;
        isMakingChartRef.current = true;
        mayTakeCaretFromBarRef.current = options?.mayTakeCaretFromBar ?? true;
        chartMakingNthRef.current += 1;
        let awaited = awaitedChartMaking(chartMakingNthRef.current, chartKind, view2);
        setChartMaking(awaited);
        let chartName = chartKindName(chartKind);
        let outcome = await chartsMadeByPage
          .make(
            chartKind,
            (nodeId?: Dynamic) =>
              store.askForEditOfChart({
                kind: 'add',
                nodeId: nodeId,
                name: chartName,
                cells: cells,
              }),
          )
          .finally(() => {
            isMakingChartRef.current = false;
          });
        setChartMaking((input?: Dynamic) => settleChartMaking(input, awaited, outcome));
        if (typeof outcome === 'string') whyChartNotMadeByPageRef.current = CHART_END_WORDS[outcome];
        return typeof outcome !== 'string';
      },
    [chartsMadeByPage, store],
  );
  let noteChartNotForPage = React.useCallback(() => {
    chartMakingNthRef.current += 1;
    setChartMaking({
      nth: chartMakingNthRef.current,
      is: 'notAdded',
      why: 'notForPage',
    });
  }, []);
  let [chartsOfferedFor, setChartsOfferedFor] = React.useState(null);
  let isChartsOfferAskedRef = React.useRef(false);
  let [hasEverSelected, setHasEverSelected] = React.useState(false);
  if (!hasEverSelected && view.selectionByAddress !== null) setHasEverSelected(true);
  React.useEffect(() => {
    if (!(hasEverSelected || isChartMenuOpen) || chartsWrittenByAgent === null) return;
    let isStillMounted: Dynamic = true;
    chartsWrittenByAgent
      .isToBeHad()
      .catch(() => false)
      .then((isToBeHad?: Dynamic) => (isStillMounted ? setChartsOfferedFor(isToBeHad && !isChartsOfferAskedRef.current) : undefined));
    return () => {
      isStillMounted = false;
    };
  }, [hasEverSelected, isChartMenuOpen, chartsWrittenByAgent]);
  let canAgentWriteCharts =
    chartsWrittenByAgent !== null && chartsMadeByPage.isToBeHad && view.viewOnlyBecause === null && !view.isCommentModeOn;
  let isChartWritingOffered = canAgentWriteCharts ? chartsOfferedFor : false;
  let isChartWritingOn = isChartWritingOffered === true;
  let [chartBeingWritten, setChartBeingWritten] = React.useState(null);
  let chartWritingGivenUpNthRef = React.useRef(0);
  let isChartWritingLeftSheetRef = React.useRef(false);
  let isChartBeingPlacedRef = React.useRef(false);
  let [chartAskFault, setChartAskFault] = React.useState(null);
  let [isLastAskNotToBeRepeated, setIsLastAskNotToBeRepeated] = React.useState(false);
  let [chartAskTyped, setChartAskTyped] = React.useState('');
  let [isChartKindAsked, setIsChartKindAsked] = React.useState(false);
  let [wasChartMenuOpen, setWasChartMenuOpen] = React.useState(isChartMenuOpen);
  if (wasChartMenuOpen !== isChartMenuOpen) {
    setWasChartMenuOpen(isChartMenuOpen);
    setChartAskTyped('');
    setChartAskFault(null);
  }
  let writeChartByAgent = React.useCallback(
    async (chartKind?: Dynamic, words?: Dynamic): Promise<Dynamic> => {
      if (chartsWrittenByAgent === null || isMakingChartRef.current) return ['busy', 'agent'];
      let view2 = store.getView();
      let chartMenuOpensBefore = chartMenuOpenCountRef.current;
      let cellsForChart = store.cellsForChartByAgent();
      let isByRow = words === '';
      let isSingleCell = cellsForChart !== null && isSingleCellSample(cellsForChart) && view2.selectionSeen.cellsAre !== 'number';
      if (cellsForChart === null || (isSingleCell && isByRow))
        return (
          setChartAskFault({
            why: 'forChat',
            wasByRow: isByRow,
          }),
          ['for_chat', 'agent']
        );
      isMakingChartRef.current = true;
      chartMakingNthRef.current += 1;
      let nth = chartMakingNthRef.current;
      let awaited = awaitedChartMaking(nth, 'byAgent', view2);
      isChartWritingLeftSheetRef.current = false;
      setIsChartKindAsked(chartKind !== 'any');
      setChartMaking(awaited);
      setChartAskFault(null);
      setIsLastAskNotToBeRepeated(false);
      setChartBeingWritten({
        asked: chartCaptionOrName(chartKind, words),
        sheetId: shownSheetIdOf(view2),
      });
      let { held: held, ...chartCells } = cellsForChart;
      let [topLeft, sheetId] = [store.newChartOfCellsHeld(held)?.topLeft, shownSheetIdOf(view2)];
      if (topLeft !== undefined && sheetId !== null)
        store.dispatch({
          kind: 'chartBeingMadeTold',
          nth: nth,
          chart: {
            sheetId: sheetId,
            topLeft: topLeft,
            kind: isByRow ? chartKind : 'any',
          },
        });
      let outcome = await insertChartWrittenByAgent(
        {
          agent: chartsWrittenByAgent,
          add(nodeId?: Dynamic) {
            store.dispatch({
              kind: 'chartBeingMadeTold',
              nth: nth,
              chart: {
                nodeSent: nodeId,
              },
            });
            isChartBeingPlacedRef.current = true;
            let chartName = chartKindNameOrAny(chartKind);
            return store
              .askForEditOfChart({
                kind: 'add',
                nodeId: nodeId,
                name: chartName,
                cells: held,
              })
              .finally(() => {
                isChartBeingPlacedRef.current = false;
              });
          },
        },
        {
          program: STOCK_CHART_PROGRAMS[chartKind === 'any' ? 'bar' : chartKind],
          ...chartCells,
        },
        {
          asked: chartKind === 'any' && words === '' ? null : askWordsOfKind(chartKind, words),
          mostUnitsOfAsked: MAX_ASK_WORDS_LENGTH,
        },
      ).catch(() => (chartWritingGivenUpNthRef.current >= nth ? 'stopped' : 'notChanged'));
      if (chartMakingNthRef.current !== nth) return ['stopped', 'agent'];
      let isChartMenuOpen2 = store.getView().contextBarMenu === 'chart';
      isMakingChartRef.current = false;
      setChartBeingWritten(null);
      store.dispatch({
        kind: 'chartBeingMadeTold',
        nth: nth,
        chart:
          typeof outcome === 'object'
            ? {
                nodeAdded: outcome.nodeId,
              }
            : null,
      });
      setIsLastAskNotToBeRepeated(outcome === 'full');
      mayTakeCaretFromBarRef.current = isChartMenuOpen2;
      let settled = chartMakingOutcome(outcome, isChartMenuOpen2, isChartWritingLeftSheetRef.current);
      if (outcome === 'noAgent') {
        isChartsOfferAskedRef.current = true;
        setChartsOfferedFor(false);
      }
      let isToTryPage = outcome === 'noAgent' || outcome === 'tooLarge' || outcome === 'forChat' || outcome === 'notChanged';
      let pageOptions = {
        cells: view2.selectionByAddress,
        mayTakeCaretFromBar: isChartMenuOpen2,
      };
      let pageOutcome = isToTryPage ? await makeChartByPage(chartKind, words, pageOptions) : null;
      if (pageOutcome === true && isChartMenuOpen2 && chartMenuOpensBefore === chartMenuOpenCountRef.current)
        store.dispatch({
          kind: 'contextBarMenuChanged',
          menu: 'chart',
          isOpen: false,
        });
      if (pageOutcome !== null) return [pageOutcome ? 'by_page_late' : whyChartNotMadeByPageRef.current, 'page'];
      setChartMaking(
        (input?: Dynamic) => ('made' in settled ? settleChartMaking(input, awaited, settled.made) : input?.nth === nth ? null : input),
      );
      if ('inCard' in settled && settled.inCard !== null) {
        setChartAskFault({
          why: settled.inCard,
          wasByRow: isByRow,
        });
        setChartAskTyped((input?: Dynamic) => (input === '' ? words : input));
      }
      if (typeof outcome === 'object' && isChartMenuOpen2)
        store.dispatch({
          kind: 'contextBarMenuChanged',
          menu: 'chart',
          isOpen: false,
        });
      return [chartEndWordOfAgent(outcome), 'agent'];
    },
    [chartsWrittenByAgent, store, makeChartByPage],
  );
  let forgetChartBeingMade = React.useCallback(
    (nth?: Dynamic) =>
      store.dispatch({
        kind: 'chartBeingMadeTold',
        nth: nth,
        chart: null,
      }),
    [store],
  );
  let giveUpChartWriting = React.useCallback(() => {
    chartWritingGivenUpNthRef.current = chartMakingNthRef.current;
    chartsWrittenByAgent?.giveUp();
  }, [chartsWrittenByAgent]);
  let stepBackFromChartWriting = React.useCallback(() => {
    giveUpChartWriting();
    if (isChartBeingPlacedRef.current) return;
    if (isMakingChartRef.current)
      store.dispatch({
        kind: 'chartBeingMadeTold',
        nth: chartMakingNthRef.current,
        chart: null,
      });
    isMakingChartRef.current = false;
    setChartBeingWritten(null);
  }, [giveUpChartWriting, store]);
  React.useEffect(() => giveUpChartWriting, [giveUpChartWriting]);
  let hasChartWritingLeftSheet = chartBeingWritten !== null && chartBeingWritten.sheetId !== shownSheetIdOf(view);
  React.useEffect(() => {
    if (!hasChartWritingLeftSheet) return;
    isChartWritingLeftSheetRef.current = true;
    giveUpChartWriting();
  }, [hasChartWritingLeftSheet, giveUpChartWriting]);
  let askChart = React.useCallback(
    async (chartKind?: Dynamic, words?: Dynamic): Promise<Dynamic> => {
      let selection = store.getView().selectionByAddress;
      if (selection === null) return ['waiting', 'page'];
      let chartMenuOpensBefore = chartMenuOpenCountRef.current;
      let isChartMenuOpen2 = store.getView().contextBarMenu === 'chart';
      lastProgrammaticActMsRef.current = performance.now();
      let askWords = cleanAskWords(words);
      let isByPageFirst = isChartMadeByPage(store.getView().chartsOnOffer[0], isChartWritingOn);
      let pageOutcome = isByPageFirst ? await makeChartByPage(chartKind, askWords) : null;
      if (pageOutcome === null && !isChartMenuOpen2) {
        if (!isMakingChartRef.current) noteChartNotForPage();
        return ['refused', 'page'];
      }
      let whyNothing = pageOutcome === null ? store.whyNothingToChart() : null;
      let cellsForChart = pageOutcome === null && whyNothing === null ? store.cellsForChartByAgent() : null;
      let isSingleCell = cellsForChart !== null && isSingleCellSample(cellsForChart) && store.getView().selectionSeen.cellsAre !== 'number';
      if (whyNothing === 'tablesNotFoundYet') return ['waiting', 'page'];
      if (whyNothing !== null || (isSingleCell && askWords === ''))
        return (
          setChartAskFault({
            why: whyNothing ?? 'noCells',
            wasByRow: askWords === '',
            tableAtPress: store.getView().selectionSeen.shape === 'cell' ? store.startOfAreaToChart() : null,
          }),
          [whyNothing === 'filterCutsTable' ? 'filter' : 'no_cells', 'page']
        );
      let isToAskInChat = shouldAskInChatInstead(chartAskFault?.why ?? null, chatWithAgent.isToBeHad() === true);
      let isToWriteByAgent =
        pageOutcome === null &&
        !isToAskInChat &&
        canAgentWriteCharts &&
        !isChartsOfferAskedRef.current &&
        (await chartsWrittenByAgent.isToBeHad().catch(() => false));
      if (store.isStopped()) return pageOutcome === null ? ['left', 'agent'] : [pageOutcome ? 'by_page' : whyChartNotMadeByPageRef.current, 'page'];
      if (isToWriteByAgent) return writeChartByAgent(chartKind, askWords);
      let outcome = isByPageFirst
        ? pageOutcome
        : await makeChartByPage(chartKind, askWords, {
            cells: selection,
            mayTakeCaretFromBar: true,
          });
      let isOpenedInChat =
        outcome ??
        (await cellsAddedToChat.openWithWhatWasPressed(
          newChartTitle(chartKind, askWords),
          selection,
          INSERT_CHART_LABEL,
          chartAskPayload(chartKind, askWords),
        ));
      if (outcome === null && !isOpenedInChat && chatWithAgent.isToBeHad() !== true) {
        if (isMakingChartRef.current) return ['busy', 'agent'];
        return (noteChartNotForPage(), ['no_agent', 'agent']);
      }
      if (isOpenedInChat && isChartMenuOpen2 && chartMenuOpensBefore === chartMenuOpenCountRef.current)
        store.dispatch({
          kind: 'contextBarMenuChanged',
          menu: 'chart',
          isOpen: false,
        });
      if (outcome !== null) return [outcome ? 'by_page' : whyChartNotMadeByPageRef.current, 'page'];
      if (!isOpenedInChat) return ['not_to_chat', 'agent'];
      return [isToAskInChat ? 'to_chat' : 'chat_no_agent', 'agent'];
    },
    [
      cellsAddedToChat,
      chatWithAgent,
      makeChartByPage,
      isChartWritingOn,
      noteChartNotForPage,
      store,
      chartAskFault,
      canAgentWriteCharts,
      chartsWrittenByAgent,
      writeChartByAgent,
    ],
  );
  let chartNotice = view.isOneRangeNeeded
    ? CHART_MESSAGES.oneRangeNeeded()
    : view.isSelectionCutByOwnFilters && (isChatToBeHad !== false || chartsMadeByPage.isToBeHad)
      ? CHART_MESSAGES.filterCutsCells()
      : null;
  let [areFormatToolsInView, setAreFormatToolsInView] = React.useState(true);
  React.useLayoutEffect(() => {
    if (!isMenuOpen) return;
    setAreFormatToolsInView(isTouchBelowSm() || (formatToolsRef.current?.getClientRects().length ?? 0) > 0);
  }, [isMenuOpen]);
  let canChartBeAsked =
    isChartWritingOffered === true || isChatToBeHad === true ? true : isChartWritingOffered === false && isChatToBeHad === false ? false : null;
  let areTablesAwaitedForChart = isChartMenuOpen && store.areTablesAwaitedForChart();
  let chartWhyNot =
    canChartBeAsked === false
      ? 'noChat'
      : canChartBeAsked === null || view.selectionByAddress === null || areTablesAwaitedForChart
        ? 'waiting'
        : null;
  let areaToChartStart = isChartMenuOpen && view.selectionSeen.shape === 'cell' ? store.startOfAreaToChart() : null;
  let hasTableMovedSinceFault = chartAskFault?.tableAtPress !== undefined && chartAskFault.tableAtPress !== areaToChartStart;
  let chartFaultShown =
    chartAskFault === null || hasTableMovedSinceFault
      ? null
      : chartAskFaultShown(chartAskFault.why, {
          ...chartAskFault,
          isChatToBeHad: isChatToBeHad === true,
        });
  let areChartKindsForPage =
    chartsMadeByPage.isToBeHad &&
    view.viewOnlyBecause === null &&
    !view.isCommentModeOn &&
    isChartMadeByPage(view.chartsOnOffer[0], isChartWritingOn);
  let canPageMakeChart = areChartKindsForPage && view.selectionByAddress !== null;
  let chartOffersNow = chartOffersForPage(view.chartsOnOffer, isChartWritingOn);
  let [chartOffers, setChartOffers] = React.useState(chartOffersNow);
  let [areChartOffersHeld, setAreChartOffersHeld] = React.useState(false);
  if (!areChartOffersHeld && chartOffers !== chartOffersNow) setChartOffers(chartOffersNow);
  let [areaToChartBefore, setAreaToChartBefore] = React.useState(areaToChartStart);
  if (areaToChartBefore !== areaToChartStart) {
    setAreaToChartBefore(areaToChartStart);
    setChartOffers(chartOffersNow);
  }
  let canChartNow = chartWhyNot === null || canPageMakeChart;
  if (areChartOffersHeld !== (isChartMenuOpen && chartOffers.length > 0 && canChartNow)) setAreChartOffersHeld(!areChartOffersHeld);
  let askChartCounted = React.useCallback(
    async (chartKind?: Dynamic, words?: Dynamic): Promise<Dynamic> => {
      if (store.getView().contextBarMenu !== 'chart') return void (await askChart(chartKind, words));
      let countAsk = countChartAsk(chartCardCounted, chartAskKindWord(chartKind, cleanAskWords(words) !== '', chartOffers.length > 0));
      try {
        countAsk(...(await askChart(chartKind, words)));
      } catch (error) {
        throw (countAsk('failed', 'page'), error);
      }
    },
    [askChart, chartCardCounted, chartOffers, store],
  );
  React.useEffect(() => {
    if (isChartMenuOpen)
      chartCardCounted({
        step: 'open',
        what: store.whatChartCardOpensOn(),
      });
  }, [isChartMenuOpen, chartCardCounted, store]);
  let chartAskMenu = React.useMemo(
    () =>
      isChartMenuOpen
        ? jsx(ChartAskMenu, {
            onOffer: chartOffers,
            whyNot: chartWhyNot,
            canPageMakeChart: canPageMakeChart,
            areKindsForPage: areChartKindsForPage,
            onAsked: askChartCounted,
            change: chartBeingWritten === null ? null : 'agentWrites',
            askedOfAgent: chartBeingWritten?.asked ?? '',
            isKindAsked: isChartKindAsked,
            onSteppedBackFromChange: stepBackFromChartWriting,
            noteOnLastAsk: chartFaultShown === null ? null : chartRefusalText(chartFaultShown),
            isNoteOfFault:
              chartFaultShown !== 'forChat' &&
              chartFaultShown !== 'notHere' &&
              chartFaultShown !== 'noCells' &&
              chartFaultShown !== 'filterCutsTable',
            isLastAskNotToBeRepeated: isLastAskNotToBeRepeated,
            typed: chartAskTyped,
            onTyped: (typed?: Dynamic) => {
              setChartAskTyped(typed);
              setChartAskFault(null);
            },
          })
        : null,
    [
      isChartMenuOpen,
      chartOffers,
      chartWhyNot,
      canPageMakeChart,
      areChartKindsForPage,
      askChartCounted,
      chartBeingWritten,
      isChartKindAsked,
      stepBackFromChartWriting,
      chartFaultShown,
      isLastAskNotToBeRepeated,
      chartAskTyped,
    ],
  );
  let { rowsAskedFor: rowsAskedFor } = view;
  let sortFilterCards = React.useMemo(
    () =>
      rowsAskedFor === null
        ? null
        : jsx(SortFilterCardList, {
            card: rowsAskedFor,
            onAct: actOnRowsAskedFor,
            onCustomSortAsked: askCustomSort,
          }),
    [rowsAskedFor, actOnRowsAskedFor, askCustomSort],
  );
  let { tableThatFilterBarAddsTo: tableThatFilterBarAddsTo } = view;
  let isFilterNotDrawnYet = rowsAskedFor?.isFilterNotDrawnYet === true;
  let isFilterBarAskOpen2 = isFilterBarAskOpen(view);
  let [filterListTableKey, filterListColumn] = [view.ownFilterList?.tableKey ?? null, view.ownFilterList?.c ?? null];
  let isFilterListOpenerShown =
    filterListOpener !== null &&
    (filterListTableKey === null || (filterListTableKey === filterListOpener.tableKey && filterListColumn === filterListOpener.c));
  let tableCardKey = isFilterNotDrawnYet
    ? rowsAskedFor.tableKey
    : isFilterBarAskOpen2
      ? tableThatFilterBarAddsTo
      : isFilterListOpenerShown
        ? filterListOpener.tableKey
        : null;
  let tableCardPlacement2 = tableCardPlacement(view.grid, tableCardKey, zoom, TABLE_CARD_WIDTH);
  let [tableCardHang, setTableCardHang] = React.useState(null);
  if ((tableCardHang?.tableKey ?? null) !== tableCardKey)
    setTableCardHang(
      tableCardKey === null
        ? null
        : {
            tableKey: tableCardKey,
            hangBeside: tableCardPlacement2 !== null,
          },
    );
  let hangsBesideTable = tableCardHang?.hangBeside ?? tableCardPlacement2 !== null;
  let [tableCardX, tableCardY] = tableCardPlacement2 === null ? [null, 0] : [tableCardPlacement2.x, tableCardPlacement2.y];
  let tableCardAnchor = useZoomedVirtualAnchor(
    cellsRef,
    zoom,
    React.useMemo(() => (tableCardX === null ? null : new (DOMRect as Dynamic)(tableCardX, tableCardY, 0, 0)), [tableCardX, tableCardY]),
  );
  let {
    anchor: besideTableAnchor,
    clearAtFoot: clearAtFoot,
    noteFirstCardDrawn: noteFirstCardDrawn,
    noteColumnsCardDrawn: noteColumnsCardDrawn,
  } = useHungTableCardPlace({
    placeOnScreen: tableCardAnchor,
    tableKey: tableCardKey,
    byButton: tableCardPlacement2?.byButton ?? null,
    zoom: zoom,
    grid: cellsRef,
  });
  let { ownFilterList: ownFilterList } = view;
  let filterListHung =
    ownFilterList === null || ownFilterList.hangsFrom === null || isFilterListOpenerShown
      ? null
      : hungCardUnderFilterButton({
          ...ownFilterList,
          hangsFrom: ownFilterList.hangsFrom,
        });
  let [filterListHungX, filterListHungY] = filterListHung === null ? [null, 0] : [filterListHung.x, filterListHung.y];
  let {
    anchor: filterListAnchor,
    clearAtFoot: filterListClearAtFoot,
    noteFirstCardDrawn: noteFilterListDrawn,
  } = useHungTableCardPlace({
    placeOnScreen: useZoomedVirtualAnchor(
      cellsRef,
      zoom,
      React.useMemo(
        () => (filterListHungX === null ? null : new (DOMRect as Dynamic)(filterListHungX, filterListHungY, 0, 0)),
        [filterListHungX, filterListHungY],
      ),
    ),
    tableKey: filterListHung?.whose ?? null,
    byButton: filterListHung?.byButton ?? null,
    goesWithRow: true,
    zoom: zoom,
    grid: cellsRef,
  });
  let filterBarCard = React.useMemo(
    () =>
      tableThatFilterBarAddsTo === null
        ? null
        : {
            card: isFilterBarAskOpen2 && !isFilterNotDrawnYet ? rowsAskedFor : null,
            besideTable: besideTableAnchor,
            hangsBesideTable: hangsBesideTable,
            clearAtFoot: clearAtFoot,
            onDrawn: noteFirstCardDrawn,
            onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange('sort', isOpen, event, tableThatFilterBarAddsTo),
            onAct: actOnRowsAskedFor,
            onCustomSortAsked: askCustomSort,
          },
    [
      tableThatFilterBarAddsTo,
      isFilterBarAskOpen2,
      isFilterNotDrawnYet,
      rowsAskedFor,
      besideTableAnchor,
      hangsBesideTable,
      clearAtFoot,
      noteFirstCardDrawn,
      onMenuOpenChange,
      actOnRowsAskedFor,
      askCustomSort,
    ],
  );
  let filterNotDrawnCard = React.useMemo(
    () => ({
      card: isFilterNotDrawnYet ? rowsAskedFor : null,
      besideTable: besideTableAnchor,
      hangsBesideTable: true,
      clearAtFoot: clearAtFoot,
      onDrawn: noteFirstCardDrawn,
      onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange('sort', isOpen, event),
      onAct: actOnRowsAskedFor,
      onCustomSortAsked: askCustomSort,
    }),
    [isFilterNotDrawnYet, rowsAskedFor, besideTableAnchor, clearAtFoot, noteFirstCardDrawn, onMenuOpenChange, actOnRowsAskedFor, askCustomSort],
  );
  let isFilterListFromButton = filterListOpener?.isChip === false;
  let owedAfterSortCardRef = React.useRef(null);
  let askSortCardFromFilterList = React.useCallback(
    (isByKey?: Dynamic) => {
      let tableKey = filterListOpener?.tableKey ?? null;
      if (tableKey === null) return;
      owedAfterSortCardRef.current =
        isByKey && filterListOpenerElement !== null
          ? {
              opener: filterListOpenerElement,
              presses: focusTrackerRef.current?.timesBegun() ?? 0,
            }
          : null;
      onMenuOpenChange('sort', true, null, tableKey);
      store.lookOnceEventsAreFinished(() => {
        if (store.getView().rowsAskedFor === null) owedAfterSortCardRef.current = null;
      });
    },
    [store, filterListOpener, filterListOpenerElement, onMenuOpenChange],
  );
  let whatHasCaretAfterOwnFilterCard2 = React.useCallback(() => {
    let owedAfterBack = owedAfterSortCardRef.current;
    owedAfterSortCardRef.current = null;
    return whatHasCaretAfterOwnFilterCard(store.getView(), {
      owedAfterBack: owedAfterBack,
      pressesNow: timesFocusBegun(),
      afterMenu: whatHasCaretAfter,
    });
  }, [store, whatHasCaretAfter, timesFocusBegun]);
  let filterListChip = React.useMemo(
    () =>
      filterListTableKey === null || filterListColumn === null || filterListOpener?.isChip !== true
        ? null
        : {
            tableKey: filterListTableKey,
            c: filterListColumn,
          },
    [filterListTableKey, filterListColumn, filterListOpener],
  );
  let isCoarsePointer2 = useCoarsePointer();
  let isWrapOffered =
    view.grid.offersAtSelection?.isTextCutOff === true && view.grid.offersAtSelection.besideIfShort !== null && !isCoarsePointer2;
  let chartOfferAtSelection2 = chartOfferAtSelection(view.chartsOnOffer);
  let chartOfferedAtSelection =
    view.grid.offersAtSelection?.isOneCell === false &&
    view.viewOnlyBecause === null &&
    !view.isSelectionCutByOwnFilters &&
    isChartMadeByPage(chartOfferAtSelection2, isChartWritingOn) &&
    chartsMadeByPage.isToBeHad
      ? chartOfferAtSelection2
      : undefined;
  let offersAtSelection = React.useMemo(
    () => [
      ...(isWrapOffered
        ? [
            {
              ...wrapTextTool(),
              onPress(event?: Dynamic) {
                swallowRestOfPress(event);
                chooseCellFormat({
                  wrapText: true,
                });
              },
            },
          ]
        : []),
      ...(chartOfferedAtSelection === undefined
        ? []
        : [
            {
              id: 'chart',
              icon: chartThumbnailIcon(chartOfferedAtSelection, !canPageMakeChart),
              label: insertChartKindLabel(chartOfferedAtSelection.kind),
              canAct: canPageMakeChart,
              whyNot: null,
              onPress() {
                askChart(chartOfferedAtSelection.kind, '');
                if (cellsRef.current?.ownerDocument.hasFocus() === true) focusCaret();
              },
            },
          ]),
    ],
    [isWrapOffered, chooseCellFormat, chartOfferedAtSelection, canPageMakeChart, askChart, focusCaret],
  );
  let putAwayErrorCard2 = React.useCallback(
    (cardOf?: Dynamic) =>
      store.dispatch({
        kind: 'errorCardPutAway',
        cardOf: cardOf,
      }),
    [store],
  );
  let askFixOfErrorCard2 = React.useCallback(
    (card?: Dynamic, options?: Dynamic) => askFixOfErrorCard(store, cellsAddedToChat, card, options),
    [store, cellsAddedToChat],
  );
  let isErrorExplained = view.errorExplained !== null;
  React.useEffect(() => {
    if (isErrorExplained && !areWaysInToComeSoon2) chatWithAgent.look();
  }, [chatWithAgent, isErrorExplained, areWaysInToComeSoon2]);
  let { grid: gridNow, mode: mode, notice: notice, newsOfLoss: newsOfLoss } = view;
  let selectedPlacementBeforeRef = React.useRef(selectedPlacementId);
  let isPlacementStillThere = React.useEffectEvent(
    (placementId?: Dynamic) => gridNow.placedViews.some((input?: Dynamic) => input.placementId === placementId),
  );
  let isCaretFreeToGo = React.useEffectEvent(() => {
    let active = getActiveElement();
    let isInClosingPart = isInsideUnpinnedToast(active) || isInClosingContextBar(active);
    return active === active?.ownerDocument.body || isFocusInCells() || isInClosingPart;
  });
  let placementSelectedByPageRef = React.useRef(null);
  let openPlacedViewMenuIfOwed = React.useEffectEvent((placementId?: Dynamic) => {
    let isOwed = placementBeforeKeysListRef.current === placementId;
    placementBeforeKeysListRef.current = null;
    let doc = cellsRef.current?.ownerDocument;
    if (isOwed && doc?.hasFocus() === true) cardUnderChartRef.current?.open(placementId);
  });
  React.useLayoutEffect(() => {
    let placementBefore = selectedPlacementBeforeRef.current;
    selectedPlacementBeforeRef.current = selectedPlacementId;
    let wasMenuOwed = placementLeftRef.current === placementBefore;
    placementLeftRef.current = null;
    let wasSelectedByPage = placementSelectedByPageRef.current === selectedPlacementId;
    placementSelectedByPageRef.current = null;
    let doc = cellsRef.current?.ownerDocument;
    if (doc === undefined) return;
    if (selectedPlacementId !== undefined) {
      openPlacedViewMenuIfOwed(selectedPlacementId);
      if (placementIdOfElement(doc.activeElement) === selectedPlacementId) return;
      let caretComes = howCaretComesToPlacedView({
        isCaretOfPressOnItsWay: isRefocusingAfterPressRef.current,
        hasPageCaret: doc.hasFocus(),
        isCaretFreeToGo: isCaretFreeToGo() || wasSelectedByPage,
      });
      if (caretComes === 'comesByItself') return;
      if (caretComes === 'isBrought') return focusCaret();
      let act = {
        kind: 'leave',
        isForCells: false,
      };
      return store.dispatch({
        kind: 'placedViewActedOn',
        placementId: selectedPlacementId,
        act: act,
      });
    }
    if (placementBefore === undefined) return;
    if (wasMenuOwed && isPlacementStillThere(placementBefore)) return;
    let isCaretNowhere = doc.activeElement === doc.body || placementIdOfElement(doc.activeElement) !== null;
    if (isCaretNowhere && doc.hasFocus() && awaitKeyUnderTypist()) return;
    if (isCaretNowhere && doc.hasFocus()) return focusCaret();
    if (isCaretNowhere && doc.activeElement instanceof HTMLElement) doc.activeElement.blur();
    return;
  }, [selectedPlacementId, focusCaret, store]);
  let selectAddedChart = React.useEffectEvent((placementId?: Dynamic) => {
    if (addedChartView?.placementId !== placementId) return;
    let isCaretInContextBar = mayTakeCaretFromBarRef.current && formatToolsRef.current?.contains(getActiveElement()) === true;
    if (isPageLeftUntouched() || !(isCaretFreeToGo() || isCaretInContextBar)) return;
    if (!isAddedChartStillAtPress(chartMaking, store.getView())) return;
    placementSelectedByPageRef.current = isCaretInContextBar ? placementId : null;
    store.dispatch({
      kind: 'placedViewActedOn',
      placementId: placementId,
      act: {
        kind: 'select',
        isByKey: true,
        hasJustArrived: true,
      },
    });
  });
  let addedChartPlacement = addedChartView?.placementId;
  let selectedAddedChartRef = React.useRef(null);
  let isCaretStillSettling = React.useEffectEvent(() => {
    let active = getActiveElement();
    return active === active?.ownerDocument.body || (active?.closest(`[${CONTEXT_BAR_PART_ATTRIBUTE}]`) ?? null) !== null;
  });
  React.useEffect(() => {
    let doc = cellsRef.current?.ownerDocument;
    let win = doc?.defaultView ?? null;
    if (addedChartPlacement === undefined || isChartMenuOpen) return;
    if (doc === undefined || win === null) return;
    if (selectedAddedChartRef.current === addedChartPlacement) return;
    selectedAddedChartRef.current = addedChartPlacement;
    let tryAfterFrame = (triesLeft?: Dynamic) =>
      afterNextFrameOrTimeout(
        win,
        () => (triesLeft > 0 && isCaretStillSettling() ? tryAfterFrame(triesLeft - 1) : selectAddedChart(addedChartPlacement)),
      );
    return tryAfterFrame(ADDED_CHART_SELECT_TRIES);
  }, [addedChartPlacement, isChartMenuOpen]);
  let focusWrapperRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let doc = cellsRef.current?.ownerDocument;
    if (doc?.hasFocus() === true && doc.activeElement === focusWrapperRef.current) focusControlInWrapper(doc.activeElement);
  });
  let [gridRight, gridBottom] = [gridNow.body.left + gridNow.body.width, gridNow.body.top + gridNow.body.height];
  let sizeOfGrid = React.useMemo(
    () => ({
      gridWidth: gridRight,
      gridHeight: gridBottom,
      density: gridNow.density,
    }),
    [gridRight, gridBottom, gridNow.density],
  );
  let importOnGrid = useImportOnGrid({
    open: view.importOfAFile,
    listedSheets: view.listedSheets,
    locale: view.locale,
    sizeOfGrid: sizeOfGrid,
    isImportAsNewSheetUnanswered: view.isImportAsNewSheetUnanswered,
    zoom: zoom,
    onConfirmed: confirmImport2,
    onDropped: dropImport,
    onEscaped: escapeImport2,
  });
  let saveStatus =
    saveStatusCard2?.isAboutConnection === true ? null : saveStatusText(view.saving, view.hasUnsavedEdits, isRetryingLong, isEditingPaused);
  let saveLineWords =
    (isRetryingLong ? null : saveStatus) ??
    announcedConnectionWords ??
    (saveStatus === null && (view.fractionSavedToShow !== null || nextIsLongSaveTold2) ? savingChangesText() : null) ??
    (isAllSavedSaid ? allChangesSavedText() : null) ??
    (isEditingBackNoticeShown ? editingBackOnText() : null);
  let [connectionBackSay, setConnectionBackSay] = React.useState('none');
  let nextConnectionBackSay = nextConnectionBackSayImported(connectionBackSay, {
    isReconnectingSaid: announcedConnectionWords !== null,
    isOpen: connection === null,
    isLineTaken: saveLineWords !== null,
  });
  if (nextConnectionBackSay !== connectionBackSay) setConnectionBackSay(nextConnectionBackSay);
  if (useIsTrueForVisibleMs(connectionBackSay === 'backSaid', SAID_NOTICE_SHOWN_MS) && connectionBackSay === 'backSaid') setConnectionBackSay('none');
  let isNoticeShown = notice !== null && !isNoticeApartFromSaveCard(notice, saveStatusCard2);
  let doesNoticeGiveWay = isNoticeShown && noticeGivesWay(notice) && mode.kind !== 'editing';
  React.useEffect(() => {
    if (!doesNoticeGiveWay) return;
    let timer = setTimeout(
      () =>
        store.dispatch({
          kind: 'noticeDismissed',
          notice: notice,
        }),
      DEFAULT_TOAST_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [store, notice, doesNoticeGiveWay]);
  let { peopleList: peopleList } = view;
  let highlightedPerson = peopleList?.rows[peopleList.highlightedRow];
  let personChipGoneTo = peopleList?.inField?.find(({ userId: userId }: Dynamic) => userId === peopleList.chipGoneTo);
  let peopleListAnnouncement2 = listAnnouncement(peopleList?.card ?? null);
  let [isEntryLiveRegionOn, setIsEntryLiveRegionOn] = React.useState(true);
  let [isListLiveRegionOn, setIsListLiveRegionOn] = React.useState(true);
  let isEditorACombobox = gridNow.isEditorAComboBox || gridNow.isEditorOverCalendar || isInBoxOfOneLine;
  let isComboboxInCell = isEditorACombobox && peopleList?.under !== 'formulaBar';
  let activeDescendantId =
    dropdownList !== null
      ? dropdownListIds(dropdownList)
      : peopleList?.under === 'cell'
        ? peopleListCardIds(peopleList)
        : view.timeList !== null
          ? timeListActiveDescendant(view.timeList)
          : view.functionList !== null && typingTarget === 'cell'
            ? functionListActiveDescendant(view.functionList)
            : typingTarget === 'cell'
              ? formulaOfferActiveDescendant(formulaFromWords)
              : null;
  let dropdownAriaOnIos =
    mode.kind === 'navigating' && IS_IOS_BROWSER && dropdownList !== null
      ? withHighlightedRowIdOr(dropdownListIds(dropdownList), firstDropdownListRowId(dropdownList))
      : null;
  let entryGridlineOverlap2 = gridNow.editorBox === null ? NO_OFFSET : entryGridlineOverlap(gridNow.editorBox, gridNow.editorScale);
  let sheetBesideSidePaneProps2 = sheetBesideSidePaneProps(sidePaneWidth, isSidePaneDrawn);
  let sheetBehindSidePaneClass = isSidePaneDrawn ? SHEET_BEHIND_SIDE_PANE_CLASS : '';
  let tabsAway = useTabsAway(mode.kind === 'editing');
  let areTabsAway = tabsAway.areTabsAway && !isSidePaneDrawn;
  let isFrameShortened = tabsAway.isFrameShortened && !isSidePaneDrawn;
  let isNarrowWithFormatBar = useNarrowByTouch() && view.formatOfSelection !== null;
  let isFootCovered = areTabsAway || (mode.kind === 'editing' && !isSidePaneDrawn);
  useFootInsetOf(isNarrowWithFormatBar && isFootCovered ? footBar : null);
  let leaveMenuAndEntryOnPress = (event?: Dynamic) => {
    swallowRestOfPress(event);
    let { contextBarMenu: contextBarMenu, mode: mode2 } = store.getView();
    if (contextBarMenu !== null) onMenuOpenChange(contextBarMenu, false, null);
    if (mode2.kind === 'editing')
      store.dispatch({
        kind: 'entryLeft',
      });
  };
  let takeViewBack = () => {
    let { isFollowingAgent: isFollowingAgent, isFollowingPerson: isFollowingPerson, grid: grid2 } = store.getView();
    if (isFollowingAgent || isFollowingPerson || grid2.yetToGlide !== null)
      store.dispatch({
        kind: 'viewTakenBack',
      });
  };
  let shownSheet = view.listedSheets.find(({ isShown: isShown }: Dynamic) => isShown);
  let swallowRestOfPress2 = (event?: Dynamic) => {
    if (pressGuard.isRestOfPressSwallowed()) event.stopPropagation();
  };
  let shownSheetName = shownSheet?.name ?? sheetMessages.sheet();
  let cellEditorDescribedBy = view.areFormulasShown ? `${KEY_TO_LIST_OF_KEYS_ID} ${FORMULAS_SHOWN_ID}` : KEY_TO_LIST_OF_KEYS_ID;
  let activeCellElementId =
    view.isSteppedOutOfCells || view.isCaretWithCellsBeforeEntryEnds || isZoomSettling ? null : gridNow.activeCellElementId;
  let entryBoxStyle =
    gridNow.editorBox === null
      ? null
      : cellEntryBoxStyle(gridNow.editorBox, gridNow.body, gridNow.editorFormat, gridNow.editorKeepsClear, {
          lineCount: gridNow.editorLineCount,
          foldsAt: gridNow.editorFoldsAt,
          scale: gridNow.editorScale,
        });
  let areReferencesWritten =
    view.referencesInEntry.some(({ writtenAt: writtenAt }: Dynamic) => writtenAt !== undefined) &&
    formulaFromWords.stage?.kind !== 'asked' &&
    !(formulaFromWords.stage?.kind === 'proposed' && formulaFromWords.stage.isArriving);
  let areReferencesHued =
    areReferencesWritten &&
    !isInBoxOfOneLine &&
    !gridNow.isEntryAmongPeople &&
    gridNow.editorPaints.fill === null &&
    gridNow.editorPaints.text === null;
  let isEditingFormula = mode.kind === 'editing' && !isInBoxOfOneLine && isFormulaText(mode.text);
  let renderCellEditor = (isWaitingBox?: Dynamic) => {
    if (mode.kind !== 'editing' || view.entryCellText === null) return null;
    let editorProps = {
      className: 'sheet-cell-editor',
      'aria-label':
        view.entrySheetName === null ? editingCellLabel(view.entryCellText) : editingCellOnSheetLabel(view.entryCellText, view.entrySheetName),
      'aria-busy': formulaFromWords.stage?.kind === 'asked' || undefined,
      ...(gridNow.isEditorOverCalendar
        ? calendarCellComboboxProps(view.calendar !== null, activeDescendantId)
        : comboboxAriaProps(gridNow.isEditorAComboBox || isWaitingBox, activeDescendantId)),
      ...PLAIN_TEXT_FIELD_PROPS,
      ...cellFieldKeyProps,
      'data-starts-on-line-at-left': entryGridlineOverlap2.x > 0 || undefined,
      'data-holds-one-line': isWaitingBox || mode.holdsOneLine || mode.isInBoxOfOneLine,
      'data-is-as-wide-as-may-be': (entryBoxStyle !== null && entryBoxStyle.minWidth === entryBoxStyle.maxWidth) || undefined,
      'data-floats-over-other-sheet': view.sheetPointedIn !== null || undefined,
      'data-is-expanded': gridNow.expandedEntryCard !== null || undefined,
      'data-flag-stands': gridNow.editorFlagStands ?? undefined,
      'data-is-under-hues': areReferencesHued || undefined,
      style:
        peopleListPlacement !== null
          ? entryEditorLineStyle(CHIP_FIELD_LINE_HEIGHT, DEFAULT_CELL_FORMAT.font)
          : {
              ...entryEditorStyle(entryBoxStyle ?? OFFSCREEN_SPOT, gridNow.editorFormat.font, isEditingFormula),
              ...fillPaintStyle(gridNow.editorPaints.fill),
              ...textPaintStyle(gridNow.editorPaints.text),
            },
      ...(peopleListPlacement === null && paintDataAttributes(gridNow.editorPaints)),
      value: mode.text,
      onChange: (event?: Dynamic) => onFieldInput('cell', event),
      onFocus: () => {
        if (!store.mayAnEntryOpenOrEnd()) moveEntryToUnlessThere('cell');
      },
    };
    let { autoComplete: autoComplete, ...editorPropsWithoutAutoComplete } = editorProps;
    return isWaitingBox
      ? jsx('input', {
          ref: setCellEditorElement,
          ...GRID_KEY_FIELD_PROPS,
          ...editorProps,
          'aria-describedby': cellEditorDescribedBy,
        })
      : jsx(LingeringEntryInput, {
          ofCell: entryCellOnPhone,
          drawn: !gridNow.isEntryAmongPeople
            ? {
                as: 'editor',
                ref: setTypingFieldElement,
                ...editorPropsWithoutAutoComplete,
                references: areReferencesHued ? view.referencesInEntry : NO_REFERENCES,
                brackets: view.matchingBrackets,
                looks: gridNow.editorLooks,
                areLooksSeen: gridNow.areEditorLooksSeen,
                marksOfCell: gridNow.marksOfEntryCell,
                areSignsRead: gridNow.doesEntryReadSigns,
                textHeldAsEntryOpened: gridNow.textHeldAsEntryOpened,
                areSignsLeftAsTyped: gridNow.areSignsLeftAsTyped,
                numbersOfLines: gridNow.editorNumbersOfLines,
                caretToPut: gridNow.editorCaretToPut,
                onMarkAsked: (toggle?: Dynamic) =>
                  chooseCellFormat({
                    toggle: toggle,
                  }),
                selectionHeld: view.linkForm?.inEntry,
                onBoxPressed: (line?: Dynamic) =>
                  store.dispatch({
                    kind: 'boxOfLinePressedInEntry',
                    line: line,
                  }),
              }
            : {
                as: 'textArea',
                ref: setTypingFieldElement,
                rows: 1,
                ...editorProps,
                placeholder: peopleListField === null ? undefined : addPeopleHint(peopleListField),
              },
        });
  };
  let cellEditor = jsxs(Fragment, {
    children: [
      (isInBoxOfOneLine ? null : renderCellEditor(false)) ??
        jsx(LingeringEntryInput, {
          drawn: null,
        }),
      (isInBoxOfOneLine ? renderCellEditor(true) : null) ??
        jsx('input', {
          ref: setCellEditorElement,
          ...GRID_KEY_FIELD_PROPS,
          className: 'sheet-cell-editor',
          'data-is-waiting': true,
          onBlur: ({ relatedTarget: relatedTarget, currentTarget: { ownerDocument: doc } }: Dynamic) => {
            isShiftHeldRef.current = false;
            if (relatedTarget !== null || focusTrackerRef.current?.isUnderWay() === true) return;
            if (isModalOpen(store.getView())) return;
            setTimeout(() => {
              if (doc.hasFocus()) restoreFocus();
            });
          },
          onFocus: () => {
            let view2 = store.getView();
            if (areCellsOffLimits(view2) && view2.mode.kind !== 'editing')
              gridFocusRef.current?.focus({
                preventScroll: true,
              });
          },
          hidden: isViewOnly,
          readOnly: isViewOnly || doCellsTakeNoText2,
          'aria-hidden': typingTarget !== 'grid' || undefined,
          tabIndex: -1,
          'aria-label': shownSheetName,
          'aria-describedby': cellEditorDescribedBy,
          ...(dropdownAriaOnIos === null ? cellEntryComboboxProps(activeCellElementId) : comboboxAriaProps(true, dropdownAriaOnIos)),
          ...PLAIN_TEXT_FIELD_PROPS,
          ...cellFieldKeyProps,
          style:
            peopleListPlacement !== null
              ? entryEditorLineStyle(CHIP_FIELD_LINE_HEIGHT, DEFAULT_CELL_FORMAT.font)
              : entryEditorStyle(
                  gridNow.activeCellBox === null
                    ? {
                        left: gridNow.body.left,
                        top: gridNow.body.top,
                      }
                    : cellEntryBoxStyle(gridNow.activeCellBox, gridNow.body, gridNow.editorFormat, gridNow.editorKeepsClear),
                  gridNow.editorFormat.font,
                  false,
                ),
          value: waitingBoxText,
          onChange: (event?: Dynamic) => onFieldInput('cell', event),
          onKeyDown: (event?: Dynamic) => {
            cellFieldKeyProps.onKeyDown(event);
            keepCaretAtEndOnTyping(event);
          },
        }),
    ],
  });
  let entryTextLooks =
    mode.kind !== 'editing' || view.entryCellText === null
      ? null
      : {
          text: mode.text,
          font: DEFAULT_CELL_FORMAT.font,
        };
  let { formatsThatFit: formatsThatFit, takesDropdownFromInsert: takesDropdownFromInsert } = view.formatOfSelection ?? {};
  let cellControlInsertChoices2 = React.useMemo(
    () =>
      formatsThatFit === undefined || takesDropdownFromInsert === undefined
        ? []
        : cellControlInsertChoices({
            formatsThatFit: formatsThatFit,
            takesDropdown: takesDropdownFromInsert,
            isOneRangeNeeded: view.isOneRangeNeeded,
          }),
    [formatsThatFit, takesDropdownFromInsert, view.isOneRangeNeeded],
  );
  let areContextToolsHeld = mode.kind === 'editing' || view.contextBarMenu !== null;
  let [areContextToolsRestedOn, setAreContextToolsRestedOn] = React.useState(false);
  let [contextTools, setContextTools] = React.useState({
    shown: contextToolsShapeOf(view.selectionSeen),
    hasSortAndFilter: view.isSortAndFilterOnBar,
    actSeen: null,
  });
  let contextToolsNext = nextContextToolsState(contextTools, view, {
    isHeld: areContextToolsHeld,
    isRestedOn: areContextToolsRestedOn,
  });
  if (contextToolsNext !== contextTools) setContextTools(contextToolsNext);
  let numberFormatListTold = React.useMemo(
    () => ({
      onTyped: (text?: Dynamic) =>
        store.dispatch({
          kind: 'typedInListOfNumberFormats',
          text: text,
        }),
      onAgentAsked: askAgentForNumberFormat2,
      onEscaped: escapeCustomNumberFormat,
      onEntered: enterCustomNumberFormat,
      onActHeld: holdActAtNumberFormat,
    }),
    [store, askAgentForNumberFormat2, escapeCustomNumberFormat, enterCustomNumberFormat, holdActAtNumberFormat],
  );
  let customNumberFormatInList = view.customNumberFormat?.typedIn === 'list' ? view.customNumberFormat : null;
  let isAgentOfferedForPattern = view.isAgentOfferedForPattern && !isComposing;
  let numberFormatList = React.useMemo(
    () => ({
      entry: customNumberFormatInList,
      isAgentOffered: isAgentOfferedForPattern,
      told: numberFormatListTold,
    }),
    [customNumberFormatInList, isAgentOfferedForPattern, numberFormatListTold],
  );
  let contextBar =
    view.formatOfSelection !== null &&
    jsx('div', {
      className: 'sheet-context-bar',
      'data-is-shown': 'true',
      'data-stands': 'footBar',
      children: jsx(FormattingToolbar, {
        ref: formatToolsRef,
        isSwipedRow: isNarrowWithFormatBar,
        isEntryOpen: mode.kind === 'editing',
        whyNoToolForCells: selectedPlacementId === undefined ? null : chartMessages.toolIsNotForCharts(),
        formatOfSelection: view.formatOfSelection,
        sectionShows: contextToolsNext.shown,
        onSectionRestedOn: setAreContextToolsRestedOn,
        arePeopleSelected: view.selectionSeen.cellsAre === 'person',
        selectedRowCount: view.selectedRowCount,
        selectedColumnCount: view.selectedColumnCount,
        canMergeSelection: view.canMergeSelection && !view.isOneRangeNeeded,
        canUnmergeSelection: view.canUnmergeSelection && !view.isOneRangeNeeded,
        isOneRangeNeeded: view.isOneRangeNeeded,
        onMergeChangeChosen: chooseMergeChange,
        onCheckboxesSet: setCheckboxesInToolbar,
        onSheetChangeChosen: chooseSheetChangeInToolbar,
        canWriteFigures: view.hasFiguresToWrite,
        onFigureChosen: chooseFigureInToolbar,
        isPaneOfDropdownOpen: view.isSidePaneAboutDropdown,
        onPaneOfDropdownAsked: toggleSidePane,
        openMenu: isFilterBarAskOpen2 ? null : view.contextBarMenu,
        isSheetMenuOpen: view.menu?.isOfContextBar === true && !isMenuHoldingField(view.menu),
        onFormatChosen: chooseCellFormatAtFoot,
        onChosenByOwnTool: ownToolOfFormatCounted,
        workbookInFormatMenu: workbookSettings,
        formatInList: numberFormatList,
        borderPen: view.borderPen,
        onBordersChosen: chooseBorders,
        onBorderPenChanged: changeBorderPen,
        areGridlinesHidden: view.grid.areGridlinesHidden,
        onGridlinesToggled: toggleGridlines2,
        whatColorPickerShows: store.whatColorPickerShows,
        onMenuOpenChange: onMenuOpenChange,
        howPickerWasAskedInCellsMenu: getContextBarMenuOpenedBy,
        onSheetMenuAsked: askSheetMenu,
        areConditionalFormatsOpen: conditionalFormats?.drawnAs === 'pane',
        onConditionalFormatsAsked: askConditionalFormats,
        isPickerAskedByKeyRef: isPickerAskedByKeyRef,
        cardOfConditionalFormats: conditionalFormatsCard,
        cardOfChart: chartAskMenu,
        cardOfSortAndFilter: isFilterBarAskOpen2 ? null : sortFilterCards,
        isSortAndFilterOnBar: contextToolsNext.hasSortAndFilter,
        whyNoChart: chartNotice,
        whatHasCaretAfterMenu: whatHasCaretAfter,
        onKeyDown: onToolbarKeyDown,
        inserts: cellControlInsertChoices2,
        onInsertChosen: insertCellControl2,
      }),
    });
  let {
    formatOfSelection: formatOfSelection,
    selectedRowCount: selectedRowCount,
    selectedColumnCount: selectedColumnCount,
    canMergeSelection: canMergeSelection,
  } = view;
  let {
    isOneRangeNeeded: isOneRangeNeeded,
    isSidePaneAboutDropdown: isSidePaneAboutDropdown,
    canUnmergeSelection: canUnmergeSelection,
  } = view;
  let { areGridlinesHidden: areGridlinesHidden } = view.grid;
  let { borderPen: borderPen } = view;
  let hasFiguresToWrite = view.hasFiguresToWrite;
  let [isChartSelected, sectionShows] = [selectedPlacementId !== undefined, contextToolsNext.shown];
  let isSortAndFilterOnBar2 = contextToolsNext.hasSortAndFilter;
  let arePeopleSelected = view.selectionSeen.cellsAre === 'person';
  let menuBarCommands = React.useCallback(
    () =>
      formatOfSelection === null
        ? []
        : searchMenuBarCommands(
            {
              whyNoToolForCells: isChartSelected ? chartMessages.toolIsNotForCharts() : null,
              formatOfSelection: formatOfSelection,
              sectionShows: sectionShows,
              isSortAndFilterOnBar: isSortAndFilterOnBar2,
              arePeopleSelected: arePeopleSelected,
              selectedRowCount: selectedRowCount,
              selectedColumnCount: selectedColumnCount,
              canMergeSelection: canMergeSelection && !isOneRangeNeeded,
              canUnmergeSelection: canUnmergeSelection && !isOneRangeNeeded,
              areGridlinesHidden: areGridlinesHidden,
              borderPen: borderPen,
              isOneRangeNeeded: isOneRangeNeeded,
              whyNoChart: chartNotice,
              canWriteFigures: hasFiguresToWrite,
              isPaneOfDropdownOpen: isSidePaneAboutDropdown,
              inserts: cellControlInsertChoices2,
            },
            {
              onFormatChosen: chooseCellFormatAtFoot,
              onBordersChosen: chooseBorders,
              onMergeChangeChosen: chooseMergeChange,
              onCheckboxesSet: setCheckboxesInToolbar,
              onSheetChangeChosen: chooseSheetChangeInToolbar,
              onFigureChosen: chooseFigureInToolbar,
              onSortPaneAsked: askSortPaneFromToolbar,
              onPaneOfDropdownAsked: toggleSidePane,
              onInsertChosen: insertCellControl2,
              onBorderPenChanged: changeBorderPen,
              onGridlinesToggled: toggleGridlines2,
              onLocaleAsked: workbookSettings.onLocaleAsked,
              onTimeZoneAsked: workbookSettings.onTimeZoneAsked,
              onPickerAsked(picker?: Dynamic) {
                if (picker === 'conditionalFormatting') return askRulesFromCells();
                onMenuOpenChange(picker, true, null);
                contextBarMenuOpenedByRef.current = menuOpenedByRef.current;
              },
            },
          ),
    [
      formatOfSelection,
      isChartSelected,
      sectionShows,
      isSortAndFilterOnBar2,
      arePeopleSelected,
      selectedRowCount,
      selectedColumnCount,
      canMergeSelection,
      canUnmergeSelection,
      areGridlinesHidden,
      borderPen,
      changeBorderPen,
      toggleGridlines2,
      isOneRangeNeeded,
      chartNotice,
      hasFiguresToWrite,
      isSidePaneAboutDropdown,
      cellControlInsertChoices2,
      chooseCellFormatAtFoot,
      chooseBorders,
      chooseMergeChange,
      setCheckboxesInToolbar,
      chooseSheetChangeInToolbar,
      chooseFigureInToolbar,
      askSortPaneFromToolbar,
      toggleSidePane,
      insertCellControl2,
      askRulesFromCells,
      onMenuOpenChange,
      workbookSettings,
    ],
  );
  let askVersionHistory = () => {
    leaveEntryIfEditing();
    store.dispatch({
      kind: 'versionHistoryAsked',
    });
  };
  let historyButtonDisabled = disabledByViewOnly(versionLook === null ? view.viewOnlyBecause : null);
  let pressHistoryInHeader = React.useEffectEvent((): void => {
    if (historyButtonDisabled.disabled || isModalOpen(view)) return;
    if (cellsRef.current !== null) closeOpenMenusAndPopovers(cellsRef.current.ownerDocument);
    isPointerPressedLastRef.current = true;
    isBeforeAnyInputRef.current = false;
    focusTrackerRef.current?.noteActInShell();
    askVersionHistory();
  });
  React.useEffect((): (() => void) | undefined => {
    if (!isHistoryControlInHeader) return;
    shell.offerHistory((): void => pressHistoryInHeader());
    return (): void => shell.offerHistory(null);
  }, [shell, isHistoryControlInHeader]);
  let viewMenu = jsx(ViewMenu, {
    gridZoom: gridZoom,
    side: areViewToolsAtFoot ? 'top' : 'bottom',
    onOpenChange: onZoomLayerOpenChange,
    whatHasCaretAfter: whatHasCaretAfter,
    wasPointerPressedLast: wasPointerPressedLast,
    onFitChartAsked: selectedPlacementIdOnPhone === undefined ? null : () => fitPlacedViewInSight(selectedPlacementIdOnPhone, false),
    areFormulasShown: view.areFormulasShown,
    isEntryOpen: view.mode.kind !== 'navigating',
    onFormulasShownToggled: toggleFormulasShown2,
    density: view.density,
    onDensityChosen: chooseDensity,
    undoAndRedo: view.undoAndRedo,
    onUndoOrRedoChosen: chooseUndoOrRedo,
    onFindAsked: openFindEmpty,
    onFindAndReplaceAsked: view.viewOnlyBecause === null ? openReplace : null,
    onListOfKeysAsked: askListOfKeys,
  });
  let commandsOfBar = () => {
    let root = cellsRef.current?.ownerDocument.documentElement;
    let shownIndex = view.listedSheets.findIndex(({ isShown: isShown }: Dynamic) => isShown);
    let shownSheet2 = view.listedSheets[shownIndex];
    return [
      ...menuBarCommands(),
      ...viewCommands(
        {
          areFormulasShown: view.areFormulasShown,
          isEntryOpen: view.mode.kind !== 'navigating',
          density: view.density,
          undoAndRedo:
            view.undoAndRedo === null || view.mode.kind !== 'navigating'
              ? view.undoAndRedo
              : {
                  undo: view.undoAndRedo.undo === 'nothingLeft' ? 'nothingLeft' : null,
                  redo: view.undoAndRedo.redo === 'nothingLeft' ? 'nothingLeft' : null,
                },
          theme: asThemeMode(root?.getAttribute(THEME_CHOSEN_ATTRIBUTE) ?? null),
        },
        {
          gridZoom: gridZoom,
          onFitChartAsked: selectedPlacementIdOnPhone === undefined ? null : () => fitPlacedViewInSight(selectedPlacementIdOnPhone, false),
          onFormulasShownToggled: toggleFormulasShown2,
          onDensityChosen: chooseDensity,
          onUndoOrRedoChosen: chooseUndoOrRedo,
          onFindAsked: openFindEmpty,
          onFindAndReplaceAsked: view.viewOnlyBecause === null ? openReplace : null,
          onListOfKeysAsked: askListOfKeys,
          onThemeChosen(theme?: Dynamic) {
            if (root !== undefined) chooseSheetsTheme(root, theme);
          },
        },
      ),
      ...(shownSheet2 === undefined
        ? []
        : sheetSearchCommands(
            {
              sheet: shownSheet2,
              isOnlySheet: view.listedSheets.length === 1,
              placeAmongTabs: {
                index: shownIndex,
                count: view.listedSheets.length,
              },
              viewOnlyBecause: view.viewOnlyBecause,
              isVersionHistoryOpen: view.versionHistory !== null,
              whyNoToolForCells: isChartSelected ? chartMessages.toolIsNotForCharts() : null,
            },
            {
              dispatch(event?: Dynamic) {
                if (event.kind === 'sheetRenameChosen') setTimesRenameBegunElsewhere((count?: Dynamic) => count + 1);
                dispatchFromSheetTabs(event);
              },
              onBlankChosen: blankSheetChooser(dispatchFromSheetList(view.listedSheets, dispatchFromSheetTabs)),
              onImportChosen: chooseImportFile,
              onVersionHistoryAsked: askVersionHistory,
              onAllFunctionsAsked: askAllFunctions,
              onAllSheetsAsked: null,
            },
          )),
      ...insertTools(
        {
          offers: atMenuOffers(new (Date as Dynamic)()),
          viewOnlyBecause: view.viewOnlyBecause,
          whyNoToolForCells: isChartSelected ? chartMessages.toolIsNotForCharts() : null,
          inserts: cellControlInsertChoices2,
          setMeets: view.menu?.setMeets ?? null,
        },
        {
          onFormatChosen: chooseCellFormatAtFoot,
          dispatch: (event?: Dynamic) => store.dispatch(event),
          onDayChosen: null,
        },
      ),
    ];
  };
  let askCostsInMenu = React.useCallback(
    () =>
      store.dispatch({
        kind: 'costsInMenuAsked',
      }),
    [store],
  );
  let functionCommandsState = {
    canEdit: view.viewOnlyBecause === null,
    isEntryOpen: view.mode.kind !== 'navigating',
  };
  let functionCommandsTold = {
    onFunctionChosen: (fn?: Dynamic) => pickFunctionWhenSettled(fn, store, returnFocusToEntry, watchCaretLeaving()),
  };
  let goToSheetAndColumnCommands2 = (words?: Dynamic) =>
    goToSheetAndColumnCommands(
      words,
      MOST_TYPED_COMMANDS,
      {
        sheet: view.grid,
        listedSheets: view.listedSheets,
        columnsToGoTo: view.columnsToGoTo ?? [],
      },
      store,
    );
  let commandsOfTyped = (words?: Dynamic) => {
    let colorCommands =
      formatOfSelection === null
        ? []
        : hexColorCommands(
            words,
            {
              whyNoToolForCells: isChartSelected ? chartMessages.toolIsNotForCharts() : null,
              formatOfSelection: formatOfSelection,
            },
            {
              onFormatChosen: chooseCellFormatAtFoot,
            },
          );
    if (colorCommands.length > 0)
      return {
        commands: colorCommands,
        isFirstMeant: false,
      };
    if (words.trimStart().startsWith('='))
      return {
        commands: functionCommandsForFormula(words, MOST_TYPED_COMMANDS, functionCommandsState, functionCommandsTold),
        isFirstMeant: true,
      };
    let borderCommands = borderCommandsFromWords(
      words,
      {
        whyNoToolForCells: isChartSelected ? chartMessages.toolIsNotForCharts() : null,
      },
      {
        onBordersChosen: chooseBorders,
      },
    );
    if (formatOfSelection !== null && borderCommands.length > 0)
      return {
        commands: borderCommands,
        isFirstMeant: true,
      };
    let formatCommands =
      formatOfSelection === null
        ? []
        : typedFontSizeCommands(
            words,
            {
              whyNoToolForCells: isChartSelected ? chartMessages.toolIsNotForCharts() : null,
              formatOfSelection: formatOfSelection,
            },
            {
              onFormatChosen: chooseCellFormatAtFoot,
            },
          );
    if (formatCommands.length > 0)
      return {
        commands: [...formatCommands, ...goToSheetAndColumnCommands2(words)],
        isFirstMeant: true,
      };
    let goToCommands = goToCellsCommands(
      words,
      {
        sheet: view.grid,
      },
      store,
    );
    return goToCommands.length === 0
      ? null
      : {
          commands: [...goToCommands, ...goToSheetAndColumnCommands2(words)],
          isFirstMeant: true,
        };
  };
  let commandsByName = (words?: Dynamic) => [
    ...commandsUnderHeading(goToLabel(), goToSheetAndColumnCommands2(words)),
    ...commandsUnderHeading(
      autocompleteFunctionsHeading(),
      functionCommandsForPrefix(words, MOST_TYPED_COMMANDS, functionCommandsState, functionCommandsTold),
    ),
  ];
  let {
    ownFilterBar: ownFilterBar,
    hasFilterNotDrawnYet: hasFilterNotDrawnYet,
    recordsUnderFilterNotDrawnYet: recordsUnderFilterNotDrawnYet,
  } = view;
  let shownSheetId = shownSheetIdOf(view);
  let filterBarAnnounced = React.useMemo(
    () =>
      filterBarToAnnounce(
        {
          ownFilterBar: ownFilterBar,
          hasFilterNotDrawnYet: hasFilterNotDrawnYet,
          recordsUnderFilterNotDrawnYet: recordsUnderFilterNotDrawnYet,
        },
        shownSheetId,
      ),
    [ownFilterBar, hasFilterNotDrawnYet, recordsUnderFilterNotDrawnYet, shownSheetId],
  );
  if ((view.ownFilterBar !== null || isFilterNotDrawnYet) && isFilterCleared) setIsFilterCleared(false);
  let askAgentFromWaysIn = () => {
    let wasInWaysIn = footNoticeRef.current?.contains((document as Dynamic).activeElement) === true;
    openChatAboutBlankSheet();
    noteAgentAsked();
    lastProgrammaticActMsRef.current = performance.now();
    if (wasInWaysIn)
      getTypingTargetElement()?.focus({
        preventScroll: true,
      });
  };
  let isWaysInCovered = isAgentAsked || isWaysInMenuOpen || isNonWaysInLayerHeldBack || view.contextBarMenu !== null || view.menu !== null;
  let { areSeen: areWaysInSeen, askAgent: askAgentFromWaysInOffer } = useWaysInShown({
    areDue: areWaysInUp,
    mayBeSeen: !isWaysInCovered,
    offered: !view.isAgentOfferedAmongWaysIn || isChatToBeHad === false ? null : isChatToBeHad === null ? 'awaited' : askAgentFromWaysIn,
  });
  useWaysInOutOfSightReport(store, areWaysInUp && isWaysInCovered);
  useEscapeSendsWaysInAway(store, areWaysInUp && !isWaysInCovered);
  let waysInFocus = useWaysInFocusKeeping({
    findWaysIn: () => footNoticeRef.current,
    areWaysInDue: () => store.getView().waysIn === 'areUp',
    giveToCells: () =>
      getTypingTargetElement()?.focus({
        preventScroll: true,
      }),
  });
  let onWaysInKeyDown = (event?: Dynamic) => {
    onPartKeyDown(event, 'waysIn', 'ofWaysIn');
    let wasPrevented = event.defaultPrevented;
    onToolsKeyDownForCells(event, 'ofWaysIn', null);
    if (!wasPrevented && event.defaultPrevented)
      getTypingTargetElement()?.focus({
        preventScroll: true,
      });
  };
  let sheetsPage = jsxs('div', {
    ref: listenForListUnderCellEvents,
    className: `relative flex h-full flex-col ${sheetBesideSidePaneProps2.className}`,
    style: sheetBesideSidePaneProps2.style,
    'data-draws-entry-larger': gridNow.editorScale > 1 || undefined,
    onPointerDownCapture: (event?: Dynamic) => {
      takeViewBack();
      let isInCells = event.target instanceof Node && cellsRef.current?.contains(event.target) === true;
      actsCountRef.current += 1;
      let isTouch = event.pointerType === 'touch';
      if (pressGuard.isPressSwallowed(isInCells && event.buttons !== 0, isTouch)) {
        event.stopPropagation();
        if (!isTouch) event.preventDefault();
      }
      isEscapeHeldInEditRef.current = false;
      isPointerPressedLastRef.current = event.buttons !== 0;
      isBeforeAnyInputRef.current = false;
      if (isPointerPressedLastRef.current) lastFocusedByKeyRef.current = null;
      wasFocusLostToNothingRef.current = false;
      let { target: target } = event;
      wasPressInAskBoxRef.current = isInPlacedViewAskBox(target);
      isFilterListLeftByPressRef.current = true;
      if (!(target instanceof Node)) return;
      if ([cellsRef, formulaBarRef].some(({ current: current }: Dynamic) => current?.contains(target) === true)) forgetComeToByTab();
      let isPressAfterTimeOrKey = isPressOnActiveCellAfterLeave(event);
      settleFocusLeft(isPressAfterTimeOrKey ? 'timeOrKey' : 'pressOrFocus');
      if (!isPressAfterTimeOrKey || store.getView().mode.kind !== 'editing') return;
      event.stopPropagation();
      event.preventDefault();
    },
    onKeyDownCapture: (event?: Dynamic) => {
      let { key: key, nativeEvent: nativeEvent, target: target } = event;
      lastKeyDownRef.current = nativeEvent;
      if (!nativeEvent.repeat) wasTabKeyDownRef.current = false;
      wasPressInAskBoxRef.current = isInPlacedViewAskBox(target);
      if (nativeEvent.getModifierState(key)) return;
      actsCountRef.current += 1;
      if (nativeEvent.isTrusted && !nativeEvent.repeat) isPointerHeldOutsideRef.current = true;
      isPointerPressedLastRef.current = false;
      isBeforeAnyInputRef.current = false;
      let isEscapeHeld =
        isEscapeHeldInEditRef.current && key === 'Escape' && store.getView().mode.kind === 'editing' && !isFieldInList(target);
      if (!isEscapeHeld || !nativeEvent.repeat) isEscapeHeldInEditRef.current = false;
      if (isEscapeHeld) {
        event.preventDefault();
        return event.stopPropagation();
      }
      if (
        [cellEditorRef, gridFocusRef, activeEditorRef, formulaBarRef].some(({ current: current }: Dynamic) => current === target) &&
        doesKeyStepBackIntoCellsButF6(key)
      )
        forgetComeToByTab();
      let isEscapeInTypingTarget =
        key === 'Escape' && target === getGridOrEditorElement() && !isAltShortcutKey(event) && !isCommandHeld(event);
      let { isFollowingPerson: isFollowingPerson, escapeInCells: escapeInCells } = store.getView();
      if (!isEscapeInTypingTarget || !isFollowingPerson || escapeInCells !== 'letsGo') takeViewBack();
      if (isListUnderCellRow(target) && key !== 'Enter' && key !== ' ') {
        if (doesKeyStepBackIntoCellsButF6(key)) forgetComeToByTab();
        return (
          getTypingTargetElement()?.focus({
            preventScroll: true,
          }),
          event.stopPropagation(),
          onCellsKeyDown(event)
        );
      }
      let { mode: mode2, functionList: functionList, isCommentModeOn: isCommentModeOn } = store.getView();
      if (key !== 'Escape' || mode2.kind !== 'editing' || functionList !== null || isCommentModeOn) return;
      let toolbarPart =
        target instanceof Node
          ? toolPartWithMenuHolding(target, {
              functionsButton: functionsButtonRef.current,
              viewTools: shownViewToolsRef.current,
              formatTools: formatToolsRef.current,
              barOfReader: readerBarRef.current,
            })
          : undefined;
      if (toolbarPart === undefined || event.isDefaultPrevented()) return;
      onPartKeyDown(event, toolbarPart.part, toolbarPart.ownMenu);
      if (!event.isDefaultPrevented()) return;
      event.stopPropagation();
      isEscapeHeldInEditRef.current = true;
    },
    onKeyUpCapture: ({ target: target, nativeEvent: nativeEvent }: Dynamic) => {
      if (!isTrustedPlainTab(nativeEvent, wasTabKeyDownRef.current)) return;
      wasTabKeyDownRef.current = false;
      if (target === getGridOrEditorElement() && store.getView().mode.kind === 'navigating') markComeToByTab();
    },
    onPointerUpCapture: swallowRestOfPress2,
    onPointerCancelCapture: swallowRestOfPress2,
    onMouseUpCapture: swallowRestOfPress2,
    onMouseDownCapture: (event?: Dynamic) => {
      if (pressGuard.isRestOfPressSwallowed()) event.preventDefault();
      swallowRestOfPress2(event);
    },
    onDoubleClickCapture: (event?: Dynamic) => {
      if (pressGuard.isDoubleClickSwallowed()) event.stopPropagation();
    },
    onContextMenuCapture: (event?: Dynamic) => {
      if (!pressGuard.isMenuSwallowed()) return;
      event.stopPropagation();
      event.preventDefault();
    },
    onClickCapture: (event?: Dynamic) => {
      let { detail: detail, target: target } = event;
      takeViewBack();
      if (pressGuard.isClickSwallowed(detail > 0)) event.stopPropagation();
      let isFileInput = target instanceof HTMLInputElement && target.type === 'file';
      if (detail === 0 && !isFileInput) {
        isPointerPressedLastRef.current = false;
        isBeforeAnyInputRef.current = false;
      }
      if (target instanceof Node && cellsRef.current?.contains(target) === true) forgetComeToByTab();
    },
    onFocus: ({ target: target, relatedTarget: relatedTarget, currentTarget: currentTarget }: Dynamic) => {
      let lastKey = lastKeyDownRef.current?.key;
      lastKeyDownRef.current = null;
      isEscapeHeldInEditRef.current = false;
      if (target !== cellEditorRef.current && target !== gridFocusRef.current) forgetComeToByTab();
      wasFocusLostToNothingRef.current = relatedTarget === null;
      focusBeforeMenuRef.current = null;
      let isInside = (ref?: Dynamic) => ref.current?.contains(target) === true;
      let isInTools = isInside(shownViewToolsRef) || isInside(formatToolsRef) || isInside(readerBarRef);
      let isInPaneOrPlacement =
        isInside(sidePaneRef) || isInside(findBarRef) || isInside(replaceFieldRef) || placementIdOfElement(target) !== null;
      if (isEditKeptOnBlurRef.current && isInPaneOrPlacement) loseFocus(false);
      isEditKeptOnBlurRef.current = false;
      let isTabbedIn =
        (lastKey === 'Tab' || lastKey === 'F6') && currentTarget.contains(relatedTarget) && sidePaneRef.current?.contains(relatedTarget) !== true;
      if (isInTools && target instanceof HTMLElement && !isPointerPressedLastRef.current) lastFocusedByKeyRef.current = target;
      else if (currentTarget.contains(target) && (!isInside(sidePaneRef) || isTabbedIn)) lastFocusedByKeyRef.current = null;
      let blurredPart = getSelectedPlacementId();
      if (blurredPart !== null) onPlacedViewCaret(blurredPart, 'left', target);
      focusWrapperRef.current = isWrapperOfDisabledControl(target) ? target : null;
      if ((relatedTarget === null || placementIdOfElement(relatedTarget) !== null) && focusControlInWrapper(target) !== null) return;
      if (target === getGridOrEditorElement() && focusLeftRef.current?.left.place === 'grid') return;
      fieldLeftForMenuRef.current = null;
      let placeLeft = focusLeftRef.current?.left.place;
      if (!(store.isEventUnfinished() && (placeLeft === 'cell' || placeLeft === 'formulaBar') && placeOfField(target) === placeLeft))
        settleFocusLeft('pressOrFocus');
      let isFocusKeptOnRow = isRowFocusOnIos({
        isWebKitOfIos: IS_IOS_BROWSER,
        isRow: isListUnderCellRow(target),
        isPressUnderWay: focusTrackerRef.current?.isUnderWay() === true,
        isEntryOpen: store.getView().mode.kind !== 'navigating',
      });
      focusKeptOnListRowRef.current = isFocusKeptOnRow ? target : null;
      if (isInListUnderCell(target) && !isFieldInList(target) && !isFocusKeptOnRow)
        getTypingTargetElement()?.focus({
          preventScroll: true,
        });
    },
    onBlur: (event?: Dynamic) => {
      if (isBlurringByCodeRef.current) return;
      let isFromFormulaBar = event.target === formulaBarRef.current;
      if (event.relatedTarget === null) focusBeforeMenuRef.current = event.target;
      if (isInListUnderCell(event.relatedTarget)) return;
      if ((event.relatedTarget ?? event.target).closest(`[${LINK_FORM_ATTR}]`) !== null && store.getView().mode.kind === 'editing') return;
      let isToFunctionsButton = calendarPopupRef.current?.contains(event.relatedTarget) === true;
      let isInContextBarPart = (event.relatedTarget ?? event.target).closest(`[${CONTEXT_BAR_PART_ATTRIBUTE}]`) !== null;
      let isToSidePane = sidePaneRef.current?.contains(event.relatedTarget) === true;
      let isToFindFields =
        event.relatedTarget !== null && [findBarRef, replaceFieldRef].some((input?: Dynamic) => input.current === event.relatedTarget);
      let isToPlacement = placementIdOfElement(event.relatedTarget) !== null;
      let isOutOfPage = !event.currentTarget.contains(event.relatedTarget);
      let isFieldInListLeft = isFieldInList(event.target) && !isToSidePane && !isToFindFields && !isToPlacement;
      if (isInContextBarPart || isFieldInListLeft) return;
      if (isFocusWithinSameMenu(event.target, event.relatedTarget)) return;
      let isFromEntry = [activeEditorRef, formulaBarRef, cellEditorRef].some((input?: Dynamic) => input.current === event.target);
      let isToOwnPart = isToSidePane || isToFindFields || isToPlacement;
      let isToFocusGuard = event.relatedTarget?.hasAttribute('data-base-ui-focus-guard') === true;
      if (isFormulaAskedOrProposed(store.getView()) && (!isFromEntry || isToFocusGuard) && !isToOwnPart) return;
      let isLeftByPress = event.relatedTarget === null && noteFieldLeft(event.target);
      let wasPressedInFormulaBar = isFocusMoveExpectedRef.current;
      if (isFromFormulaBar && event.relatedTarget !== null) isFocusMoveExpectedRef.current = false;
      if (
        isFromFormulaBar &&
        !wasPressedInFormulaBar &&
        !isToFunctionsButton &&
        !isToOwnPart &&
        !isOutOfPage &&
        !isFormulaAskedOrProposed(store.getView()) &&
        ![activeEditorRef, cellEditorRef, gridFocusRef].some((input?: Dynamic) => input.current === event.relatedTarget) &&
        functionsButtonRef.current?.contains(event.relatedTarget) !== true &&
        isEntryUntouched(store.getView().mode) &&
        !store.isWorkYetToReachWorkbook()
      ) {
        store.dispatch({
          kind: 'entryLeft',
        });
        return store.lookOnceEventsAreFinished(() => {
          if (whereTypingGoes(store.getView()) === 'grid') lastTypingTargetRef.current = 'grid';
        });
      }
      if (isToFunctionsButton || !(isToSidePane || isToFindFields || isToPlacement || isOutOfPage)) return;
      if (event.relatedTarget !== null) return loseFocus(isLeftByPress);
      let { target: target } = event;
      return whenBlurredToNothing(target, (isToNothing?: Dynamic) => {
        let wasStillFocused = isToNothing && target.ownerDocument.activeElement === target;
        loseFocus(isLeftByPress);
        if (wasStillFocused) restoreFocus();
      });
    },
    children: [
      jsxs('div', {
        ref: formulaRowRef,
        className: 'sheet-formula-row',
        style: headerRoomStyle,
        children: [
          jsx('span', {
            id: CELL_ADDRESS_ID,
            hidden: true,
            children: view.allSelectedText,
          }),
          isViewOnly
            ? jsx('span', {
                'aria-hidden': true,
                className: 'sheet-formula-sign',
                children: jsx(Icon, {
                  name: FUNCTION_ICON_PROPS.icon,
                  size: 'auto',
                }),
              })
            : jsx('span', {
                ref: functionsButtonRef,
                role: 'presentation',
                className: 'sheet-formula-sign',
                onMouseDown: preventMouseDownDefault,
                onKeyDown: onFunctionsButtonKeyDown,
                onKeyDownCapture: onFunctionListKeyDown,
                children: jsx(Button, {
                  variant: 'ghost',
                  iconOnly: true,
                  icon: FUNCTION_ICON_PROPS.icon,
                  className: 'text-muted',
                  'aria-label': functionListLabel(),
                  'aria-haspopup': 'listbox',
                  'aria-expanded': view.functionList !== null,
                  tooltipSide: 'bottom',
                  ...{
                    [OPENS_FUNCTION_LIST_ATTRIBUTE]: true,
                  },
                  onClick: askAllFunctions,
                }),
              }),
          jsx(WaitForFormula, {
            stage: formulaFromWords.stage,
          }),
          jsx(
            'textarea',
            {
              ref: setFormulaBarElement,
              rows: Math.min(formulaBarLines.lineCountWithCaret, isNarrowPhone ? FORMULA_FIELD_MAX_ROWS_OPENED : FORMULA_FIELD_MAX_ROWS),
              'data-has-lines': formulaBarLines.opensAsCard || undefined,
              'data-folds-lines': formulaBarLines.areLinesFolded || undefined,
              'data-is-first-line-cut': formulaBarLines.isFirstLineCut || undefined,
              'data-is-first-line-of-several': formulaBarLines.widthOfFirstLineOfSeveral !== null || undefined,
              style: firstLineWidthStyle2,
              id: FORMULA_FIELD_ID,
              'data-comment-target': '',
              className: 'sheet-formula-field',
              'data-is-under-hues': areReferencesWritten || undefined,
              'aria-label': sheetMessages.formulaBar(),
              'aria-describedby': CELL_ADDRESS_ID,
              'aria-busy': formulaFromWords.stage?.kind === 'asked' || undefined,
              ...comboboxAriaProps(
                false,
                peopleList?.under === 'formulaBar'
                  ? peopleListCardIds(peopleList)
                  : view.functionList !== null && typingTarget === 'formulaBar'
                    ? functionListActiveDescendant(view.functionList)
                    : typingTarget === 'formulaBar'
                      ? formulaOfferActiveDescendant(formulaFromWords)
                      : null,
              ),
              ...PLAIN_TEXT_FIELD_PROPS,
              readOnly: view.isFormulaBarReadOnly || view.formulaOfFixOnEntryCell !== null,
              value: view.formulaOfFixOnEntryCell === null ? view.formulaBarText : '',
              placeholder: view.formulaOfFixOnEntryCell ?? view.formulaSpilledOverEntryCell ?? formulaBarPlaceholder(view),
              'data-shows-formula':
                isFormulaText(
                  view.formulaOfFixOnEntryCell ?? (view.formulaBarText === '' ? (view.formulaSpilledOverEntryCell ?? '') : view.formulaBarText),
                ) || undefined,
              onChange: (event?: Dynamic) => onFieldInput('formulaBar', event),
              onFocus: ({ relatedTarget: relatedTarget, currentTarget: formulaBar }: Dynamic) => {
                let lastKeyEvent = lastKeyDownRef.current;
                let isToSelectAll = isFocusMovingByCodeRef.current || didFocusLeaveByTab2(relatedTarget);
                let isTabbedIn =
                  (focusLeftRef.current !== null && relatedTarget === null) ||
                  (wasFocusLostToNothingRef.current && relatedTarget !== null && lastKeyEvent === null);
                if (isToSelectAll && !isFocusMovingByCodeRef.current) formulaBar.select();
                let isCaretToEnd =
                  isEditKeptOnBlurRef.current &&
                  relatedTarget === null &&
                  focusTrackerRef.current?.isUnderWay() !== true &&
                  !isFocusingFieldRef.current;
                let putCaretAtEnd = () => formulaBar.setSelectionRange(formulaBar.value.length, formulaBar.value.length);
                if (isCaretToEnd) putCaretAtEnd();
                if (isTabbedIn || isCaretToEnd) isPointerPressedLastRef.current = false;
                if (isTabbedIn) isBeforeAnyInputRef.current = false;
                if (isToSelectAll || isTabbedIn) wasFormulaBarFocusedRef.current = true;
                formulaBar.toggleAttribute(HAS_FOCUS_BY_KEY_ATTRIBUTE, !isPointerPressedLastRef.current);
                if (isToSelectAll || isTabbedIn || isCaretToEnd)
                  setTimeout(() => {
                    let lastKeyEvent2 = lastKeyDownRef.current;
                    let isHeld =
                      (lastKeyEvent2 !== null && !lastKeyEvent2.getModifierState(lastKeyEvent2.key)) || isPointerPressedLastRef.current;
                    let isCaretAtStart = formulaBar === formulaBar.ownerDocument.activeElement && formulaBar.selectionEnd === 0;
                    if (isCaretAtStart && !isHeld && isCaretToEnd) putCaretAtEnd();
                    else if (isCaretAtStart && !isHeld) formulaBar.select();
                  });
                let scrollToCaretAtEnd2 = () => {
                  if (formulaBar === formulaBar.ownerDocument.activeElement && formulaBar.selectionStart === formulaBar.value.length)
                    formulaBar.scrollTop = formulaBar.scrollHeight;
                };
                if (!isPointerPressedLastRef.current) scrollToCaretAtEnd2();
                if (!isPointerPressedLastRef.current) setTimeout(scrollToCaretAtEnd2);
                moveEntryToUnlessThere('formulaBar');
              },
              onBlur: ({ currentTarget: formulaBar, relatedTarget: relatedTarget }: Dynamic) => {
                formulaBar.scrollTo(0, 0);
                formulaBar.removeAttribute(HAS_FOCUS_BY_KEY_ATTRIBUTE);
                if (relatedTarget !== null) wasFormulaBarFocusedRef.current = false;
              },
              onPointerDown: ({ button: button, buttons: buttons, pointerType: pointerType, currentTarget: formulaBar }: Dynamic) => {
                wasFormulaBarFocusedRef.current = false;
                if (buttons !== 0) {
                  formulaBar.removeAttribute(HAS_FOCUS_BY_KEY_ATTRIBUTE);
                  isFocusMoveExpectedRef.current = true;
                }
                if (button === 0 && pointerType !== 'touch') forgetCaretPlacement(formulaBar, store.getView().mode);
              },
              onClick: moveEntryToFormulaBar,
              onKeyDown: onFieldKeyDown,
            },
            formulaBarKey,
          ),
          (areReferencesWritten || view.matchingBrackets !== null) &&
            !isComposing &&
            mode.kind === 'editing' &&
            mode.text === view.formulaBarText &&
            jsx(
              FormulaBarReferenceHues,
              {
                text: view.formulaBarText,
                references: view.referencesInEntry,
                brackets: view.matchingBrackets,
                box: formulaBarRef,
              },
              `${formulaBarKey} ${typingTarget} ${JSON.stringify(formulaBarLines)} ${isNarrowPhone}`,
            ),
          !areViewToolsAtFoot &&
            jsx('div', {
              ref: setViewToolsInRowElement,
              role: 'presentation',
              className: 'sheet-view-tools',
              onMouseDown: preventMouseDownDefault,
              onKeyDown: onViewToolsKeyDown,
              children: jsxs(TooltipGroup, {
                children: [
                  viewMenu,
                  view.viewOnlyBecause !== 'readOnly' &&
                    !isHistoryControlInHeader &&
                    jsx(Button, {
                      variant: 'ghost',
                      iconOnly: true,
                      icon: 'History',
                      'aria-label': versionHistoryMessages.title(),
                      pressed: view.versionHistory !== null,
                      ...historyButtonDisabled,
                      onClick: askVersionHistory,
                    }),
                ],
              }),
            }),
        ],
      }),
      jsx(ThemeChangeNotice, {
        zoomButton: getViewToolsButton,
        side: areViewToolsAtFoot ? 'top' : 'bottom',
        isEntryOpen: view.mode.kind !== 'navigating',
        whatHasCaretAfter: whatHasCaretAfter,
      }),
      jsx(SelectedRangeAnnouncer, {
        selectedRange: view.selectedRange,
      }),
      jsx(PointedCellsAnnouncer, {
        pointedCells: view.pointedCells,
        isEntryOpen: mode.kind === 'editing',
      }),
      jsx(AgentSaidAnnouncer, {
        said: view.saidOfAgent,
        doneByAgent: view.doneByAgent,
      }),
      jsx(EarlierVersionAnnouncer, {
        look: versionLook,
        isEarlierVersionLeft: isEarlierVersionLeft,
      }),
      jsx(CellsAddedAnnouncer, {
        store: store,
        chat: cellsAddedToChat,
        placeOfKeyboard: whereIsFocus,
      }),
      jsx(WaysInHintAnnouncer, {
        areUp: areWaysInSeen,
        canAskAgent: typeof askAgentFromWaysInOffer === 'function',
        wordsOfLoad: wordsOfLoad,
      }),
      jsx('span', {
        id: FORMULAS_SHOWN_ID,
        hidden: true,
        children: describeLastDone({
          what: 'formulasShown',
        }),
      }),
      jsx('span', {
        id: KEY_TO_LIST_OF_KEYS_ID,
        hidden: true,
        children: shortcutListMessages.keyThatOpensIt(IS_APPLE_PLATFORM),
      }),
      IS_IOS_BROWSER &&
        jsx(ReaderPageAnnouncer, {
          grid: gridNow,
        }),
      jsx(LiveAnnouncer, {
        words: lastDoneWords !== null && lastDoneWords.what !== 'replaced' && describeLastDone(lastDoneWords),
        timesSaid: view.lastDone === null ? 0 : objectKey(view.lastDone),
      }),
      jsx(LiveAnnouncer, {
        words: saveLineWords ?? (connectionBackSay === 'backSaid' ? reconnectedText() : null),
      }),
      isRetryingLong &&
        jsx('div', {
          role: 'alert',
          className: 'sr-only',
          children: saveStatus,
        }),
      jsx(LiveAnnouncer, {
        words:
          view.calculating === 'wrong'
            ? formulasTookTooLongWords()
            : view.isLongCalculationTold
              ? calculatingFormulasText()
              : longCalculationSay === 'endSaid' && formulasCalculatedText(),
      }),
      jsx(OpenedWordsAnnouncer, {
        words:
          dropdownList !== null &&
          ((mode.kind === 'navigating' && (dropdownAriaOnIos?.highlightedRowId ?? null) === null) || highlightedDropdownRow?.kind === 'add') &&
          (listAnnouncement(dropdownList.card) ?? dropdownListSpokenWords(dropdownList)),
        isEntryOpen: mode.kind !== 'navigating',
        store: store,
        inPageOf: cellsRef,
      }),
      jsx(FilterBarAnnouncer, {
        bar: filterBarAnnounced,
        isCleared: isFilterCleared,
      }),
      jsx(WordsOfferedAnnouncer, {
        words: view.wordsOfferedSaid,
        hasGone: view.isOfferGoneToBeSaid,
        isKeyDrawn: isOfferKeyDrawn,
      }),
      jsx(PeopleListAnnouncer, {
        list: peopleList,
      }),
      jsx(LiveAnnouncer, {
        words: peopleList !== null && peopleList.inField !== null && peopleListLabel(peopleList),
      }),
      jsx(LiveAnnouncer, {
        words:
          view.linkExplained !== null &&
          view.linkExplained.marked !== null &&
          linkPositionText(
            view.linkExplained.marked + 1,
            view.linkExplained.urls.length,
            view.linkExplained.urls[view.linkExplained.marked] ?? '',
            view.linkExplained.areKeysNewOnCard,
          ),
      }),
      jsx(LiveAnnouncer, {
        words: personChipGoneTo !== undefined && personChipRemoveHint(personChipGoneTo.name),
      }),
      jsx(LiveAnnouncer, {
        words:
          peopleListAnnouncement2 !== null
            ? !isComboboxInCell && peopleListAnnouncement2
            : highlightedPerson !== undefined &&
              (mode.kind === 'navigating' || !isComboboxInCell || highlightedPerson.kind === 'keepAsText') &&
              peopleListRowWords(highlightedPerson),
      }),
      (saveStatusCard2 !== null ||
        view.fractionSavedToShow !== null ||
        nextIsLongSaveTold2 ||
        view.isLongCalculationTold ||
        allSavedSay === 'said') &&
        jsx(SaveStatusToast, {
          card: saveStatusCard2,
          fractionSaved: view.fractionSavedToShow,
          isLongSaveTold: nextIsLongSaveTold2,
          isLongCalculationTold: view.isLongCalculationTold,
          isAllSavedSaid: allSavedSay === 'said',
          action:
            saveStatusCard2?.offersReload === true && reloadPage !== null
              ? jsx(ReloadPageButton, {
                  reload: reloadPage,
                })
              : undefined,
          onUp: () => {
            setAnnouncedConnectionWords(connectionWords);
            if (view.saving === 'retrying' && saveStatusCard2?.isAboutConnection === false) setAllSavedSay('owed');
          },
          onBarUp: () => setAllSavedSay('owed'),
        }),
      jsx(ErrorsAtOpeningAnnouncer, {
        store: store,
        wordsOfLoad: wordsOfLoad,
        inPageOf: cellsRef,
        isToastUp: isErrorsAtOpeningOffered,
      }),
      isErrorsAtOpeningOffered &&
        jsx(
          ErrorsAtOpeningToast,
          {
            count: view.errorsAtOpening.count,
            onAgentAsked: (isInPlace?: Dynamic) => void askFixesOfErrorsAtOpening(isInPlace),
            onTakenDown: closeToastIfInsideUnpinned,
            cells: view.errorsAtOpening.cells,
            canAttach: mode.kind !== 'editing' && (view.selectionByAddress !== null || view.isOneRangeNeeded),
            fixedHere: !areFixesOnOffer2 ? 'no' : view.errorsAtOpening.areFixesHeldBack || fixesStage === 'undecided' ? 'notNow' : 'now',
            onDismissed: () => {
              let errorsAtOpening = store.getView().errorsAtOpening;
              if (errorsAtOpening === null) return;
              noteErrorsKnownOf(errorsAtOpening.sheetId, errorsAtOpening.count);
              store.dispatch({
                kind: 'errorsAtOpeningPutAway',
                sheetId: errorsAtOpening.sheetId,
              });
              whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
            },
          },
          view.errorsAtOpening.sheetId,
        ),
      view.undoOffer !== null &&
        view.undoOffer.kind !== 'moveReplacedCells' &&
        jsx(UndoOfferToast, {
          offer: view.undoOffer,
          onTaken: () =>
            store.dispatch({
              kind: 'undoOfferTaken',
            }),
          onDismissed: () => {
            store.dispatch({
              kind: 'undoOfferDismissed',
            });
            whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
          },
        }),
      jsx(NoFixAnnouncer, {
        why: view.noticeOfNoFix?.why ?? null,
        isChatOffered: canPersonEdit && isChatToBeHad === true,
      }),
      view.noticeOfNoFix !== null &&
        jsx(
          NoFixToast,
          {
            why: view.noticeOfNoFix.why,
            isChatOffered: canPersonEdit && isChatToBeHad === true,
            canAttach: mode.kind !== 'editing' && (view.selectionByAddress !== null || view.isOneRangeNeeded),
            onAgentAsked: () => void askChatAfterNoFix2(),
            onOver: ({ byUser: byUser }: Dynamic) => {
              store.dispatch({
                kind: 'noticeOfNoFixPutAway',
              });
              if (byUser) whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
            },
            onTakenDown: closeToastIfInsideUnpinned,
          },
          `${view.noticeOfNoFix.cells} ${view.noticeOfNoFix.why}`,
        ),
      chartMaking?.is === 'notAdded' &&
        jsx(
          ChartNotAddedToast,
          {
            why: chartMaking.why,
            onGone: (isToCloseToast?: Dynamic) => dropChartMaking(chartMaking.nth, isToCloseToast),
          },
          chartMaking.nth,
        ),
      chartChangeUndoNotice !== null &&
        jsx(
          MountedToast,
          {
            words: chartChangeOutcomeWords(chartChangeUndoNotice.says),
            ...(stepOfChartChange !== null && {
              action: jsx(Button, {
                variant: 'secondary',
                size: 'sm',
                'aria-label': chartMessages.undoChangeOfChart(),
                onClick: undoChartChange,
                children: sheetMessages.undo(),
              }),
            }),
            staysUntilClosed: false,
            onOver: ({ byUser: byUser }: Dynamic) => {
              setChartChangeUndoNotice(null);
              if (byUser) whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
            },
            onTakenDown: closeToastIfInsideUnpinned,
          },
          chartChangeUndoNotice.nodes.to,
        ),
      jsx(UndoOfferAnnouncer, {
        store: store,
        inPageOf: cellsRef,
      }),
      jsx(SettledWordsAnnouncer, {
        words: chartAddedAnnouncement(chartMaking?.is === 'notAdded' ? chartMaking : addedChartOnCard, true),
        about: chartMaking === null ? null : String(chartMaking.nth),
        store: store,
        inPageOf: cellsRef,
      }),
      jsx(SettledWordsAnnouncer, {
        words: chartChangeUndoNotice === null ? null : chartChangeOutcomeWords(chartChangeUndoNotice.says),
        about: chartChangeUndoNotice?.nodes.to ?? null,
        store: store,
        inPageOf: cellsRef,
      }),
      notice !== null &&
        jsx(
          'div',
          {
            role: 'alert',
            className: 'sr-only',
            children: (isSavingStoppedRefusal(notice) ? saveStatus : null) ?? noticeText(notice),
          },
          `said ${objectKey(notice)}`,
        ),
      notice !== null &&
        !isNoticeShown &&
        jsx(
          MountedToast,
          {
            words: noticeText(notice),
            ...(notice.kind === 'callsForFixesFailed' && WARNING_TOAST_ICON_PROPS),
            staysUntilClosed: !noticeGivesWay(notice) || mode.kind === 'editing',
            onOver: ({ byUser: byUser }: Dynamic) => {
              store.dispatch({
                kind: 'noticeDismissed',
                notice: notice,
              });
              if (byUser) whenFocusStays(closeToastIfFocusLeft, 'dispatchesNothing');
            },
            onTakenDown: closeToastIfInsideUnpinned,
          },
          `toast ${objectKey(notice)}`,
        ),
      wasSomethingKeptOff &&
        jsx('div', {
          role: 'alert',
          className: 'sr-only',
          children: agentMissedMessageText(),
        }),
      wasSomethingKeptOff &&
        jsx(MountedToast, {
          words: agentMissedMessageText(),
          staysUntilClosed: true,
          onOver: () => {},
          onTakenDown: closeToastIfInsideUnpinned,
        }),
      isEditingBackNoticeShown &&
        jsx(MountedToast, {
          words: editingBackOnText(),
          staysUntilClosed: false,
          onOver: () => {
            setIsEditingBackNoticeShown(false);
            closeToastIfInsideUnpinned();
          },
          onTakenDown: closeToastIfInsideUnpinned,
        }),
      jsx(SortsByOthersToast, {
        source: sortsByOthers,
        sheetId: shownSheet?.sheetId,
        isHeldBack: [view.undoOffer, view.notice, view.newsOfLoss, chartMaking?.is === 'notAdded' ? chartMaking : null, chartChangeUndoNotice].some(
          (input?: Dynamic) => input !== null,
        ),
        store: store,
        inPageOf: cellsRef,
        onToastUp: () => observeToasts(),
        onTakenDown: closeToastIfInsideUnpinned,
      }),
      jsx(AgentUnavailableToast, {
        store: store,
        chat: chatWithAgent,
        placeOfKeyboard: whereIsFocus,
        hasWindowFocus: hasPageFocus,
        isSaidElsewhere: ({ pressed: pressed, chartId: chartId, request: request }: Dynamic) =>
          pressed === INSERT_CHART_LABEL
            ? chatWithAgent.isToBeHad() !== true
            : chartId !== undefined && request !== undefined && chatWithAgent.isToBeHad() !== false,
        standInFor: askCellsMenu,
        onToastUp: () => observeToasts(),
        onGone: closeToastIfInsideUnpinned,
      }),
      jsx(AddedToMessageToast, {
        store: store,
        chat: cellsAddedToChat,
        placeOfKeyboard: whereIsFocus,
        hasWindowFocus: hasPageFocus,
        isAgentWorking: view.isAgentWorking,
        onGone: closeToastIfInsideUnpinned,
      }),
      commentsLayer,
      jsx(LiveAnnouncer, {
        words: doesCommentModePickCells && commentModeHint(likelyHasKeyboard2),
      }),
      doesCommentModePickCells &&
        !view.hasCommentModeRefused &&
        jsx(MountedToast, {
          words: commentModeHint(likelyHasKeyboard2),
          staysUntilClosed: false,
          onOver: closeToastIfInsideUnpinned,
          onTakenDown: closeToastIfInsideUnpinned,
        }),
      newsOfLoss !== null &&
        jsx(
          'div',
          {
            role: 'alert',
            className: 'sr-only',
            children: noticeText(newsOfLoss),
          },
          `said ${objectKey(newsOfLoss)}`,
        ),
      newsOfLoss !== null &&
        jsx(
          MountedToast,
          {
            words: noticeText(newsOfLoss),
            staysUntilClosed: true,
            onOver: () => {
              store.dispatch({
                kind: 'noticeDismissed',
                notice: newsOfLoss,
              });
              closeToastIfInsideUnpinned();
            },
            onTakenDown: closeToastIfInsideUnpinned,
          },
          `toast ${objectKey(newsOfLoss)}`,
        ),
      jsx(SortFilterCardPopover, {
        cardToAdd: filterNotDrawnCard,
        whatHasCaretAfterCard: whatHasCaretAfterOwnFilterCard2,
        onColumnAsked: openFilterListAt,
        timesPressed: timesFocusBegun,
        crossPressed: null,
      }),
      view.ownFilterBar !== null &&
        jsx(OwnFilterBarView, {
          bar: view.ownFilterBar,
          cardToAdd: filterBarCard,
          whatHasCaretAfterCard: whatHasCaretAfterOwnFilterCard2,
          onColumnAsked: openFilterListAt,
          columnOpen: filterListChip,
          timesPressed: timesFocusBegun,
          onLineRemoved: removeOwnFilterLine2,
          onSortRemoved: removeOwnSort,
          onSortMadeForEveryone: view.viewOnlyBecause === null ? makeOwnSortForEveryone : null,
          onRefreshed: refreshOwnFilters,
          onCleared: clearOwnFiltersOfSheet,
          onLookAgain: lookAtOwnFiltersAgain,
          onGoingWithCaret: focusCaret,
          onKeyDown: onOwnFilterBarKeyDown,
          className: sheetBehindSidePaneClass,
          style: headerRoomStyle,
          ref: ownFilterBarRef,
        }),
      findBar,
      jsxs('div', {
        ref: watchKeyboardSlides,
        ...edgeStretchPressProps,
        className: 'sheet-with-group-margins',
        'data-are-tabs-away': areTabsAway || undefined,
        'data-is-frame-shortened': isFrameShortened || undefined,
        'data-is-bar-of-phone': isNarrowWithFormatBar || undefined,
        style: {
          marginBlockStart: (view.find?.roomAboveGrid ?? 0) * zoom,
          ...groupMarginRoomStyle(view.groupMargins, zoom),
        },
        children: [
          view.groupMargins.columns !== null &&
            jsx(GroupMargin, {
              ref: setFooterExtra,
              margin: view.groupMargins.columns,
              zoom: zoom,
              onMarkPressed: onGroupMarkPressed,
              onLevelChosen: chooseGroupLevel,
            }),
          view.groupMargins.rows !== null &&
            jsx(GroupMargin, {
              ref: setHeaderExtra,
              margin: view.groupMargins.rows,
              zoom: zoom,
              onMarkPressed: onGroupMarkPressed,
              onLevelChosen: chooseGroupLevel,
            }),
          jsxs('div', {
            className: 'sheet-under-find-bar relative flex min-h-0 flex-col overflow-clip',
            children: [
              jsx(LeaveCellsHint, {
                cells: cellsRef,
                doesEscapeStepOut: view.escapeInCells === 'stepsOut' && view.openUnderCell === null && !view.isEscapeForFix,
                isCardUnderCell: view.errorExplained !== null || view.linkExplained !== null,
                hasEscapeSteppedOut: view.lastDone?.what === 'steppedOutOfCells',
              }),
              jsxs('div', {
                ref: cellsRef,
                className: 'sheet-grid min-h-0 flex-1',
                role: 'presentation',
                ...gridlinesDataAttribute(gridNow),
                'data-is-stepped-out-of': view.isSteppedOutOfCells,
                'data-is-come-to-by-tab': isComeToByTab || undefined,
                'data-holds-edge-of': gridNow.edgeHeldOf ?? undefined,
                'data-holds-fill-handle': gridNow.isFillHandleHeld,
                'data-is-grabbed':
                  isPointerHeldInCells ||
                  gridNow.areLinesDragged ||
                  gridNow.columnsRiding !== null ||
                  gridNow.areCellsHeld ||
                  gridNow.freezeBarHeld !== null ||
                  gridNow.placedViewHeldBy === 'all',
                'data-holds-side-of-chart': (gridNow.placedViewHeldBy !== null && gridNow.placedViewHeldBy !== 'all') || undefined,
                style:
                  gridNow.placedViewHeldBy === null || gridNow.placedViewHeldBy === 'all'
                    ? undefined
                    : {
                        cursor: rotatedResizeCursor(gridNow.placedViewHeldBy, 0),
                      },
                'data-lines-to-take-hold-of': gridNow.linesToTakeHoldOf ?? undefined,
                'data-are-columns-riding': gridNow.areColumnsDrawnAsLanded || undefined,
                onKeyDown: onCellsKeyDown,
                onKeyUp: noteModifierKeys,
                onPointerDown: onGridPointerDown,
                onMouseDown: onGridMouseDown,
                onMouseDownCapture: (event?: Dynamic) => {
                  if (!isRestOfPressSwallowedRef.current) return;
                  isRestOfPressSwallowedRef.current = false;
                  event.preventDefault();
                  event.stopPropagation();
                },
                onPointerUpCapture: (event?: Dynamic) => {
                  linkPress.letGo(event, hasPointerMovedRef.current);
                  lineBoxPresses.letGo(event, hasPointerMovedRef.current);
                },
                onPointerMove: onGridPointerMove,
                onPointerEnter: (event?: Dynamic) => {
                  let isCaptured = event.currentTarget.hasPointerCapture(event.pointerId);
                  if (event.pointerType === 'mouse' && !isCaptured) onGridPointerMove(event);
                },
                onPointerLeave: (event?: Dynamic) => {
                  let { pointerType: pointerType, currentTarget: gridElement } = event;
                  if (pointerType === 'mouse') {
                    errorCardHover.tell(null);
                    linkCardHover.isOver(null);
                    fixPointer.isOver(null, null);
                  }
                  commentLayersRef.current = null;
                  markCommentLayersUnderMouse(
                    {
                      grid: view.grid,
                      gridElement: gridElement,
                      zoom: zoom,
                    },
                    null,
                  );
                  if (pointerType === 'mouse') mouseAroundComments.hasLeftGrid(didMouseLeaveIntoOverlay(event, gridElement.getBoundingClientRect()));
                  nameFlagsAtPointer.pointerMovedTo(null);
                  filterButtonPointedAt.pointerMovedTo(null);
                  tableHandleCall.pointerMovedTo(null);
                  columnHeadingsCall.pointerMovedTo(null);
                },
                onPointerUp: (event?: Dynamic) => {
                  if (event.pointerType === 'mouse')
                    mouseAroundComments.isLetGo(
                      markCommentLayersUnderMouse(
                        {
                          grid: view.grid,
                          gridElement: event.currentTarget,
                          zoom: zoom,
                        },
                        event,
                      ),
                    );
                  if (
                    fingerTapCaret.fingerLifted(event.pointerId, {
                      x: event.clientX,
                      y: event.clientY,
                    })
                  )
                    isMouseDownHandledRef.current = true;
                  pinchZoom.fingerLifted(event.pointerId, event.timeStamp);
                  if (event.pointerId === secondFingerIdRef.current) secondFingerIdRef.current = null;
                  if (isSecondFinger(event)) return;
                  if (event.pointerId === firstFingerIdRef.current && secondFingerIdRef.current === null)
                    if (hasPointerMovedRef.current) fingerFling.fingerLifted(event.timeStamp, speedAtLetGoRef.current);
                    else fingerFling.stop();
                  if (!isOtherPointerWhileHeld(event)) isPointerKeptRef.current = true;
                  let { pointerId: pointerId, timeStamp: timeStamp } = event;
                  let wasDragged = hasPointerMovedRef.current;
                  let placementToFocus = wasDragged ? null : placedViewPressedRef.current;
                  placedViewPressedRef.current = null;
                  let pressOnPlacement = placedViewPointerRef.current;
                  let isStill = !wasDragged && dragStartMsRef.current === null;
                  let isTap: Dynamic = isStill;
                  if (pressOnPlacement?.pointerId === pointerId) {
                    placedViewPointerRef.current = null;
                    let pressAt = pointInPlacedView(event, pressOnPlacement.placementId);
                    let { atMs: pressedAtMs } = lastPointerRef.current;
                    let isQuickTap = isStill && timeStamp - pressedAtMs <= TAP_HOLD_LIMIT_MS;
                    let lastTap = placedViewLiftRef.current;
                    let liftedAt = {
                      x: event.clientX,
                      y: event.clientY,
                    };
                    let isDoubleTap =
                      isQuickTap &&
                      lastTap?.placementId === pressOnPlacement.placementId &&
                      pressedAtMs - lastTap.liftedAtMs <= DOUBLE_TAP_GAP_MS &&
                      Math.hypot(liftedAt.x - lastTap.at.x, liftedAt.y - lastTap.at.y) <= TAP_SLOP_PX;
                    placedViewLiftRef.current =
                      isQuickTap && !isDoubleTap
                        ? {
                            placementId: pressOnPlacement.placementId,
                            at: liftedAt,
                            liftedAtMs: timeStamp,
                          }
                        : null;
                    let isFitOnPhone = isDoubleTap && isOnPhone();
                    if (isFitOnPhone) fitPlacedViewInSight(pressOnPlacement.placementId, true);
                    if (isStill && pressAt !== null)
                      setPlacedViewTap({
                        placementId: pressOnPlacement.placementId,
                        ...pressAt,
                      });
                    isTap = isQuickTap && !isFitOnPhone;
                  }
                  if (placementToFocus !== null)
                    findPlacedViewCaret(event.currentTarget.ownerDocument, placementToFocus)?.focus({
                      preventScroll: true,
                    });
                  let chartLetGo = chartTaps.letGo(event, {
                    isTap: isTap,
                    areEventsFinished: !store.isEventUnfinished(),
                    charts: store.getView().grid.placedViews,
                  });
                  if (chartLetGo !== null) chartTaps.tell(chartLetGo.placementId, chartLetGo.at);
                  updateTaps((taps?: Dynamic) => {
                    let mayTapBeTold2 = !wasDragged && mayTapBeTold(store.getView().grid);
                    return tapsAfterLift(taps, pointerId, mayTapBeTold2 ? timeStamp : null);
                  });
                  if (pressPointerIdRef.current === pointerId && !event.currentTarget.hasPointerCapture(pointerId)) onGridPointerUp(event);
                  let link = linkAtPointerPoint(event);
                  if (event.pointerType === 'mouse') linkCardHover.isOver(link === null ? null : cellPointOf(link, event));
                },
                onPointerDownCapture: () => {
                  isClickToSwallowRef.current = false;
                  isMouseDownHandledRef.current = false;
                  isRestOfPressSwallowedRef.current = false;
                },
                onClickCapture: (event?: Dynamic) => {
                  if (isClickToSwallowRef.current && event.detail > 0) event.stopPropagation();
                  isClickToSwallowRef.current = false;
                },
                onClick: (event?: Dynamic) => {
                  if (isOnSkipTarget(event) && gridNow.selectionSummary?.opensMenu === true) askFigures();
                  let commentHandle = commentCornerKeyAtTarget(event);
                  if (commentHandle !== null)
                    store.dispatch({
                      kind: 'commentMarkPressed',
                      handle: commentHandle,
                    });
                },
                onContextMenu: onGridContextMenu,
                onPointerCancel: onGridPointerCancel,
                onLostPointerCapture: onGridPointerUp,
                onDoubleClick: (event?: Dynamic) => {
                  if (
                    isInAtEndOfSheet(event.target) ||
                    isInPlacedViewControls(event.target) ||
                    isInOffersAtSelection(event.target) ||
                    isInExpandedEntry(event.target) ||
                    wasPressOnOfferRef.current ||
                    commentCornerKeyAtTarget(event) !== null
                  )
                    return;
                  if (!isPressForMenuRef.current && !event.metaKey && !event.ctrlKey) onPressedTwice(pointInGrid(event), false);
                },
                children: [
                  jsx('span', {
                    id: ERROR_DESCRIPTION_ID,
                    hidden: true,
                    children: view.errorOfActiveCell !== null && errorExplanationWords(view.errorOfActiveCell, canPersonEdit),
                  }),
                  jsx('span', {
                    id: LINK_ADDRESS_ID,
                    hidden: true,
                    children:
                      view.whereWordsOfActiveCellLink !== null && view.isAddressOfActiveCellBuilt
                        ? builtLinkAddressLabel(view.whereWordsOfActiveCellLink)
                        : view.whereWordsOfActiveCellLink,
                  }),
                  jsxs('div', {
                    ref: zoomedGridRef,
                    role: 'presentation',
                    className: 'sheet-grid-zoomed',
                    style: zoomedStyle(zoom),
                    children: [
                      jsxs(TextWidthProvider, {
                        within: cellsRef,
                        children: [
                          jsx(ReadersScroller, {
                            store: store,
                            grid: gridNow,
                            isOn: IS_IOS_BROWSER,
                            children: jsx('div', {
                              ref: gridFocusRef,
                              id: SHEET_ROWS_ID,
                              className: 'sheet-rows',
                              role: 'grid',
                              tabIndex: typingTarget === 'grid' ? 0 : -1,
                              onFocus: ({ target: target, currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) => {
                                if (target !== currentTarget) return;
                                if (didFocusLeaveByTab2(relatedTarget) && !store.getView().isSteppedOutOfCells) markComeToByTab();
                                if (whereTypingGoes(store.getView()) !== 'formulaBar') {
                                  getTypingTargetElement()?.focus({
                                    preventScroll: true,
                                  });
                                  return;
                                }
                                store.dispatch({
                                  kind: 'entryLeft',
                                });
                                whenFocusStays(refocusTypingTarget);
                              },
                              'aria-label': shownSheetName,
                              'aria-describedby': cellEditorDescribedBy,
                              'aria-readonly': isViewOnly,
                              'aria-multiselectable': true,
                              'aria-rowcount': gridNow.rowCount + 1,
                              'aria-colcount': gridNow.columnCount + 1,
                              'aria-activedescendant': activeCellElementId ?? undefined,
                              children: jsx(SheetGridDrawing, {
                                grid: gridNow,
                                linesOnShow: store.linesOnShow(),
                                cornerOnTop: nameFlagsAtPointer.cornerOnTop,
                                cornersCalledUp: nameFlagsAtPointer.cornersCalledUp,
                                flagsHidden: nameFlagsAtPointer.flagsHidden,
                                rowNumberUnderHandle: rowNumberUnderTableHandle(gridNow, tableHandleCalledFor),
                              }),
                            }),
                          }),
                          jsx(
                            AddAtEndOfSheet,
                            {
                              grid: gridNow,
                              isColumnCountCardOpen: isColumnCountCardOpen,
                              onAdd: addLinesAtEnd2,
                              onColumnCountAsked: askColumnCountCard,
                              onCaretAtEnd: setCaretAtEnd,
                              onCaretLost: () => {
                                setCaretAtEnd(null);
                                if (cellsRef.current?.ownerDocument.hasFocus() === true) focusCaret();
                              },
                            },
                            shownSheet?.sheetId,
                          ),
                          jsx(FilterTableOutlines, {
                            outlines: gridNow.foundTableOutlines,
                            body: gridNow.body,
                            areOfFoundTables: true,
                            latestRevisionByAgent: gridNow.latestRevisionByAgent,
                          }),
                          jsxs(
                            React.Fragment,
                            {
                              children: [
                                jsx(FilterTableOutlines, {
                                  outlines: gridNow.filteredTableOutlines,
                                  body: gridNow.body,
                                  filteredTablesDrawn: gridNow.filteredTablesDrawn,
                                }),
                                jsx(FilterButtonsLayer, {
                                  buttons: gridNow.filterButtons,
                                  filteredTablesDrawn: gridNow.filteredTablesDrawn,
                                  pointedAt: filterButtonPointedAt.pointedAt,
                                  body: gridNow.body,
                                  onListAsked: onFilterButtonPressed,
                                  onGoingWithCaret: focusCaret,
                                }),
                              ],
                            },
                            `filters-${shownSheet?.sheetId}`,
                          ),
                          jsx(TableHandle, {
                            grid: gridNow,
                            calledFor: tableHandleCalledFor,
                            isMenuOpen: view.menu?.ofHandleOfTable !== undefined,
                          }),
                          jsx(ColumnGrips, {
                            grid: gridNow,
                            calledFor: columnHeadingsCall.calledFor,
                          }),
                          jsx(ColumnsRiding, {
                            grid: gridNow,
                            gridRef: cellsRef,
                            zoom: zoom,
                          }),
                          jsx(CellsHeld, {
                            held: gridNow.cellsHeld,
                            body: gridNow.body,
                            density: gridNow.density,
                          }),
                          jsx(OffersAtSelection, {
                            grid: gridNow,
                            zoom: zoom,
                            offers: offersAtSelection,
                            isHeldBack: isAnyLayerHeldBack,
                            wasLastPressByMouse: () => wasLastPressByMouseRef.current,
                            onCaretLost: focusCaret,
                          }),
                          jsx(PlacedViewsLayer, {
                            placedViews: gridNow.placedViews,
                            chartBeingMade: gridNow.chartBeingMade,
                            sheetOnShow: shownSheetIdOf(view),
                            onChartBeingMadeGone: forgetChartBeingMade,
                            body: gridNow.body,
                            zoom: zoom,
                            runsOn: chartsRunOn,
                            tap: placedViewTap,
                            hearPresses: chartTaps.hear,
                            onAct: actOnPlacedView,
                            onAskAgent: isChatToBeHad === true ? openChatAboutChart : null,
                            doesChatTakeWords: doesChatTakeWordsAtOnce,
                            onSendToAgent: sendAboutChart,
                            onFixAsked: (isChatToBeHad ?? wasChatToBeHad) ? sendPressAboutChart : null,
                            onNoticeWithFixCame: lookAtChatUnlessComingSoon,
                            changes: changesOfCharts,
                            pointChart: store.askForEditOfChart,
                            onKeepAnswered: (nodes?: Dynamic, says?: Dynamic) =>
                              setChartChangeUndoNotice({
                                says: says,
                                nodes: nodes,
                              }),
                            isKeyOfMenu: isKeyOfMenu,
                            onCardOpened: onChartMadeLastOvertaken,
                            cardUnderChart: cardUnderChartRef,
                            onCaret: onPlacedViewCaret,
                            onSidesPressed: notePlacedViewPress,
                            onCaretTaken: closeMenuAndRefocus,
                            saidAtRest: renderSettledWordsAnnouncer,
                          }),
                          jsx(GridScrollbars, {
                            grid: gridNow,
                            store: store,
                            zoom: zoom,
                          }),
                          jsx(ExpandedEntryFinishButton, {
                            grid: gridNow,
                            onFinished: () => dispatchThenFocusTyping('expandedEntryFinished'),
                          }),
                          jsxs(PeopleField, {
                            people: peopleListField,
                            chipGoneTo: view.peopleList?.chipGoneTo ?? null,
                            place: peopleListPlacement,
                            within: popupBounds,
                            onPersonRemoved: removePersonFromField,
                            onSized: noteEntryHelperRect,
                            typed: entryTextLooks,
                            children: [
                              jsx(CellEntryHint, {
                                grid: gridNow,
                              }),
                              jsx(WordsOffered, {
                                grid: gridNow,
                                offered: view.wordsOffered,
                                isKeyDrawn: isOfferKeyDrawn,
                                store: store,
                              }),
                              jsx(FormulaArriving, {
                                grid: gridNow,
                                stage: formulaFromWords.stage,
                                actsHeld: formulaFromWords.actsHeld,
                                text: mode.kind === 'editing' ? mode.text : '',
                                isInFontOfFormulas: isEditingFormula,
                                dispatch: dispatchFromEntryHelper,
                              }),
                              cellEditor,
                            ],
                          }),
                          jsx(WordsOfferedButton, {
                            grid: gridNow,
                            offered: view.wordsOffered,
                            isKeyDrawn: isOfferKeyDrawn,
                            onPressed: pressWordsOffered,
                          }),
                          jsx(ExpandButtonAtSelection, {
                            grid: gridNow,
                            entryBoxRef: typingFieldRef,
                            zoom: zoom,
                            isHeldBack: isAnyLayerHeldBack || isWrapOffered,
                            wasLastPressByMouse: () => wasLastPressByMouseRef.current,
                            onPressed: () => dispatchThenFocusTyping('entryExpandedOrCollapsed'),
                          }),
                        ],
                      }),
                      gridNow.editorBox !== null &&
                        gridNow.editorFlagStands !== null &&
                        entryCellLabel !== null &&
                        jsx('div', {
                          'aria-hidden': true,
                          className: 'sheet-name-flags-of-others sheet-flag-on-editor',
                          'data-stands': gridNow.editorFlagStands,
                          style: outlineBoxInBody(gridNow.editorBox, gridNow.body),
                          children: jsx('div', {
                            children: jsxs('span', {
                              style: {
                                maxWidth: `min(240px, ${gridNow.body.width - gridNow.editorBox.left}px)`,
                              },
                              children: [
                                jsx('bdi', {
                                  children: entryCellLabel.sheet,
                                }),
                                entryCellLabel.cell,
                              ],
                            }),
                          }),
                        }),
                    ],
                  }),
                ],
              }),
              importOnGrid.pictureOverGrid,
              jsx(AddColumnsPopover, {
                isOpen: isColumnCountCardOpen,
                columnCount: gridNow.columnCount,
                opener: getAddColumnsButton,
                onShut: () => setIsColumnCountCardOpen(false),
                onKeyPressed: noteCaretAtEndOnKey,
                onCountChosen: (count?: Dynamic) => {
                  addLinesAtEnd2('columns', count);
                  forgetComeToByTab();
                },
                whatHasCaretAfter: whatHasCaretAfter,
              }),
              jsx(CalendarUnderCell, {
                popupRef: calendarPopupRef,
                calendar: view.calendar,
                anchor: calendarAnchor,
                isEntryOpen: mode.kind === 'editing',
                timesAsked: view.timesCalendarAsked,
                whatHasCaretAfter: whatHasCaretAfter,
                isKeyboardLeftOutside: isPageLeftWithoutPointer,
                onGivenUp: closeCalendarIfStill,
                onShut: closeCalendar,
                onDayChosen: chooseDay,
                onTimeChosen: chooseTime,
                onKeyDown: onCalendarKeyDown,
                onKeyBroughtCaret: redispatchKeyToFocused,
              }),
            ],
          }),
          jsx(ErrorsOfferNotice, {
            count:
              canPersonEdit && !isErrorsAtOpeningOffered && ((isChatToBeHad ?? wasChatToBeHad) || view.fixesOnCells !== null)
                ? (view.errorsOffered?.count ?? null)
                : null,
            countOffered: view.countOfErrorsOffered,
            isHeldBack: isAnyLayerHeldBack || isErrorsAtOpeningOffered || cornerOfErrorsOffered === null,
            areItsCellsInView: view.grid.areCellsOfErrorsOfferInView,
            canAttach: view.selectionByAddress !== null || view.isOneRangeNeeded,
            isChatToBeHad: isChatToBeHad ?? wasChatToBeHad,
            anchor: errorCornerAnchor,
            place: `${errorCornerLeft} ${errorCornerTop}`,
            stageOfFixes: view.fixesOnCells?.stage ?? null,
            countOfFixes: view.fixesOnCells?.count ?? 0,
            pressForFixes: pressForFixesTracker,
            holdOnFixes: view.holdsOnAgentsAnswers.fixes,
            onActHeldAtFixes: holdActAtFixes,
            onFixesActedOn: onFixesAct,
            onFixAsked: askAgentToFixAfterEdit,
            onPutAway: putAwayErrorsOffer2,
            onWheelTurned: forwardWheelToCells,
            onKeyPressed: onErrorsNoticeKeyDown,
            onGoneWithFocus: returnFocusAfterErrorsNotice,
          }),
          jsx(FixPill, {
            cellKey: actableFixPillKey,
            shown: pillOfFix?.shown ?? null,
            formulaIfCut: pillOfFix?.formulaIfCut ?? null,
            cellHeight: (fixPillHeight ?? 0) * zoom,
            came: fixKeyCameAt,
            anchor: fixPillAnchor,
            side: pillOfFix?.side ?? null,
            hold: view.holdsOnAgentsAnswers.fixes,
            onActHeld: holdActAtFixes,
            onActedOn: onFixActedOn,
            onPointed: fixPointer.isOnPill,
          }),
          jsxs('div', {
            className: `sheet-bar ${sheetBehindSidePaneClass}`,
            style: headerRoomStyle,
            onPointerDownCapture: ({ pointerType: pointerType }: Dynamic) => {
              isSheetPointingBlockedRef.current = pointerType === 'touch';
            },
            onKeyDownCapture: () => {
              isSheetPointingBlockedRef.current = false;
            },
            children: [
              jsx(SheetPicker, {
                ref: sheetTabsRef,
                addSheetButton: addSheetButtonRef,
                listedSheets: importOnGrid.listedSheets,
                viewOnlyBecause: view.viewOnlyBecause,
                isUnfinishedFormulaOpen: view.isUnfinishedFormulaOpen,
                onListOpenChange: onSheetsLayerOpenChange,
                whatHasCaretAfterList: whatHasCaretAfter,
                timesRenameBegunElsewhere: timesRenameBegunElsewhere,
                onKeyDown: onSheetsTabsKeyDown,
                isChosenForFormula: canSwitchSheet,
                onImportChosen: chooseImportFile,
                lookOnceEventsAreFinished: lookOnceEventsAreFinished,
                dispatch: dispatchFromSheetTabs,
              }),
              view.viewOnlyBecause === null && importFilePicker.input,
              view.calculating !== null &&
                jsx(CalculatingSpinner, {
                  isTurning: view.calculating === 'underWay',
                }),
              jsx(ContentsBox, {
                onMouseDown: preventMouseDownDefault,
                onKeyDown: onFiguresKeyDown,
                children: jsx(SelectionFigures, {
                  kept: view.figuresOfSelection,
                  signsOfNumbers: view.signsOfNumbers,
                  store: store,
                  inPage: cellsRef,
                  onMenuOpenChange: onFiguresLayerOpenChange,
                  whatHasCaretAfter: whatHasCaretAfter,
                }),
              }),
              jsx(ContentsBox, {
                onMouseDown: preventMouseDownDefault,
                onKeyDown: onSheetsBarKeyDown,
                children: atEndOfSheetBar,
              }),
              areViewToolsAtFoot &&
                jsx('div', {
                  ref: shownViewToolsRef,
                  role: 'presentation',
                  className: 'sheet-view-tools',
                  onMouseDown: preventMouseDownDefault,
                  onKeyDown: onViewToolsKeyDown,
                  children: jsx(TooltipGroup, {
                    children: viewMenu,
                  }),
                }),
            ],
          }),
          jsx('div', {
            ref: overGridRef,
            className: 'sheet-over-grid',
            children:
              (view.formatOfSelection !== null || versionLook !== null) &&
              jsxs('div', {
                ref: setFootBar,
                className: `sheet-foot ${sheetBehindSidePaneClass}`,
                'data-has-format-tools': contextBar !== false || undefined,
                'data-is-entry-open': mode.kind === 'editing' || undefined,
                'data-keeps-room-of-pane': isRoomKeptForGonePane ? 'of-gone-pane' : undefined,
                role: 'presentation',
                children: [
                  areWaysInSeen &&
                    versionLook === null &&
                    jsx(ContentsBox, {
                      ...waysInFocus,
                      children: jsx(UiRoot, {
                        density: 'comfortable',
                        children: jsx(WaysInToolbar, {
                          ref: setFootNoticeElement,
                          onAskAgent: askAgentFromWaysInOffer,
                          onImportChosen: chooseImportFile,
                          whatHasCaretAfter: whatHasCaretAfter,
                          onMenuOpenChange: onWaysInLayerOpenChange,
                          onKeyDown: onWaysInKeyDown,
                        }),
                      }),
                    }),
                  jsx(UndoAgentTurnCard, {
                    offer: undoOfferOnCard,
                    isBeingTaken: addedChartOnCard === null && !isPlainUndoOfferShown && view.isUndoOfTurnAwaited,
                    onTaken: addedChartOnCard === null ? takeUndoOfferShown : undoAddedChart,
                    ref: setUndoOfTurnCard,
                    onKeyDown: onUndoOfTurnKeyDown,
                    onGoneWithKeyboard: focusCaret,
                    onLeftAlone: liftUndoCardNextFrame,
                    wait: addedChartOnCard === null ? (undoOfferShown?.wait ?? null) : null,
                    onSeenLongEnough: (wait?: Dynamic) =>
                      store.dispatch(
                        isPlainUndoOfferShown
                          ? {
                              kind: 'undoOfferDismissed',
                            }
                          : {
                              kind: 'workShownLongEnough',
                              wait: wait,
                            },
                      ),
                  }),
                  jsxs(UiRoot, {
                    density: 'comfortable',
                    render: jsx(Surface, {
                      elevation: 'panel',
                      className: 'sheet-card-of-tools flex max-w-full items-center gap-1 p-1',
                      onMouseDownCapture: leavePlacedViewOnPress,
                      onClickCapture: leavePlacedViewOnPress,
                    }),
                    children: [
                      versionLook !== null &&
                        view.versionHistory !== null &&
                        jsx(EarlierVersionBar, {
                          history: view.versionHistory,
                          look: versionLook,
                          onAct: onVersionHistoryAct,
                          barRef: versionBarRef,
                          onRoomForRestore: setIsRestoreInBar,
                          onKeyDown: onFormatToolsKeyDown,
                          onGoneWithKeyboard: focusCaret,
                        }),
                      versionLook === null && contextBar,
                      versionLook === null &&
                        isNarrowWithFormatBar &&
                        areTabsAway &&
                        !isFormulaAskedOrProposed(view) &&
                        jsx(HideKeyboardButton, {
                          onPressed: leaveMenuAndEntryOnPress,
                        }),
                    ],
                  }),
                  jsx(DoneByAgentCard, {
                    done: addedChartOnCard === null && view.doneByAgent?.isCardUp === true ? view.doneByAgent : null,
                  }),
                ],
              }),
          }),
        ],
      }),
      jsx(CellContextMenu, {
        isOpen: view.menu !== null && !isMenuHoldingField(view.menu),
        isAskedByKey: view.menu?.isAskedByKey === true,
        placeAsked: menuAt,
        onWindowLeftWithMenuAskedAt: closeMenuIfAskedAt,
        staysOpenAsWindowIsLeft: isBlurPending,
        isAskedToSearch: view.menu?.isToSearch === true,
        isOfContextBar: view.menu?.isOfContextBar === true,
        isOfHandleOfTable: view.menu?.ofHandleOfTable !== undefined,
        ofChart: chartMenuOf,
        cardUnderChart: cardUnderChartRef,
        onChartCopyChosen: chooseChartCopy,
        onChartDeleteChosen: chooseChartDelete,
        canInsertChart: chartNotice === null && areFormatToolsInView,
        canCellsMakeChart: view.chartsOnOffer.length > 0 && (canChartBeAsked !== false || areChartKindsForPage),
        onChartCardAsked: askChartFromMenu,
        onKeyDownInMenuOfHandle: onTableMenuKeyDown,
        anchor: menuAnchor,
        side: view.menu?.side ?? null,
        whatHasCaretAfter: whatHasCaretAfterContextBarMenu,
        linkUrl: view.linkOfActiveCell,
        linkInWordsUrl: view.linkInWordsOfActiveCell?.url ?? null,
        isLinkInWordsBuilt: view.isAddressOfActiveCellBuilt,
        selectionIsOf: view.selectionIsOf,
        selectedRowCount: view.selectedRowCount,
        selectedColumnCount: view.selectedColumnCount,
        selectedCellCount: view.selectedCellCount,
        rowCountToSize: view.rowCountToSize,
        columnCountToSize: view.columnCountToSize,
        isOneRangeNeeded: view.isOneRangeNeeded,
        isSelectionCutByOwnFilters: view.isSelectionCutByOwnFilters,
        heldToPaste: lastPutHereHolds,
        canPasteValuesOnly: valuesOfLastPutHere !== null,
        canMergeSelection: view.canMergeSelection,
        canUnmergeSelection: view.canUnmergeSelection,
        canMoveSelectionBack: view.canMoveSelectionBack,
        canMoveSelectionOn: view.canMoveSelectionOn,
        freezeChoices: view.freezeChoices,
        groupChoices: view.groupChoices,
        canDeleteSelectedRows: view.canDeleteSelectedRows,
        canDeleteSelectedColumns: view.canDeleteSelectedColumns,
        areWholeRowsSelected: view.areWholeRowsSelected,
        areWholeColumnsSelected: view.areWholeColumnsSelected,
        columnToSortBy: view.columnToSortBy,
        canSortSelectedRange: view.canSortSelectedRange,
        columnToSortSelectedRangeBy: view.columnToSortSelectedRangeBy,
        columnsOfferedToSortBy: view.columnsOfferedToSortBy,
        headingToSortBy: view.headingToSortBy,
        headingToSortSelectedRangeBy: view.headingToSortSelectedRangeBy,
        keysToSortBy: view.keysToSortBy,
        canSortTableAtCell: view.canSortTableAtCell,
        keysToSortSelectedRangeBy: view.keysToSortSelectedRangeBy,
        formatOfSelection: view.menu === null ? null : view.formatOfSelection,
        holdsOnlyFigures: view.menu?.holds === 'figures',
        holdsNoEdits: view.menu?.holds === 'noEdits',
        ownFilterOffers: view.ownFilterOffers,
        formatAsTableOffer: view.formatAsTableOffer,
        figures: view.figures,
        isChatToBeHad: isChatToBeHad,
        wasChatToBeHad: wasChatToBeHad,
        hasAddressForAgent: view.selectionByAddress !== null,
        doCellsShowError: canPersonEdit && doesSelectionShowError(view),
        canActiveCellBeFixedHere: fixOfferInMenu2 === 'ofActiveCell' || fixOfferInMenu2 === 'ofSelectedCells',
        isFixOfActiveCellYetToBeKnown: fixOfferInMenu2 === 'yetToBeKnown',
        onFixAsked: fixOfferInMenu2 === 'ofSelectedCells' ? askFixesOfSelectedCells : askFixFromMenu2,
        onClosed: closeMenu,
        onLinkOpened: onZoomTyped,
        onLinkCopied: copyLinkAddress,
        linkByHandOffered: view.linkByHandOffered,
        doesKeyOpenLinkForm: view.doesKeyOpenLinkForm,
        onLinkFormAsked: askLinkForm,
        onLinkCardAsked: askLinkCard2,
        isCommentOffered: view.isCommentOffered && versionLook === null,
        onCopyOrCutChosen: askCopyOrCutFromMenu,
        keyThatPastes: likelyHasKeyboard2 ? PRIMARY_MODIFIER_NAME : null,
        onPasteChosen: pasteFromMenu,
        onPasteMeantForCells: notePasteEvent,
        onCommentChosen: chooseComment,
        onClearChosen: clearCellsFromMenu,
        onChangeChosen: chooseSheetChange,
        onOwnFilterAsked: askOwnFilter,
        onSortAndFilterAsked: askSortFromMenu,
        onOwnFilterByCellChosen: chooseOwnFilterByCell,
        onOwnFilterRemoved: clearOwnFiltersOfTable,
        onFormatAsTableChosen: chooseFormatAsTable,
        onColumnToSortByChosen: chooseColumnToSortBy,
        onFreezeChosen: chooseFreeze,
        onGroupLevelChosen: chooseGroupLevelFromMenu,
        onFormatChosen: chooseCellFormatInMenu,
        onConditionalFormatsAsked: askRulesFromCells,
        onSortPaneAsked: askSortPaneFromMenu,
        onFigureChosen: chooseFigure,
        areDropdownsSelected: view.canDropdownBeRemoved,
        onInsertChosen: insertCellControlFromMenu,
        isCellHistoryOffered: view.canCellHistoryBeAsked,
        onCellHistoryAsked: askCellHistory,
        onAgentAsked: askAgentAboutSelection2,
        onAgentAskedInComment: chooseCommentForAgent,
        onFindAskedFor: view.menu === null ? ignoreFindAsked : openFind2,
        addressOfActiveCell: view.menu === null ? null : (view.selectionByAddress?.activeCell ?? null),
        commandsOfBar: view.menu === null ? noCommandsOfBar : commandsOfBar,
        commandsOfTyped: view.menu === null ? noCommandsOfTyped : commandsOfTyped,
        commandsByName: view.menu === null ? noCommandsByName : commandsByName,
        onSearchBegun: askCostsInMenu,
        askForCommands: askForCommands,
        canAskForCommands: store.canAskForCommands,
        isAgentForToolsExpected: isAgentForToolsExpected,
        onOpened: askWhetherAgentCanBeSent,
        couldCommentGoToAgent: couldSendToAgent,
        mightChatLeaveSheet: isChatOfferedInMenu,
        canRuleBeAskedInWords: view.doRulesOpenInCard && view.formatOfSelection !== null,
        rulesInMenu: conditionalFormatsInMenu?.isAboutWords === true ? conditionalFormatsInMenu : null,
        rulesSuggested: conditionalFormatsInMenu?.suggestions ?? null,
        onSuggestedRulesWanted: suggestRulesInMenu,
        onSuggestedRulePointedAt: pointAtRuleSuggestion,
        onSuggestedRuleTaken: takeRuleSuggestion,
        onRulesAsked: startOrShowRules,
        onRuleAskedInWords: askRuleInMenu,
        onRuleLetGo: letGoOfRuleInMenu,
        onRuleKept: keepRulesOffer,
        onRuleStopped: stepBackInRules,
        onCommandTaken: withMenuOpenedBy,
      }),
      jsx(DropdownListUnderCell, {
        list: dropdownList,
        anchor: dropdownAnchor,
        cellElementId: dropdownList === null ? null : gridNow.activeCellElementId,
        isCardBeside: isListLiveRegionOn,
        onRoomBesideMeasured: setIsListLiveRegionOn,
        onRowChosen: onDropdownRowChosen,
        onCardAsked: askCardByRestingPointer,
        onCardOfOptionAsked: askCardOfOption,
        onOptionsNamed: nameOptionsInList,
        onNewOptionNoLongerNamed: stopNamingNewOption,
        onOptionMoved: moveOptionInList,
        onCaretGivenBack: giveCaretBackToCells,
        onCardRowChosen: chooseCardRow,
        onCardShut: shutCard,
        onShut: onDropdownBlur,
      }),
      jsx(ConditionalFormattingPane, {
        pane: view.conditionalFormats,
        timesAsked: view.timesSidePaneAsked,
        changesAskedFor: view.grid.changesAskedFor,
        paneRef: sidePaneRef,
        takesNoTyping: sidePaneTakesNoTyping,
        paneWidth: sidePaneWidth,
        onPaneWidthChange: setSidePaneWidth,
        onKeyDownInPane: onSidePaneKeyDown,
        whatHasCaretAfter: whatHasCaretAfter,
        wasPointerPressedLast: wasPointerPressedLast,
        whatColorPickerShows: store.whatColorPickerShows,
        onAct: onConditionalFormatsAct,
        lookOnceEventsAreFinished: lookOnceEventsAreFinished,
        onPressed: returnFocusFromConditionalFormats,
        onShut: shutSidePane,
        onAskAgent: isChatToBeHadOrWas ? askAgentAboutRule2 : null,
        onAskedInChat: canAskInChatAboutRules ? askForRulesInChat : null,
      }),
      jsx(DropdownPane, {
        isOpen: view.isSidePaneAboutDropdown,
        editor: view.dropdownEditor,
        timesAsked: view.timesSidePaneAsked,
        paneRef: sidePaneRef,
        takesNoTyping: sidePaneTakesNoTyping,
        paneWidth: sidePaneWidth,
        onPaneWidthChange: setSidePaneWidth,
        onKeyDownInPane: onSidePaneKeyDown,
        whatHasCaretAfter: whatHasCaretAfter,
        wasPointerPressedLast: wasPointerPressedLast,
        whatColorPickerShows: store.whatColorPickerShows,
        onAct: onDropdownEditorAct,
        onShut: shutSidePane,
      }),
      jsx(CustomSortPane, {
        pane: view.sortPane,
        timesAsked: view.timesSidePaneAsked,
        paneRef: sidePaneRef,
        takesNoTyping: sidePaneTakesNoTyping,
        paneWidth: sidePaneWidth,
        onPaneWidthChange: setSidePaneWidth,
        onKeyDownInPane: onSidePaneKeyDown,
        whatHasCaretAfter: whatHasCaretAfter,
        wasPointerPressedLast: wasPointerPressedLast,
        onAct: onSortPaneAct,
        onShut: shutSidePane,
      }),
      jsx(VersionHistoryPane, {
        history: view.versionHistory,
        timesAsked: view.timesSidePaneAsked,
        paneRef: sidePaneRef,
        takesNoTyping: sidePaneTakesNoTyping,
        paneWidth: sidePaneWidth,
        onPaneWidthChange: setSidePaneWidth,
        onKeyDownInPane: onSidePaneKeyDown,
        whatHasCaretAfter: whatHasCaretAfter,
        wasPointerPressedLast: wasPointerPressedLast,
        onAct: onVersionHistoryAct,
        isRestoreInBar: isRestoreInBar,
        onPressed: returnFocusFromVersionHistory,
        onLookAgain: lookAtVersionsAgain,
        onShut: shutSidePane,
      }),
      jsx(ErrorCard, {
        error: gridNow.explainedCellBox === null ? null : (view.errorExplained?.error ?? null),
        by: view.errorExplained?.by ?? null,
        cellKey: view.errorExplained?.cellKey ?? null,
        canPersonEdit: canPersonEdit,
        isHeldBack: isAnyLayerHeldBack,
        anchor: errorExplainedAnchor,
        side: view.errorExplained === null || gridNow.explainedCellBox === null ? null : gridNow.sideOfExplainedCell,
        placeOfCell: `${explainedCellLeft} ${explainedCellTop} ${gridBody.width} ${gridNow.clearBodyHeight}`,
        isFixOffered: canPersonEdit && isChatToBeHad === true,
        isFixedHere: canPersonEdit && view.errorExplained?.canBeFixedHere === true,
        canAttach: view.selectionByAddress !== null || view.isOneRangeNeeded,
        mouse: errorCardHover,
        onFixAsked: askFixOfErrorCard2,
        onPutAway: putAwayErrorCard2,
        onWheelTurned: forwardWheelToCells,
      }),
      jsx(LinkCard, {
        urls: linkExplainedRect === null ? null : (view.linkExplained?.urls ?? null),
        urlsOnWords: view.linkExplained?.urlsOnWords ?? NO_URLS_ON_WORDS,
        isInWords: view.linkExplained?.isInWords ?? null,
        isBuilt: view.linkExplained?.isBuilt ?? null,
        by: view.linkExplained?.by ?? null,
        cellKey: view.linkExplained?.cellKey ?? null,
        marked: view.linkExplained?.marked ?? null,
        isHeldBack: isAnyLayerHeldBack,
        isBroughtByFingerOrPen: (view.linkExplained?.by !== 'pointer' || view.linkExplained.isByPress) && !isLinkCardPressedAway,
        anchor: linkExplainedAnchor,
        roomAbove: gridNow.roomAboveExplainedCell,
        seen: linkCardSeen,
        mouse: linkCardHover,
        onLinkOpened: openLinkFromCard,
        onLinkCopied: copyLinkIfSeen,
        onEditChosen: view.viewOnlyBecause === null ? chooseLinkEdit : null,
        onRemoveChosen:
          view.viewOnlyBecause === null && (view.linkExplained?.canBeTakenOff === true || (view.linkExplained?.urlsOnWords.length ?? 0) > 0)
            ? chooseLinkRemove
            : null,
        onPressedTooSoon: leaveLinkCard2,
        onWheelTurned: forwardWheelToCells,
        onFingerCameDown: stopOnFingerDown,
        onSwipedByFinger: captureSwipe,
      }),
      jsx(LinkEditPopup, {
        form: isLinkFormShown ? view.linkForm : null,
        anchor: linkFormAnchor,
        whatHasCaretAfter: whatHasCaretAfter,
        onSaved: giveLink,
        onShut: shutLinkForm,
      }),
      jsx(PeopleList, {
        list: peopleList,
        cellAnchor: entryHelperAnchor,
        formulaBarAnchor: formulaBarTextStartAnchor,
        cellElementId: peopleList === null ? null : gridNow.activeCellElementId,
        isCardBeside: isEntryLiveRegionOn,
        onRoomBesideMeasured: setIsEntryLiveRegionOn,
        onRowChosen: choosePeopleListRow,
        onCardAsked: askCardByRestingPointer,
        onCardRowChosen: chooseCardRow,
        onCardShut: shutCard,
        onShut: onPeopleListBlur,
      }),
      jsx(TimeListPopup, {
        list: view.timeList,
        anchor: entryHelperAnchor,
        cellElementId: view.timeList === null ? null : gridNow.activeCellElementId,
        onRowChosen: chooseTimeListRow,
        onRowPointedAt: pointAtTimeListRow,
        onShut: onTimeListBlur,
      }),
      jsx(FunctionHelp, {
        list: view.functionList,
        guide: view.functionGuide,
        caretAfterPick: view.caretAfterPick,
        writtenWhole: view.functionWrittenWhole,
        typingIn: mode.kind === 'editing' ? mode.typingIn : null,
        isBoxInSight: typingTarget === 'formulaBar' || gridNow.editorBox !== null,
        isCellBoxAComboBox: isEditorACombobox,
        isReferencePointedAt: view.pointedCells !== null,
        cellAnchor: entryHelperAnchor,
        cellElementId: view.functionList === null ? null : gridNow.activeCellElementId,
        decimalSign: view.decimalSign,
        boxes: entryFieldRefs,
        dispatch: dispatchFromEntryHelper,
      }),
      jsx(FormulaFromWordsHelp, {
        formulaFromWords: formulaFromWords,
        typingIn: mode.kind === 'editing' ? mode.typingIn : null,
        cellAnchor: entryHelperAnchor,
        cellElementId: formulaFromWords.stage === null ? null : gridNow.activeCellElementId,
        boxes: entryFieldRefs,
        dispatch: dispatchFromEntryHelper,
        isFormulaTyped: mode.kind === 'editing' && mode.text.startsWith('='),
      }),
      jsx(KeyboardShortcutsDialog, {
        isOpen: view.isListOfKeysOpen,
        isViewOnly: isViewOnly,
        hasComments: view.hasCommentsOnCells,
        whatHasCaretAfter: whatHasCaretAfterKeysList,
        onShut: shutListOfKeys,
      }),
      jsx(CellHistoryPopover, {
        history: view.cellHistory,
        anchor: cellHistoryAnchor,
        decimalSign: view.decimalSign,
        whatHasCaretAfter: whatHasCaretAfterLayer,
        onScopeChosen: chooseCellHistoryScope,
        onTryAgain: askCellHistoryAgain2,
        onLookAgain: lookAtCellHistoryAgain,
        onShut: shutCellHistory,
      }),
      jsx(OwnFilterList, {
        list: view.ownFilterList,
        clearAtFoot: !isFilterListOpenerShown ? filterListClearAtFoot : hangsBesideTable ? clearAtFoot : 0,
        onDrawn: !isFilterListOpenerShown ? noteFilterListDrawn : hangsBesideTable ? noteColumnsCardDrawn : null,
        anchor: !isFilterListOpenerShown ? filterListAnchor : hangsBesideTable ? besideTableAnchor : filterListOpener.anchor,
        whatHasCaretAfter: whatHasCaretAfterFilterList2,
        onGone: forgetClosedFilterListOpener,
        onBack: isFilterListFromButton ? askSortCardFromFilterList : null,
        onAct: onFilterListAct,
        onSort: view.viewOnlyBecause === null || view.ownFilterList?.sort?.isForOneself === true ? chooseFilterListSort : null,
        onShut: shutOwnFilterList,
        onActedWithin: clearFilterListLeftByPress,
      }),
      jsx(ColumnWidthDialog, {
        isOpen: isColumnWidthFieldOpen,
        columnCount: view.columnCountToSize,
        widthInPixels: view.selectedColumnWidth,
        whatHasCaretAfter: whatHasCaretAfterLayer,
        onWidthChosen: chooseColumnWidth2,
      }),
      jsx(RowHeightDialog, {
        isOpen: isRowHeightFieldOpen,
        rowCount: view.rowCountToSize,
        heightInPixels: view.selectedRowHeight,
        isHeightGiven: view.isSelectedRowHeightGiven,
        density: view.density,
        onDensityChosen: chooseDensity,
        whatHasCaretAfter: whatHasCaretAfterLayer,
        onHeightChosen: chooseRowHeight2,
      }),
      jsx(SortScopeDialog, {
        asked: view.cellsToSortAsked,
        whatHasCaretAfter: whatHasCaretAfterPaneLayer,
        onChosen: chooseCellsToSort,
      }),
      jsx(CustomNumberFormatDialog, {
        entry: view.customNumberFormat?.typedIn === 'dialog' ? view.customNumberFormat : null,
        isAgentOffered: view.isAgentOfferedForPattern && !isComposing,
        whatHasCaretAfter: whatHasCaretAfterLayer,
        onTyped: typeCustomNumberFormat,
        onEntered: enterCustomNumberFormat,
        onDropped: dropCustomNumberFormat,
        onEscaped: escapeCustomNumberFormat,
        onAgentAsked: askAgentForNumberFormat2,
        onActHeld: holdActAtNumberFormat,
      }),
      jsx(AgentsAnswerHolds, {
        holds: view.holdsOnAgentsAnswers,
        store: store,
      }),
      jsx(HiddenTextPasteDialog, {
        shown: view.pasteThatWaits,
        whatHasCaretAfter: whatHasCaretAfterLayer,
        onAnswered: answerPasteThatWaits,
      }),
      jsx(LocaleTimeZoneDialog, {
        pick: view.pickForWorkbook,
        whatHasCaretAfter: whatHasCaretAfterLayer,
        onPicked: pickForWorkbook,
        onEntered: enterPickForWorkbook,
        onDropped: dropPickForWorkbook,
      }),
      jsx(ImportDialog, {
        importOfAFile: view.importOfAFile,
        fileAwaited: view.fileAwaited,
        whatHasCaretAfter: whatHasCaretAfterLayer,
        onAnswered: answerImportQuestion2,
        onDestinationPicked: chooseImportDestination2,
        onChangedByHand: changeImportByHand2,
        onKindsWanted: askImportKinds,
        onWished: sendImportWish2,
        onAskedAgain: askImportPlanAgain2,
        onAwaitedNoLonger: stopAwaitingImportPlan2,
        ...importOnGrid.dialog,
        onKept: keepImport2,
        onFileAsked: chooseImportFileOfAnyKind,
        onFileDropped: takeDroppedFile,
        chooseButtonRef: chooseFileButtonRef,
        isKeyboardLeftOutside: callLatestAfterDialog,
        wasKeyPressedLast: wasKeyPressedLast,
        onCaretOwed: noteDialogReturn,
      }),
      jsx(ExportReadyDialog, {
        file: view.xlsxFileReady,
        whatHasCaretAfter: whatHasCaretAfterLayer,
        onShut: shutXlsxFileDialog,
      }),
      jsx(PageFileDrop, {
        isTaken: canTakeDroppedFile(view) && !isAnyLayerHeldBack,
        wayInByKeyboard: addSheetButtonRef,
        onDropped: takeDroppedFile,
      }),
    ],
  });
  return jsx(CanTakeFocusContext, {
    value: isPageReallyLeft,
    children: jsx(SidePaneShutContext, {
      value: giveUpSidePane,
      children: jsx(DateInputLocaleContext, {
        value: dateExample,
        children: sheetsPage,
      }),
    }),
  });
}
export const DRAG_HELD_STILL_TICK_MS = 60;
export const HELD_STILL_SLOW_TICKS = 16;
export const isHeldStillTickToScroll = (times?: Dynamic) =>
  times % (times <= HELD_STILL_SLOW_TICKS ? 4 : times <= 2 * HELD_STILL_SLOW_TICKS ? 2 : 1) === 0;
export const isWithinTapSlop = (point?: Dynamic, startPoint?: Dynamic) =>
  Math.hypot(point.x - startPoint.x, point.y - startPoint.y) < DRAG_SLOP;
export const NO_DRAG_WAY = {
  x: 0,
  y: 0,
};
export const toDomRect = ({ left: left, top: rectTop, width: width, height: height }: Dynamic) =>
  new (DOMRect as Dynamic)(left, rectTop, width, height);
export const POINTER_DOWN_REPEAT_MS = 300;
export const FILL_HANDLE_TOUCH_WINDOW_MS = 150;
export const FOCUS_COMING_BACK_WAIT_MS = 200;
export const INITIAL_FOCUS_SELECTOR = 'input[data-initial-focus],textarea[data-initial-focus],[data-initial-focus] [role=combobox]';
export const SHEET_FOOT_GAP = 8;
export const UNDO_OF_TURN_LIFT_PROPERTY = '--sheet-lift-of-undo-of-turn';
export const CELL_SCROLL_FOOT_ROOM = 88;
export const isPickerField = (target?: Dynamic) => isAtEndOfSheetInput(target) || isPlacedViewAskInput(target);
export const CELL_ADDRESS_ID = 'cell-address';
export const FORMULA_FIELD_ID = 'formula-field';
export const FORMULAS_SHOWN_ID = 'formulas-shown';
export const KEY_TO_LIST_OF_KEYS_ID = 'key-to-list-of-keys';
export const HAS_FOCUS_BY_KEY_ATTRIBUTE = 'data-has-focus-by-key';
export const countsNothing = () => {};
export const runAtOnce = (run?: Dynamic) => (run(), () => {});
export const PAGE_PARTS_IN_F6_ORDER = [
  'functionsButton',
  'formulaBar',
  'viewTools',
  'ownFilterBar',
  'findBar',
  'cells',
  'offersAtSelection',
  'charts',
  'endOfSheet',
  'errorsNotice',
  'toasts',
  'undoOfTurn',
  'waysIn',
  'formatTools',
  'sheets',
  'sidePane',
];
export const ARROW_KEY_STEPS = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};
export const SHEET_SCROLLER_MARGIN = 28;
export const whereTypingGoes = ({ mode: mode, isCaretWithCellsBeforeEntryEnds: isCaretWithCellsBeforeEntryEnds }: Dynamic) =>
  mode.kind === 'editing' && !isCaretWithCellsBeforeEntryEnds ? mode.typingIn : 'grid';
export const areCellsOffLimits = ({
  viewOnlyBecause: viewOnlyBecause,
  isSteppedOutOfCells: isSteppedOutOfCells,
  doesCommentModePickCells: doesCommentModePickCells,
}: Dynamic) => viewOnlyBecause !== null || isSteppedOutOfCells || doesCommentModePickCells;
export const TOOL_PARTS_WITH_MENUS = [
  {
    part: 'functionsButton',
    ownMenu: null,
  },
  {
    part: 'viewTools',
    ownMenu: 'ofZoom',
  },
  {
    part: 'formatTools',
    ownMenu: 'ofToolbar',
  },
];
export const objectKeys = new (WeakMap as Dynamic)();
lastObjectKey = 0;
export const FUNCTION_ICON_PROPS = {
  icon: 'Function',
};
export const WARNING_TOAST_ICON_PROPS = {
  icon: jsx(DangerWarningIcon, {
    size: 'md',
  }),
};
export const OFFSCREEN_SPOT = {
  left: -1e4,
  top: 0,
};
export const PLAIN_TEXT_FIELD_PROPS = {
  spellCheck: false,
  autoComplete: 'off',
  autoCapitalize: 'off',
  autoCorrect: 'off',
  enterKeyHint: 'done',
  'data-gramm': 'false',
  'data-gramm_editor': 'false',
  'data-enable-grammarly': 'false',
};
export const NO_OFFSET = {
  x: 0,
  y: 0,
};
export const NO_URLS_ON_WORDS: Dynamic = [];
export const FORMULA_FIELD_MAX_ROWS = 6;
export const FORMULA_FIELD_MAX_ROWS_OPENED = 14;
export const OPEN_ENTRY_SELECTOR = '.sheet-expanded-entry, .sheet-cell-editor:not([data-is-waiting])';
export const PRIMARY_MODIFIER_NAME = IS_APPLE_PLATFORM ? 'command' : 'control';
export const SHEET_ROWS_ID = 'sheet-rows';
export const ACTIVE_DESCENDANT_PAUSE_MS = 1000;
export const cellEntryComboboxProps = (activeDescendantId?: Dynamic) => ({
  role: 'combobox',
  'aria-expanded': true,
  'aria-haspopup': 'grid',
  'aria-controls': SHEET_ROWS_ID,
  'aria-activedescendant': activeDescendantId ?? undefined,
});
export const GRID_KEY_FIELD_PROPS = {
  inputMode: 'none',
  'data-holds-one-line': true,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
};
export const isAltShortcutKey = (keyEvent?: Dynamic) =>
  (keyEvent.altKey && !keyEvent.ctrlKey && !IS_APPLE_PLATFORM && keyEvent.key !== '=') ||
  (keyEvent.metaKey && ['`', '~'].includes(latinKeyOf(keyEvent, true)));
export const normalizedKeyEvent = (keyEvent?: Dynamic) => readKeyPress(keyEvent, IS_APPLE_PLATFORM);
export const REDISPATCHED_KEYDOWNS = new (WeakSet as Dynamic)();
export const redispatchedKeydown = (sourceEvent?: Dynamic) => {
  let redispatched = new ((globalThis as Dynamic).KeyboardEvent as Dynamic)(
    'keydown',
    Object.assign(sourceEvent, {
      modifierAltGraph: sourceEvent.getModifierState('AltGraph'),
    }),
  );
  REDISPATCHED_KEYDOWNS.add(redispatched);
  return redispatched;
};
export const POINTER_TEXT_REACH_PX = 200;
export const keysOfLines = (lines?: Dynamic) => lines.map(({ key: key }: Dynamic) => key);
export const SHIFT_SPACE_KEY = {
  key: ' ',
  isShiftHeld: true,
  isModifierHeld: false,
  isAltHeld: false,
  isRepeat: false,
};
export const isMacCtrlLetterWhileEditing = (keyEvent?: Dynamic, mode?: Dynamic) =>
  IS_APPLE_PLATFORM && keyEvent.ctrlKey && !keyEvent.metaKey && mode.kind === 'editing' && /^[a-z]$/i.test(normalizedKeyEvent(keyEvent).key);
export const todayDate = () => isoDayOfDate(new (Date as Dynamic)());
export const isOnSkipTarget = ({ target: target }: Dynamic) => target instanceof Element && target.id === SELECTION_SUMMARY_ID;
export const RELOAD_BUTTON_BUSY_MS = 60000;
export const isNeverInStaffTrials = () => false;
export const ignoreFindAsked = () => {
  return;
};
export const noCommandsOfBar = () => [];
export const noCommandsOfTyped = () => null;
export const noCommandsByName = () => [];
export const MOST_TYPED_COMMANDS = 8;
export const CHOSEN_IN_MENU = {
  chosenIn: 'menu',
};
export const NO_CHOSEN_IN: Dynamic = {};
export const ADDED_CHART_SELECT_TRIES = 3;
export const isAgentNeverWorking = () => false;
