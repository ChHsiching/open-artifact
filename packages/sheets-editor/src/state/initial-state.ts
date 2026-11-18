import type {
  CellCondition,
  Color,
  ColumnId,
  Edit,
  Filter,
  IdRun,
  ListLine,
  OffsetOfAPlacement,
  RowId,
  SheetId,
  SortDirection,
  StretchOfADropdown,
  TableWithColumns,
  ValueOfAFilteredColumn,
} from '@open-artifact/sheets-core';
import type { PersonProfile } from '../host/sheets-host.ts';
import type { CellId, WorkbookReads } from '../model/workbook.ts';
import type { CellArea, CellSelection } from '../selection/model.ts';
import type { CellDensity } from '../grid/cell-metrics-values.ts';
import type { GridPoint, GridScroll, LinesAxisName } from '../grid/geometry.ts';
import type { SelectionHandle } from '../kit/selection-frame.tsx';
import type { FillingDrag } from '../selection/fill-handle.ts';
import type { MovingCellsDrag } from '../selection/move-cells.ts';
import type { MovingLinesDrag } from '../selection/move-lines.ts';
import type { MovingColumnsOfTableDrag } from '../selection/move-table-columns.ts';
import type { ResizingDrag, SelectingDrag, TappingDrag } from '../selection/pointer.ts';
import type { CellsReplaced } from '../selection/move-cells.ts';
import type { ColumnsOfTableMoving } from '../selection/move-table-columns.ts';
import type { RowsAndColumnsOfTableToSort } from '../selection/table-select.ts';
import type { LabelEnds } from '../model/a1-references.ts';
import type { RefusalMessageKey } from '../model/refusals.ts';
import type { parseVersionRow } from '../history/requests.ts';
import type {
  AskedKindOfEdit,
  CellHoldsNoMorePeopleNotice,
  EditAnswerRefusedNotice,
  GroupsTooDeepNotice,
  LinesInTheWayNotice,
  SheetNameRefusedNotice,
  StepNotTakenNotice,
  StepShown,
} from './edit-answers.ts';
import type { EditRefusedNotice } from './edit-refusals.ts';
import type { ChartPastedDone, CopiedOrCutDone, PasteRefusedNotice } from './copy-paste.ts';
import type { DuplicateRefusedNotice, SheetDeletedUndoOffer, SheetShownDone } from './sheet-tabs.ts';
import type { SheetMoved } from './sheet-move.ts';
import type { OwnCellLost } from './own-cell-lost.ts';
import type { EntryCameToError } from './reasons-for-errors.ts';
import type { CopiedCellsLetGo } from './copied-cells.ts';
import type { WhatCaretLeft } from './focus-return.ts';
import type { ChartNodesCopiedFor, CopyRefused, EditsDropped, FileToImportNotRead } from './event-reducer.ts';
import type { Place } from './places.ts';
import type { PageMode } from './transitions.ts';
import type { FiguresOfSelection } from './figures-of-selection.ts';
import type { FormatOfSelection, SelectionSeen } from './selection-seen.ts';
import type { ExplainedUnderCell, LinkAddressShown } from './explained-under-cell.ts';
import type { WaysIn } from './ways-in.ts';
import type { AnswerAwaited, NotesOfSteps } from './notes-of-steps.ts';
import type { CalculatingShown, Wait } from './calculating-shown.ts';
import type { LongCalculationTold } from './long-calculation.ts';
import type { OffersAtSelection } from './offers-at-selection.ts';
import { DEFAULT_CELL_DENSITY } from '../grid/cell-metrics-values.ts';
import { restoredPlace } from './places.ts';
import { NO_BOXES_AT_FOOT } from '../grid/geometry.ts';
import { NO_OWN_COLLAPSING, NO_ROWS_OUT_OF_VIEW_BY_FILTERS } from '../grid/line-runs.ts';
import { NO_OWN_ROW_ORDERS, NO_OWN_FILTERS } from '../tables/own-filters.ts';
import { numberFormatExamples, CELL_FORMAT_CHOICES } from '../format/number-format-choices.ts';
import { NO_FIGURES_OF_SELECTION, updateFiguresOfSelection } from './figures-of-selection.ts';
import { makeFormatOfSelection, settleSelectionSeen } from './selection-seen.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { NO_AREA_BORDERS } from '../grid/borders.ts';
import { DEFAULT_BORDER_PEN } from '../format/borders.ts';
import { NOTHING_EXPLAINED_UNDER_CELL } from './explained-under-cell.ts';
import { waysInAtOpening } from './ways-in.ts';
import { NO_NOTES_OF_STEPS } from './notes-of-steps.ts';
import { EMPTY_FORMULA_HELP } from '../formulas/autocomplete.ts';
import { FORMULA_FROM_WORDS_START } from '../formulas/from-words/offer.ts';
import { NO_FIXES_ON_CELLS } from '../formulas/fix/cells-to-fix.ts';
import { NO_TABLES_READ } from '../engine/worker-workbook.ts';
import { NAVIGATING_MODE } from './transitions.ts';
import { NO_REFERENCES } from '../formulas/reference-pointing.ts';
import { CALCULATING_NOT_SHOWN } from './calculating-shown.ts';
import { NO_LONG_CALCULATION } from './long-calculation.ts';
import { NO_OFFERS_AT_SELECTION } from './offers-at-selection.ts';
import { keepScrollAnchoredAcrossChange } from '../grid/layout.ts';
import { followEntryCellText } from '../editor/start-entry.ts';
import type { ReadsWithTextMeasurer } from './controller.ts';
import type { undoOfTurnOf } from '../agent/turn-of-agent.ts';
export interface ScrollForLessRoom {
  from: number;
  end: number;
  at: number;
}
export interface ScrollsForLessRoom {
  sheetId: SheetId;
  across: ScrollForLessRoom | null;
  down: ScrollForLessRoom | null;
}
export interface SavedPlace extends Place {
  lines: string | null;
  density: CellDensity;
  scrolledForLessRoom?: ScrollsForLessRoom | null;
}
export interface Press {
  cellId: CellId;
  x: number;
  y: number;
  viewThen: GridScroll;
  viewAfter: GridScroll;
}
export interface TabRun {
  from: CellId;
  at: CellId;
}
export interface ScrolledForEntry {
  from: GridScroll;
  to: GridScroll;
}
export interface ScrolledForNewChart extends ScrolledForEntry {
  placementId: string;
}
export interface NoticesAtFoot {
  left: number;
  heightUnderTheRest: number;
}
export interface BoxAtFoot {
  left: number;
  right: number;
  heightUnder: number;
}
export interface OwnSortKey {
  byColumn: ColumnId;
  direction: SortDirection;
}
export interface OwnSort {
  by: OwnSortKey[];
  rows: IdRun[] | null;
}
export interface OwnFilter extends TableWithColumns {
  key: string;
  filter: Filter | null;
  sort: OwnSort | null;
  lookedAtAsOf: number;
}
export interface OwnFilterValues {
  listed: ValueOfAFilteredColumn[];
  areMoreLeftOut: boolean;
  texts: (string | null)[];
  ticks: boolean[];
  found: number[];
}
export interface OwnFilterConditionHeld {
  choice: string;
  first: string;
  second: string;
}
export interface OwnFilterCondition {
  key: number;
  held: OwnFilterConditionHeld;
  asks: CellCondition;
  isMistyped: boolean[];
}
export interface OwnFilterListSort {
  inForce: SortDirection | null;
  isForOneself: boolean;
}
export interface OwnFilterList {
  tableKey: string;
  isFilterNotDrawnYet: boolean;
  isTableGuessed: boolean;
  c: ColumnId;
  values: OwnFilterValues | null;
  startsFromNone: boolean;
  conditions: OwnFilterCondition[];
  join: 'and' | 'or';
  choices: string[];
  sort: OwnFilterListSort | null;
  words: string;
  isAnswerRead: boolean;
  areWordsOnTheirWay: boolean;
}
export interface RowsAskedFor {
  isOfFilterBar: boolean;
  hasTurnedFilterOn: boolean;
  isFilterNotDrawnYet: boolean;
  isTableGuessed: boolean;
  hasStopped?: boolean;
}
/** A drag of the grip that sets how many rows or columns are frozen. Made by grid/freeze.ts, which is not typed yet. */
export interface FreezingDrag {
  kind: 'freezing';
  sheetId: SheetId;
  what: LinesAxisName;
  pressedAt: GridPoint;
  countAtPress: number;
  count: number | null;
}
/** Where a placed view would land: its top left cell and how far into it. */
export interface PlacedViewLanding {
  topLeft: CellId;
  offsetFromAnchorCell: OffsetOfAPlacement;
}
/** Where a placed view would land and the size it would take. */
export interface PlacedViewSized extends PlacedViewLanding {
  widthInPixels: number;
  heightInPixels: number;
}
/** What every drag of a placed view holds. Made by charts/placed-views.ts, which is not typed yet. */
export interface PlacedViewHold {
  placementId: string;
  pressedAt: GridPoint;
  leastDrag: number;
  isCornerUnderFrozenLines: { columns: boolean; rows: boolean };
}
/** A drag that changes the size of a placed view by a side or a corner. */
export interface SizingPlacedViewDrag extends PlacedViewHold {
  kind: 'sizingPlacedView';
  sides: SelectionHandle;
  sized: PlacedViewSized | null;
}
/** A drag that moves a placed view over the cells. */
export interface MovingPlacedViewDrag extends PlacedViewHold {
  kind: 'movingPlacedView';
  grip: GridPoint;
  landing: PlacedViewLanding | null;
}
/** A drag that points at cells to refer to in the entry. Made by formulas/reference-pointing.ts, which is not typed yet. */
export interface PointingDrag {
  kind: 'pointing';
}
/** What a pointer held down on the grid is doing. */
export type Dragging =
  | FreezingDrag
  | SizingPlacedViewDrag
  | MovingPlacedViewDrag
  | PointingDrag
  | FillingDrag
  | MovingCellsDrag
  | MovingLinesDrag
  | MovingColumnsOfTableDrag
  | SelectingDrag
  | TappingDrag
  | ResizingDrag;
export type DraggingKind = Dragging['kind'];
/** A drag held still until the workbook answers the edit it ended with. */
export interface HeldUntilAnswered {
  held: Dragging;
  edit: Edit;
}
export type MenuHolds = 'all' | 'cellsToSort' | 'chart' | 'columnWidthField' | 'figures' | 'noEdits' | 'rowHeightField';
export interface SortColumnsPointedAt {
  range: ColumnId | null;
  sheet: ColumnId | null;
}
export interface CellsToSort {
  change: string;
}
export interface Menu {
  holds: MenuHolds;
  sortColumnPicked?: ColumnId;
  sortColumnsPointedAt?: SortColumnsPointedAt;
  cellsToSort?: CellsToSort;
  /** The table the menu's sort acts on, when it opened on one cell (tables/table-to-sort.ts). */
  tableToSort?: RowsAndColumnsOfTableToSort | null;
  /** The key of the table whose handle opened the menu (tables/table-handle-menu.ts). */
  ofHandleOfTable?: string;
  /** Set when the menu opened from the context bar (ui/menu.ts). */
  isOfContextBar?: true;
}
export interface CustomNumberFormat {
  pattern: string;
  isRefusalTold?: boolean;
  typedIn?: 'dialog' | 'list';
}
export interface PasteThatWaits {
  nth: number;
}
export interface PickForWorkbook {
  ofWorkbook?: string;
}
export interface ExamplesOfNumberFormats {
  locale: string;
  byChoice: Map<string, string>;
}
export interface ImportOfAFile {
  isDiscardAsked?: boolean;
}
export interface FileAwaited {
  isAskedByKey: boolean;
  refusedCount: number;
}
export interface NameRefused {
  name: string;
}
export interface SheetBeingRenamed {
  sheetId: SheetId;
  nameWhenOpened: string;
  typed: string;
  refused: NameRefused | null;
}
export interface CheckboxesToSet {
  isAnyToCheck: boolean;
  isAnyToUncheck: boolean;
  isAnyUncheckedByFormula: boolean;
  isAnyCheckedByFormula: boolean;
}
export type BorderLineStyle = 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double';
export interface BorderPen {
  style: BorderLineStyle;
}
export interface WordsOffered {
  cellId: CellId;
  typed: string;
  offered: string;
  isShown: boolean;
  isKeyDrawn: boolean;
  isGone: boolean;
}
export interface CalendarOpen {
  day: string | null;
}
export interface LinkForm {
  cellId: CellId;
  /** Set when the form was opened from a cell's entry, which it leaves as it shuts (links/links-in-entry.ts). */
  opensEntry?: true;
}
export interface ErrorExplained {
  code: string;
  isTellOnItsWay?: true;
}
export interface ReasonsForErrors {
  ofEntryCell: ErrorExplained | null;
  ofCellExplained: ErrorExplained | null;
  cellToFixInPlace: string | null;
  isFixInPlaceYetToBeKnown: boolean;
  isEntryCellToFixInPlace: boolean;
  isFixAtEntryCellYetToBeKnown: boolean;
  doCausesWaitForCalculation: boolean;
}
export interface ErrorsReadAsOf {
  sheetId: SheetId;
  workbookChangeCount: number;
  formulasWorkedOutCount: number;
}
/** Why the cells typed for a dropdown were refused (stand-in: chips/dropdown-editor.ts is untyped). */
export type WhyDropdownCellsRefused = 'ofAnotherDropdown' | 'holdFormula' | 'holdNoOption' | 'headingIsNoOption' | 'notFound';
/** The cells typed for a dropdown that were refused, and why (stand-in, partial: chips/dropdown-editor.ts is untyped). */
export interface DropdownCellsRefused {
  why: WhyDropdownCellsRefused;
  typed?: string;
  timesBefore?: number;
}
/** An option of the dropdown being edited (stand-in, partial: chips/dropdown-editor.ts is untyped). */
export interface OptionOfDropdownInPane {
  optionId: string | null;
  label: string;
  color: Color;
}
/** The label being typed for an option of the dropdown, and the color picked for it (stand-in: chips/dropdown-editor.ts is untyped). */
export interface TypedOptionInPane {
  /** `null` for an option not added yet. */
  optionId: string | null;
  label: string;
  pickedColor: Color | null;
}
/** Which cells a change of the dropdown goes to: every cell of it, or only the stretch with the cell. */
export type DropdownReach = 'everyCell' | 'ownStretch';
/** The dropdown being edited in the side pane (stand-in, partial: chips/dropdown-editor.ts is untyped). */
export interface DropdownEditorInPane {
  /** `null` while the dropdown is not made yet. */
  dropdownId: string | null;
  options: OptionOfDropdownInPane[];
  stretches: StretchOfADropdown[];
  indexOfOwnStretch: number | null;
  reach: DropdownReach;
  typed: TypedOptionInPane | null;
  cellsTyped?: string;
  cellsRefused?: DropdownCellsRefused;
}
/** How the conditional formats are drawn: in the side pane, or on a card by the cells. */
export type RulesDrawnAs = 'pane' | 'card';
/** The conditional formats open in the side pane (stand-in, partial: format/conditional/pane-state.ts is untyped). */
export interface RulesInPane {
  drawnAs: RulesDrawnAs;
  sheetId: SheetId;
  openedAtChangeCount: number;
  isAskedForRules: boolean;
}
/** A version of the workbook, as the store lists it. */
export type VersionOfWorkbook = NonNullable<ReturnType<typeof parseVersionRow>>;
/** The version being looked at (stand-in, partial: history/version-history.ts is untyped). */
export interface LookAtVersion {
  shown: VersionOfWorkbook | null;
}
/** The version history open in the side pane (stand-in, partial: history/version-history.ts is untyped). */
export interface VersionHistoryInPane {
  versions: VersionOfWorkbook[] | null;
  look: LookAtVersion | null;
}
/** The sort open in the side pane (stand-in, partial: tables/sort-pane.ts is untyped). */
export interface SortInPane {
  cellsTyped?: string;
}
export interface DropdownPane {
  kind: 'dropdown';
  editor: DropdownEditorInPane;
}
export interface ConditionalFormatsPane {
  kind: 'conditionalFormats';
  rules: RulesInPane;
}
export interface VersionHistoryPane {
  kind: 'versionHistory';
  history: VersionHistoryInPane;
}
export interface SortPane {
  kind: 'sort';
  sort: SortInPane;
}
export type SidePane = DropdownPane | ConditionalFormatsPane | VersionHistoryPane | SortPane;
export type SidePaneKind = SidePane['kind'];
export interface CellHistory {
  cell: CellId;
  canRowBeRead: boolean;
  heldAtChangeCount: number;
  hasChangedSinceAsked: boolean;
  looksInVainInARow: number;
}
export type WhyAgentIsNotAskedWhichRows = 'notToBeHad' | 'rateLimited';
export interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
}
export interface TimeRow {
  time: TimeOfDay;
  shown: string | null;
}
export interface TimeList {
  cellId: CellId;
  rows: TimeRow[];
  isChosen: boolean;
}
export interface CaretInText {
  text: string;
  start: number;
  end: number;
}
export interface FunctionList {
  typedFrom: number;
  typedTo: number;
  isHighlightedByKey: boolean;
}
export type GuideSaid = 'never' | 'atOnce' | 'afterRest';
export interface FunctionGuide {
  argumentCount: number | null;
  said: GuideSaid;
}
export interface BracketPair {
  opensAt: number;
  closesAt: number;
}
export interface FormulaHelp {
  caret: CaretInText | null;
  caretAfterPick: CaretInText | null;
  writtenWhole: string | null;
  listShutAt: string | null;
  allAskedForAt: string | null;
  list: FunctionList | null;
  guide: FunctionGuide | null;
  brackets: BracketPair | null;
}
export type WhyFixCameToNothing = 'noFormula' | 'rateLimited' | 'callFailed' | 'other' | 'tooLarge';
export interface FixThatCameToNothing {
  cellId: CellId;
  atChangeCount: number;
  isNoticeUp: boolean;
  mayGoBetterAgain: boolean;
  why: WhyFixCameToNothing;
}
export type AgentOfFormulaFromWords = 'unchecked' | 'checking' | 'available' | 'unavailable' | 'notToBeHad';
export interface FormulaOffered {
  kind: 'offered';
  hasCallFailed: boolean;
  isDrawn: boolean;
}
export interface FormulaAsked {
  kind: 'asked';
  askId: number;
  words: string;
}
export interface FormulaProposed {
  kind: 'proposed';
  words: string;
  isArriving: boolean;
  isDiscardHighlighted: boolean;
}
export interface FormulaCameToNothing {
  kind: 'cameToNothing';
  words: string;
  why: string;
}
export type FormulaFromWordsStage = FormulaOffered | FormulaAsked | FormulaProposed | FormulaCameToNothing;
export interface FormulaFromWords {
  agent: AgentOfFormulaFromWords;
  hasAgentBeenMissed: boolean;
  askCount: number;
  isWavedOff: boolean;
  actsHeld: number;
  stage: FormulaFromWordsStage | null;
  fixThatCameToNothing: FixThatCameToNothing | null;
}
/** A fix to offer, at the cell whose error it fixes, with the copies of that cell's formula (stand-in, partial: formulas/fix/cells-to-fix.ts is untyped). */
export interface FixToOffer {
  origin: CellId;
  copies: CellId[];
}
/** The fixes to offer: none, those found, or not yet known while errors are worked out. */
export type FixesToOffer = FixToOffer[] | 'yetToBeKnown' | null;
/** The fixes being asked of the agent and shown (stand-in, partial: formulas/fix/fixes-on-cells.ts is untyped). */
export interface FixesBeingMade {
  sheetId: SheetId;
  atChangeCount: number;
  isOfSelection: boolean;
  isKept: boolean;
  pointedAt: CellId | null;
  hasPersonLeft: boolean;
}
export interface FixesOnCells {
  toOffer: FixesToOffer;
  toOfferInSelection: FixesToOffer;
  stage: FixesBeingMade | null;
  cameToNothingAt: number | null;
  askCount: number;
  isEndToldDuringAct: boolean;
  offerDueBackOn: SheetId[];
}
export interface FormulasLostToLastAct {
  act: string;
  cells: string | null;
  areColumnsDeleted?: true;
  atChangeCount: number;
}
export interface MoveOfColumnsUnanswered {
  moved: Omit<ColumnsOfTableMoving, 'landsAt' | 'count' | 'isToMove'>;
  before: WorkbookReads;
}
export interface ErrorsAtOpening {
  count: number;
  first: CellId;
  last: CellId;
}
export interface ErrorsFound {
  sheetId: SheetId;
  count: number;
}
export type ErrorsFoundAtOpening = 'toBeRead' | ErrorsFound | null;
export interface SelectionOfOther {
  userId: string;
  selection: CellSelection;
}
export interface SelectionForAgent {
  sheetNumber: number;
  range: string;
  activeCell: string;
}
export interface SelectedToldToAgent {
  byAddress: SelectionForAgent | null;
}
export interface TableRead {
  isLatest: boolean;
}
export type TableNotFormatted = CellId;
export interface CopiedCells extends CellSelection {
  cutToken: string | null;
}
/** The notice that an edit was refused, as every act that refuses one tells it: edit-answers' notice, with the reasons the other acts give. */
export interface EditRefusedOnPage {
  kind: 'editRefused';
  why: RefusalMessageKey | EditRefusedNotice['why'] | PasteRefusedNotice['why'] | DuplicateRefusedNotice['why'] | 'nothingLeftInSight';
  asked: AskedKindOfEdit;
  mergedCells?: EditAnswerRefusedNotice['mergedCells'];
  isTypingLost?: boolean;
}
/** Stand-in (state/event-reducer.ts): the sort asked for left the rows as they were; the column is its letters. */
export interface AlreadySortedNotice {
  kind: 'alreadySorted';
  column: string;
}
/** Stand-in (formulas/fix/fixes-on-cells.ts, untyped): calls to the agent for fixes failed. */
export interface CallsForFixesFailedNotice {
  kind: 'callsForFixesFailed';
  why: WhyFixCameToNothing;
}
/** Stand-in (state/event-reducer.ts): the copy asked for was refused, as the event told it. */
export interface CellsNotCopiedNotice extends Omit<CopyRefused, 'kind'> {
  kind: 'cellsNotCopied';
}
/** Stand-in (state/event-reducer.ts): charts are still being copied, for a paste or a sheet's duplicate. */
export interface ChartsBeingCopiedNotice {
  kind: 'chartsBeingCopied';
  copiedFor: ChartNodesCopiedFor['kind'];
}
/** Stand-in (state/page-reducer.ts): the cells typed for a dropdown were refused once the entry left them. */
export interface DropdownCellsRefusedNotice {
  kind: 'dropdownCellsRefused';
  refused: DropdownCellsRefused;
}
/** Stand-in (editor/entries-answered-later.ts, untyped): entries answered late were not kept, at these cells. */
export interface EntriesNotKeptNotice {
  kind: 'entriesNotKept';
  cells: string[];
}
/** Stand-in (import/text-file.ts, state/event-reducer.ts): a file was not imported, and why. */
export interface FileNotImportedNotice {
  kind: 'fileNotImported';
  why: FileToImportNotRead['why'] | 'empty';
}
/** Stand-in (links/sheet-links.ts, untyped): a link to the sheet was not copied, and why. */
export interface LinkNotCopiedNotice {
  kind: 'linkNotCopied';
  why: string;
}
/** Stand-in (ui/find-replace.ts, untyped): matches that were not replaced, and how many. */
export interface MatchesNotReplacedNotice {
  kind: 'matchesNotReplaced';
  count: number;
}
/** Stand-in (selection/several-ranges.ts): an act takes one range, and several are selected. */
export interface OneRangeNeededNotice {
  kind: 'oneRangeNeeded';
  act: string;
}
/** Stand-in (tables/own-filters.ts, untyped): the page's own filter could not be worked out, and why. */
export interface OwnFilterNotWorkedOutNotice {
  kind: 'ownFilterNotWorkedOut';
  why: string;
}
/** Stand-in (tables/own-filters.ts, untyped): the page's own sort is over, and why. */
export interface OwnSortIsOverNotice {
  kind: 'ownSortIsOver';
  why: 'tableIsGone' | 'tableChanged' | 'columnIsGone';
}
/** Stand-in (state/event-reducer.ts): texts pasted were not converted to numbers, and how many. */
export interface TextsNotConvertedNotice {
  kind: 'textsNotConverted';
  count: number;
}
/** Stand-in (history/version-history.ts, untyped): an earlier version was not restored, shown, or the agent's turn not undone, and why. */
export interface VersionNotTakenNotice {
  kind: 'versionNotTakenBack' | 'versionNotShown' | 'turnOfAgentNotUndone';
  why: string;
}
/** Stand-in: notices that tell nothing more than their kind, from untyped modules and state/event-reducer.ts. */
export interface NoticeWithoutDetail {
  kind:
    | 'chartNotCut'
    | 'chartsLeftBehindByDuplicate'
    | 'entryDroppedByRemoval'
    | 'entryNotForCheckbox'
    | 'filteredTableIsGone'
    | 'fixesCameToNothing'
    | 'fixesGoneWithChange'
    | 'linkHeldByCommentMode'
    | 'mergeWouldClearCells'
    | 'noTableToFilter'
    | 'undoStepsLeftInEarlierPage';
}
/** A notice the page tells at the foot of the grid. */
export type Notice =
  | EditRefusedOnPage
  | CellHoldsNoMorePeopleNotice
  | GroupsTooDeepNotice
  | LinesInTheWayNotice
  | SheetNameRefusedNotice
  | StepNotTakenNotice
  | AlreadySortedNotice
  | CallsForFixesFailedNotice
  | CellsNotCopiedNotice
  | ChartsBeingCopiedNotice
  | DropdownCellsRefusedNotice
  | EntriesNotKeptNotice
  | FileNotImportedNotice
  | LinkNotCopiedNotice
  | MatchesNotReplacedNotice
  | OneRangeNeededNotice
  | OwnFilterNotWorkedOutNotice
  | OwnSortIsOverNotice
  | TextsNotConvertedNotice
  | VersionNotTakenNotice
  | NoticeWithoutDetail;
/** The news that an entry being typed was dropped, by a merge or by the removal of its cell. */
export interface EntryDropped {
  kind: 'entryDroppedByMerge' | 'entryDroppedByRemoval';
}
/** News that something typed or edited was lost. */
export type NewsOfLoss = EditsDropped | EntryDropped;
/** The results that changed under a sort or a move of columns (stand-in: tables/sort-changed-results.ts is untyped). */
export interface ResultsChanged {
  firstCell: string;
  count: number;
  errorCount: number;
}
/** Stand-in (tables/sort.ts, tables/sort-pane.ts, untyped): the offer to undo a sort made with no keyboard. */
export interface SortedWithNoKeyboardOffer {
  kind: 'sortedWithNoKeyboard';
  column: string;
  direction: SortDirection;
  isSaved: boolean;
}
/** Stand-in (tables/sort-changed-results.ts, untyped): the offer to undo a sort that changed results. */
export interface SortChangedResultsOffer {
  kind: 'sortChangedResults';
  column: string;
  direction: SortDirection;
  results: ResultsChanged;
  isSaved: boolean;
}
/** Stand-in (tables/sort-changed-results.ts, untyped): the offer to undo a move of columns that changed results. */
export interface MoveOfColumnsChangedResultsOffer {
  kind: 'moveOfColumnsChangedResults';
  count: number;
  results: ResultsChanged;
  isSaved: boolean;
}
/** Stand-in (edits/rows-out-of-view.ts, untyped): the offer to undo a deletion of rows or columns, between their labels. */
export interface LinesDeletedOffer extends LabelEnds {
  kind: 'rowsDeleted' | 'columnsDeleted';
  isSaved: boolean;
}
/** The offer to undo a move that replaced cells (selection/move-cells.ts). */
export interface MoveReplacedCellsOffer extends CellsReplaced {
  kind: 'moveReplacedCells';
}
/** Stand-in (selection/fill-handle.ts): the offer to undo a fill made by finger, at the cells filled. */
export interface FilledByFingerOffer {
  kind: 'filledByFinger';
  cells: string;
}
/** Stand-in (editor/start-entry.ts, untyped): the offer to undo cells cleared with no keyboard. */
export interface ClearedWithNoKeyboardOffer {
  kind: 'clearedWithNoKeyboard';
  cells: string;
  isSaved: boolean;
}
/** Stand-in (format/merge-cells.ts, untyped): the offer to undo a merge that cleared cells, and the cell it kept. */
export interface MergeClearedCellsOffer {
  kind: 'mergeClearedCells';
  cells: string;
  keptCell: string;
}
/** Stand-in (chips/dropdown-editor.ts, untyped): the offer to undo a dropdown that cleared cells. */
export interface DropdownClearedCellsOffer {
  kind: 'dropdownClearedCells';
  cells: string;
  isOneCell: boolean;
  formulaCount: number;
  otherCount: number;
  isSaved: boolean;
}
/** Stand-in (chips/dropdown-editor.ts, untyped): the offer to undo options gone, which cleared cells. */
export interface OptionsGoneClearedCellsOffer {
  kind: 'optionsGoneClearedCells';
  count: number;
  isSaved: boolean;
}
/** Stand-in (chips/dropdown-editor.ts, untyped): the offer to undo the deletion of an option. */
export interface DropdownOptionDeletedOffer {
  kind: 'dropdownOptionDeleted';
  label: string;
  cellCount: number;
  onlyIn: string | null;
  isSaved: boolean;
}
/** Stand-in (charts/placed-views.ts, untyped): the offer to undo the deletion of a placed view. */
export interface PlacedViewDeletedOffer {
  kind: 'placedViewDeleted';
  name: string;
  isSaved: boolean;
}
/** Stand-in (ui/find-replace.ts, format/texts-to-numbers.ts, untyped): the offer to undo a replace or a conversion, and the cells left out. */
export interface CellsCountedOffer {
  kind: 'replacedInCells' | 'textsConverted';
  count: number;
  leftCount: number;
}
/** Stand-in (import/bring-in.ts, untyped): the offer to undo an import as a new sheet. */
export interface TableImportedAsNewSheetOffer {
  kind: 'tableImportedAsNewSheet';
  sheetName: string;
  rowCount: number;
  isSaved: boolean;
}
/** Stand-in (import/bring-in.ts, untyped): the offer to undo an import into a sheet. */
export interface TableImportedIntoSheetOffer {
  kind: 'tableImportedIntoSheet';
  sheetName: string;
  isReplaced: boolean;
  addedCount: number;
  changedCount: number;
  isSaved: boolean;
}
/** Stand-in (history/version-history.ts, untyped): the offer to undo the restore of a version. */
export interface VersionRestoredOffer {
  kind: 'versionRestored';
  atMs: number;
  isSaved: boolean;
}
/** An offer to undo what was just done. */
export type UndoOffer =
  | SheetDeletedUndoOffer
  | SortedWithNoKeyboardOffer
  | SortChangedResultsOffer
  | MoveOfColumnsChangedResultsOffer
  | LinesDeletedOffer
  | MoveReplacedCellsOffer
  | FilledByFingerOffer
  | ClearedWithNoKeyboardOffer
  | MergeClearedCellsOffer
  | DropdownClearedCellsOffer
  | OptionsGoneClearedCellsOffer
  | DropdownOptionDeletedOffer
  | PlacedViewDeletedOffer
  | CellsCountedOffer
  | TableImportedAsNewSheetOffer
  | TableImportedIntoSheetOffer
  | VersionRestoredOffer;
export interface MarksOfImport {
  sheetId: SheetId;
}
export interface FormatAsTableChosenLast {
  isOn: boolean;
  before: TableNotFormatted[];
}
export interface ChartBeingMade {
  nth: number;
}
export type SavingState = 'allSaved' | 'saving' | 'retrying' | 'stopped' | 'stoppedOutOfDate' | 'stoppedOutOfDateWithUnsavedEdits';
export interface SavingProgress {
  unsavedEditCount: number;
  mostUnsavedEditCount: number;
  wait: Wait | null;
  isBarUp: boolean;
}
export type CaretAtEnd = 'rows' | 'columns';
export interface CommentsWithAgent {
  handles: string[];
  wait: Wait;
}
export type CellsOfComment = Pick<CellSelection, 'activeCell' | 'selectionCorner'>;
export interface GoneTo {
  cells: CellsChanged;
  chart: string | null;
}
export type FollowsOnOneSheet = 'no' | 'yetToMove' | 'hasMoved';
export type TurnOfAgent = 'nothingSaid' | 'saidToBeWorking' | 'saidAndHasEdited';
export type SaidOfAgent = { what: 'isWorking'; staysWhileCursorShows: boolean } | { what: 'madeChanges' };
/** The part of a sheet a find looks in: its rows and columns, and the area they came from (ui/find.ts). */
export interface FindWithin {
  rows: IdRun[];
  columns: IdRun[];
  at: CellArea;
}
export interface FindOptions {
  matchesCase: boolean;
  isWholeCell: boolean;
  isInFormulas: boolean;
  within: FindWithin | 'allSheets' | null;
}
/** A cell a find matched, and where it is (ui/find.ts). */
export interface FindHit {
  cellId: CellId;
  sheetIndex: number;
  rowIndex: number;
  columnIndex: number;
}
/** The first and last cells a capped find matched. */
export interface EndsOfFindHits {
  first: FindHit;
  last: FindHit;
}
export interface Find {
  text: string;
  options: FindOptions;
  selectedAtFirst: FindWithin | null;
  hits: FindHit[];
  ends: EndsOfFindHits | null;
  roomAboveGrid: number;
  isReplaceShown: boolean;
  isCapped: boolean;
  editsSinceLooked: number;
}
export type FontMark = 'bold' | 'italic' | 'underline' | 'strikethrough';
export interface StretchOfLooks {
  length: number;
  marks: FontMark[];
  link: string | null;
}
export interface EntryLooks {
  stretches: StretchOfLooks[];
  lists: ListLine[];
}
export interface EntryLooksKept {
  text: string;
  looks: EntryLooks;
}
export interface EntryLooksInHistory {
  toUndo: EntryLooksKept[];
  toRedo: EntryLooksKept[];
}
export interface OwnFilterTried {}
export interface XlsxFileSaved {
  went: string;
}
export type ChartKindOffered = 'line' | 'bar' | 'stackedBar' | 'pie';
export interface ChartOnOffer {
  kind: ChartKindOffered;
  isForPage: boolean;
  isBestLeftToAgent: boolean;
}
export interface ErrorsOffer {
  first: CellId;
  last: CellId;
  firstWithAnError: CellId;
  endOfTable: CellId | null;
}
export interface ErrorsOffered {
  sheetId: SheetId;
  count: number;
  baseline: number;
  offer: ErrorsOffer | null;
}
export type CueForCards = 'toCome' | 'given' | 'now';
/** The card open on a row of a list: the row it is of, the row of the card gone to, and whether it is still as opened (stand-in: ui/list-cards.ts is untyped). */
export interface CardOfList {
  ofRow: string;
  wentTo: string | null;
  isAsOpened?: true;
}
export interface DropdownOpen {
  /** The key of the row highlighted in the list (chips/dropdown-options.ts). */
  highlighted: string | null;
  card: CardOfList | null;
  scrollAsItOpened: GridScroll;
  isCardOfPointerAlone: boolean;
  isWalkedByKeys: boolean;
  cueForCards: CueForCards;
  isNewOptionBeingNamed: boolean;
  timesNewOptionAsked: number;
}
/** Every edit since a version, taken back to restore that version. */
export interface TakingBackAllSinceVersion {
  kind: 'allSinceVersion';
  version: VersionOfWorkbook;
}
/** The edits of the agent's last turn, taken back. */
export interface TakingBackTurnOfAgent {
  kind: 'turnOfAgent';
  edits: UndoOfTurnOffered['edits'];
}
/** What is being taken back. */
export type WhatIsTakenBack = TakingBackAllSinceVersion | TakingBackTurnOfAgent;
/** Edits being taken back (stand-in, partial: history/version-history.ts is untyped). */
export interface TakingBack {
  askId: number;
  what: WhatIsTakenBack;
}
export type AnswerHoldStands = 'awaited' | 'landed' | 'seen';
export interface AnswerHold {
  stands: AnswerHoldStands;
  actsHeld: number;
  seenSinceMs: number | null;
}
export interface RulesOfAgentKept {
  sheetId: SheetId;
  workbookChangeCount: number;
}
export interface ReadySet {}
export interface RowAddedAfterEntries {
  sheetId: SheetId;
  rowId: RowId;
}
export interface PeopleList {
  cellId: CellId;
  searchedFor: string;
  isOfPeopleAlone: boolean;
  scrollAsItOpened: GridScroll;
}
export interface SortToLookBackOn {
  atChangeCount: number;
}
export interface EntryUnanswered {
  cellId: CellId;
  text: string;
}
/** What was done last, when it was stepping out of the cells. */
export interface SteppedOutOfCells {
  what: 'steppedOutOfCells';
}
/** Stand-in: what was done last, told by its name alone. */
export interface DoneWithoutDetail {
  what:
    | 'agentStopped'
    | 'chartCopied'
    | 'entryCollapsed'
    | 'entryExpanded'
    | 'fixDiscarded'
    | 'formattedAsTable'
    | 'notFormattedAsTable'
    | 'formulaOfAgentDiscarded'
    | 'formulasShown'
    | 'resultsShown'
    | 'gridlinesHidden'
    | 'gridlinesShown'
    | 'importDiscarded'
    | 'linkCopied'
    | 'nothingToFill'
    | 'offerDiscarded'
    | 'ruleChanged'
    | 'scaleColorsNothing'
    | 'nothingToUndo'
    | 'nothingToRedo';
}
/** What was done last when an undo or a redo changed a place: its cells, the sheet shown, and how many ranges (state/edit-answers.ts). */
export interface StepShownDone {
  what: StepShown;
  cells: string | null;
  sheetShown?: string;
  rangeCount?: number;
}
/** Stand-in: what was done last to cells, at their address as stored; how many ranges when it was done to several. */
export interface DoneToCells {
  what:
    | 'pasted'
    | 'filled'
    | 'cleared'
    | 'moved'
    | 'merged'
    | 'unmerged'
    | 'replaced'
    | 'bordersCleared'
    | 'dropdownRemoved'
    | 'formattingCleared'
    | 'formulaAdded'
    | 'todayEntered'
    | 'dropdownSet'
    | 'checked'
    | 'unchecked'
    | 'checkboxesMade'
    | 'typedTextEntered'
    | 'typedTextChangedNothing'
    | 'formulaOfAgentEntered'
    | 'fixKept'
    | 'dropdownCellsSet'
    | 'dropdownOptionsSet'
    | 'takenOutOfSelection';
  cells: string;
  rangeCount?: number;
}
/** Stand-in (editor/commit-entry.ts, untyped): an entry emptied its cell. */
export interface EntryEmptiedCell {
  what: 'entryEmptiedCell';
  cells: string;
  isSaved: boolean;
}
/** Stand-in (format/format-commands.ts, editor/entry-looks.ts, untyped): cells were formatted; the cell entered in, when it was an entry. */
export interface FormattedDone {
  what: 'formatted';
  format: string;
  cellEnteredIn?: string;
  cells: string;
  rangeCount?: number;
}
/** Stand-in (format/borders.ts, untyped): borders were drawn on cells. */
export interface BordersDrawnDone {
  what: 'bordersDrawn';
  edges: string;
  cells: string;
  rangeCount?: number;
}
/** Stand-in (edits/insert-lines.ts, grid/resize-lines.ts, untyped): lines inserted or sized, between their labels; how many when several ranges hold them. */
export interface LinesDone extends LabelEnds {
  what: 'rowsInserted' | 'columnsInserted' | 'rowsSized' | 'columnsSized';
  heightInPixels?: number;
  widthInPixels?: number;
  lineCount?: number;
}
/** Stand-in (grid/freeze.ts, untyped): lines frozen, and how many. */
export interface LinesFrozenDone {
  what: 'rowsFrozen' | 'columnsFrozen';
  count: number;
}
/** Stand-in (grid/outline-groups.ts, untyped): lines grouped, ungrouped, collapsed or expanded, between their labels. */
export interface GroupDone extends LabelEnds {
  what: 'grouped' | 'ungrouped' | 'collapsed' | 'expanded';
  of: 'rows' | 'columns';
}
/** Stand-in (grid/outline-groups.ts, untyped): several groups collapsed or expanded. */
export interface GroupsDone {
  what: 'groupsCollapsed' | 'groupsExpanded';
  of: 'rows' | 'columns';
  groupCount: number;
}
/** Stand-in (grid/outline-groups.ts, untyped): groups shown to a level. */
export interface ShownToLevelDone {
  what: 'shownToLevel';
  of: 'rows' | 'columns';
  level: number;
}
/** Stand-in (charts/placed-views.ts, untyped): a placed view moved, sized, or its change undone or redone. */
export interface PlacedViewDone {
  what: 'placedViewMoved' | 'placedViewSized' | 'placedViewChangeUndone' | 'placedViewChangeRedone';
  name: string;
  cell?: string;
  widthInPixels?: number;
  heightInPixels?: number;
}
/** Stand-in (editor/entry-looks.ts, untyped): a mark set in an entry, or to type in. */
export interface MarkSetDone {
  what: 'markSetInEntry' | 'markSetToTypeIn';
  mark: FontMark;
  isOn: boolean;
}
/** Stand-in (editor/entry-looks.ts, untyped): a list set in an entry. */
export interface ListSetDone {
  what: 'listSetInEntry';
  list: string;
  isOn: boolean;
}
/** Stand-in (editor/entry-looks.ts, untyped): the box of a line of a checklist set. */
export interface BoxOfLineSetDone {
  what: 'boxOfLineSet';
  isChecked: boolean;
}
/** Stand-in (links/links-in-entry.ts, untyped): a link set in an entry. */
export interface LinkSetDone {
  what: 'linkSetInEntry';
  link: 'removed' | 'changed' | 'added';
}
/** Stand-in (formulas/reference-pointing.ts, untyped): what the arrow keys were given to. */
export interface ArrowsGivenToDone {
  what: 'arrowsGivenTo';
  to: 'text' | 'cells' | 'cellsElsewhere';
}
/** Stand-in (chips/calendar.ts, untyped): no date entered, for the cell holds a control. */
export interface NoDateEnteredDone {
  what: 'noDateEntered';
  cellHas: string;
  cell: string;
}
/** Stand-in (formulas/fix/fixes-on-cells.ts, untyped): a fix offered. */
export interface FixOfferedDone {
  what: 'fixOffered';
  formula: string;
  shown: string;
}
/** Stand-in (formulas/fix/fixes-on-cells.ts, untyped): fixes kept or discarded, and how many. */
export interface FixesCountedDone {
  what: 'fixesKept' | 'fixesDiscarded';
  count: number;
}
/** Stand-in (chips/dropdown-editor.ts, untyped): a dropdown started from a set of options. */
export interface DropdownStartedFromDone {
  what: 'dropdownStartedFrom';
  set: string;
  optionCount: number;
}
/** Stand-in (chips/dropdown-editor.ts, untyped): the header row of a dropdown set. */
export interface HeaderRowSetDone {
  what: 'headerRowSet';
  isOn: boolean;
  heading: string;
  cells: string;
}
/** Stand-in (chips/dropdowns.ts, untyped): an option of a dropdown moved. */
export interface DropdownOptionMovedDone {
  what: 'dropdownOptionMoved';
  label: string;
  place: number;
  optionCount: number;
}
/** Stand-in (chips/dropdowns.ts, untyped): an option of a dropdown removed. */
export interface DropdownOptionRemovedDone {
  what: 'dropdownOptionRemoved';
  label: string;
  isSaved: boolean;
}
/** Stand-in, partial (chips/dropdowns.ts, untyped): options added to a dropdown, and how many. */
export interface DropdownOptionsAddedDone {
  what: 'dropdownOptionsAdded';
  count: number;
  onlyIn?: null;
}
/** Stand-in (chips/dropdown-editor.ts, untyped): an offer to undo made, with the header row set by it. */
export interface UndoOfferMadeDone {
  what: 'undoOfferMade';
  offer: UndoOffer;
  headerRow?: HeaderRowSetDone;
}
/** Stand-in (chips/people-list.ts, untyped): a person added to a cell, removed, replaced, or the cell's contents replaced. */
export interface PeopleInCellDone {
  what: 'personAdded' | 'personRemoved' | 'peopleReplaced' | 'contentsReplaced';
  name: string;
  cell: string;
  heldNowCount?: number;
  replacedCount?: number;
  isSaved?: boolean;
}
/** Stand-in (format/conditional/, untyped): conditional formats added, moved, removed, or a column moved to numbers. */
export interface RulesDone {
  what: 'rulesAdded' | 'ruleMoved' | 'ruleRemoved' | 'movedToNumbers';
  ruleCount?: number;
  place?: number;
  column?: string;
  isSaved?: boolean;
}
/** Stand-in (tables/sort.ts, tables/own-filters.ts, untyped): rows sorted by a column. */
export interface RowsSortedDone {
  what: 'rowsSorted';
  column: string;
  direction: SortDirection;
}
/** Stand-in, partial (tables/sort.ts, tables/sort-pane.ts, untyped): cells sorted by a column. */
export interface CellsSortedDone {
  what: 'cellsSorted';
  column: string;
  direction: SortDirection;
  cells: string;
  rangeCount?: number;
}
/** Stand-in (selection/move-table-columns.ts): columns of a table moved, between their letters. */
export interface ColumnsOfTableMovedDone {
  what: 'columnsOfTableMoved';
  heading: string | null;
  count: number;
  first: string;
  last: string;
}
/** Stand-in (selection/move-cells.ts): a move over cells that replaced them. */
export interface MovedOverCellsDone extends CellsReplaced {
  what: 'movedOverCells';
}
/** Stand-in (state/event-reducer.ts): a sheet renamed, to its new name. */
export interface SheetRenamedDone {
  what: 'sheetRenamed';
  name: string;
}
/** Stand-in (agent/, formulas/sheet-pointed-in.ts, untyped): a sheet shown to follow the agent, or for a formula's reference. */
export interface SheetShownForDone {
  what: 'sheetShownToFollow' | 'sheetShownForFormula';
  name: string;
  entryCell?: string;
  entrySheet?: string;
}
/** Stand-in (ui/locale-time-zone-pick.ts, untyped): the time zone set. */
export interface TimeZoneSetDone {
  what: 'timeZoneSet';
  timeZone: string;
}
/** Stand-in (ui/locale-time-zone-pick.ts, untyped): the locale set. */
export interface LocaleSetDone {
  what: 'localeSet';
  locale: string;
}
/** Stand-in (grid/tall-cells.ts, untyped): more of a tall cell shown. */
export interface MoreOfCellShownDone {
  what: 'moreOfCellShown';
  cell: string;
}
/** Stand-in (keys/key-pressed.ts, untyped): words offered entered. */
export interface OfferedWordsEnteredDone {
  what: 'offeredWordsEntered';
  words: string;
}
/** What the page did last, told to screen readers. */
export type LastDone =
  | SheetMoved
  | OwnCellLost
  | EntryCameToError
  | CopiedCellsLetGo
  | CopiedOrCutDone
  | ChartPastedDone
  | (SheetShownDone & { isFormulaOfAgentDiscarded?: true })
  | LinkAddressShown
  | SteppedOutOfCells
  | DoneWithoutDetail
  | StepShownDone
  | DoneToCells
  | EntryEmptiedCell
  | FormattedDone
  | BordersDrawnDone
  | LinesDone
  | LinesFrozenDone
  | GroupDone
  | GroupsDone
  | ShownToLevelDone
  | PlacedViewDone
  | MarkSetDone
  | ListSetDone
  | BoxOfLineSetDone
  | LinkSetDone
  | ArrowsGivenToDone
  | NoDateEnteredDone
  | FixOfferedDone
  | FixesCountedDone
  | DropdownStartedFromDone
  | HeaderRowSetDone
  | DropdownOptionMovedDone
  | DropdownOptionRemovedDone
  | DropdownOptionsAddedDone
  | UndoOfferMadeDone
  | PeopleInCellDone
  | RulesDone
  | RowsSortedDone
  | CellsSortedDone
  | ColumnsOfTableMovedDone
  | MovedOverCellsDone
  | SheetRenamedDone
  | SheetShownForDone
  | TimeZoneSetDone
  | LocaleSetDone
  | MoreOfCellShownDone
  | OfferedWordsEnteredDone;
export interface CutJustMoved {
  token: string;
  toTopLeft: CellId;
}
export interface PointedReference {
  start: number;
  end: number;
  text: string;
}
export interface ReferenceInEntry {
  sheetId: SheetId;
}
export interface MarksOfImportToCome {
  sheetId: SheetId;
}
export interface CommentOnPage {
  handle: string;
  isResolved: boolean;
  isOpen: boolean;
  cells: CellsOfComment;
}
export type CellsChanged = Pick<CellSelection, 'activeCell' | 'selectionCorner'>;
export interface ChangeByAgent {
  cells: CellsChanged;
  isOfViewer?: boolean;
  isOfLayoutAlone?: boolean;
  fadeBeginsAtMs: number | null;
  /** The same change in other sheets (agent/changes-by-agent.ts, untyped). */
  inOtherSheets?: ChangeByAgent[];
  /** The cells changed, in groups that lie apart (agent/changes-by-agent.ts, untyped). */
  groupsApart?: CellsChanged[];
}
export interface RunOfAgentGoneTo {
  cells: CellsChanged;
}
export interface Followed {}
/** Where the agent shows the viewer: cells of a sheet, or a chart (agent/shown-by-agent.ts). */
export type PlaceShownByAgent =
  | { kind: 'cells'; sheetId: SheetId; cells: Pick<CellSelection, 'activeCell' | 'selectionCorner'> | null }
  | { kind: 'chart'; sheetId: SheetId; viewId: string };
/** What the agent shows the viewer (stand-in, partial: agent/shown-by-agent.ts is untyped). */
export interface ShownByAgent {
  place?: PlaceShownByAgent | null;
  staysOnSheet?: boolean;
}
export interface DoneByAgent {
  isCardUp: boolean;
}
/** The offer to take back the agent's last turn. */
export type UndoOfTurnOffered = NonNullable<ReturnType<typeof undoOfTurnOf>>;
export interface PageState extends CellSelection {
  sheetId: SheetId;
  scrollLeft: number;
  scrollTop: number;
  otherRanges: CellSelection[];
  cameToMergedCellsAt: CellId | null;
  leftByKeyAt: GridScroll | null;
  lastPresses: [Press | null, Press | null];
  movedClearOfColumnsTo: CellId | null;
  tabRun: TabRun | null;
  pagesTurnedForReader: number;
  scrolledForEntry: ScrolledForEntry | null;
  scrolledForNewChart: ScrolledForNewChart | null;
  gridWidth: number;
  gridHeight: number;
  pageWidth: number;
  scrolledForLessRoom: ScrollsForLessRoom | null;
  heightUnderWhatFloats: number;
  heightUnderCardAtFoot: number;
  noticesAtFoot: NoticesAtFoot | null;
  zoom: number;
  isOnPhone: boolean;
  isNarrowByTouch: boolean;
  boxesAtFootByTouch: BoxAtFoot[];
  sheetPointedIn: SheetId | null;
  placesLeft: Place[];
  ownCollapsing: Map<string, boolean>;
  rowsOutOfViewByOwnFilters: Map<SheetId, Set<RowId>>;
  ownRowOrders: Map<SheetId, IdRun[]>;
  isOwnRowOrderAwaited: boolean;
  ownFilters: Map<SheetId, OwnFilter[]>;
  ownFilterList: OwnFilterList | null;
  ownFilterTried: OwnFilterTried | null;
  rowsAskedFor: RowsAskedFor | null;
  filterKeptOnForColumnsCard: string | null;
  viewerId: string | null;
  dragging: Dragging | null;
  placementSelected: string | null;
  heldUntilAnswered: HeldUntilAnswered | null;
  pressesOnFillHandle: number;
  menu: Menu | null;
  customNumberFormat: CustomNumberFormat | null;
  pasteThatWaits: PasteThatWaits | null;
  pickForWorkbook: PickForWorkbook | null;
  examplesOfNumberFormats: ExamplesOfNumberFormats;
  isListOfKeysOpen: boolean;
  importOfAFile: ImportOfAFile | null;
  fileAwaited: FileAwaited | null;
  xlsxFileReady: XlsxFileSaved | null;
  xlsxFileYetToBeToldOf: XlsxFileSaved | null;
  importAskCount: number;
  sheetBeingRenamed: SheetBeingRenamed | null;
  leftByCaret: WhatCaretLeft | null;
  figuresOfSelection: FiguresOfSelection;
  selectionSeen: SelectionSeen;
  selectionLeftByPerson: SelectionSeen;
  chartsOnOffer: ChartOnOffer[];
  formatOfSelection: FormatOfSelection;
  borderPen: BorderPen;
  wordsOffered: WordsOffered | null;
  calendar: CalendarOpen | null;
  linkForm: LinkForm | null;
  explainedUnderCell: ExplainedUnderCell;
  reasonsForErrors: ReasonsForErrors;
  errorsOffered: ErrorsOffered | null;
  errorsReadAsOf: ErrorsReadAsOf | null;
  dropdown: DropdownOpen | null;
  sidePane: SidePane | null;
  versionHistoryAskCount: number;
  takingBack: TakingBack | null;
  cellHistory: CellHistory | null;
  conditionalFormatsAskCount: number;
  rowsAskedForAskCount: number;
  holdOnRowsFilteredByAgent: AnswerHold | null;
  whyAgentIsAskedWhichRowsOnlyAtEnter: WhyAgentIsNotAskedWhichRows | null;
  rulesOfAgentKept: RulesOfAgentKept | null;
  isAgentForRulesNotToBeHad: boolean;
  hasViewNoAgentForRules: boolean;
  readySets: ReadySet[] | null;
  timesSidePaneAsked: number;
  timesCalendarAsked: number;
  waysIn: WaysIn;
  areWaysInOutOfSight: boolean;
  isWindowLeft: boolean;
  notesOfSteps: NotesOfSteps;
  answerAwaited: AnswerAwaited;
  rowsAddedAfterEntries: RowAddedAfterEntries[];
  peopleList: PeopleList | null;
  timeList: TimeList | null;
  formulaHelp: FormulaHelp;
  formulaFromWords: FormulaFromWords;
  fixesOnCells: FixesOnCells;
  formulasLostToLastAct: FormulasLostToLastAct | null;
  sortToLookBackOn: SortToLookBackOn | null;
  moveOfColumnsUnanswered: MoveOfColumnsUnanswered | null;
  errorsAtOpening: ErrorsAtOpening | null;
  errorsFoundAtOpening: ErrorsFoundAtOpening;
  sheetsWhoseToastIsSpent: SheetId[];
  profilesById: Map<string, PersonProfile>;
  peopleLookedUpAtChangeCount: number | null;
  selectionsOfOthers: SelectionOfOther[];
  selectionToldToOthers: CellSelection | null;
  selectedToldToAgent: SelectedToldToAgent | null;
  askOwedToAgent: CellSelection | null;
  textToEditOfEntryCell: string;
  entriesUnanswered: EntryUnanswered[];
  areFormulasShown: boolean;
  tablesRead: Map<SheetId, TableRead>;
  tablesNotFormatted: TableNotFormatted[];
  density: CellDensity;
  lastDone: LastDone | null;
  hasLastHeldEdgeMoved: boolean;
  copiedCells: CopiedCells | null;
  cutJustMoved: CutJustMoved | null;
  mode: PageMode;
  pointedReference: PointedReference | null;
  referencesInEntry: ReferenceInEntry[];
  notice: Notice | null;
  newsOfLoss: NewsOfLoss | null;
  isEntryEndedUnasked: boolean;
  undoOffer: UndoOffer | null;
  isSelectionJustImported: boolean;
  marksOfImport: MarksOfImport | null;
  marksOfImportToCome: MarksOfImportToCome | null;
  stepsToUndo: number;
  stepsToRedo: number;
  formatAsTableChosenLast: FormatAsTableChosenLast | null;
  chartBeingMade: ChartBeingMade | null;
  areStepsToUndoLost: boolean;
  saving: SavingState;
  hasUnsavedEdits: boolean;
  isLargeEditUnsaved: boolean;
  savingProgress: SavingProgress | null;
  calculatingShown: CalculatingShown;
  longCalculationTold: LongCalculationTold;
  isActShownAsCalculated: boolean;
  areFormulasShownAsLeft: boolean;
  isAgentWorking: boolean;
  isSteppedOutOfCells: boolean;
  caretAtEnd: CaretAtEnd | null;
  isCommentModeOn: boolean;
  isCommentModeForACard: boolean | null;
  isCommentModeLeftByPress: boolean;
  hasCommentModeRefused: boolean;
  doesCommentModePickCells: boolean;
  isPressToComment: boolean;
  comments: CommentOnPage[] | null;
  commentsPointedAt: string[];
  commentsWithAgent: CommentsWithAgent | null;
  newCommentOn: CellsOfComment | null;
  isChatBehindButton: boolean;
  isChatBeside: boolean | null;
  isComposerOpen: boolean;
  changesByAgent: ChangeByAgent[];
  isFollowingAgent: boolean;
  followsOnOneSheet: FollowsOnOneSheet;
  movesOfViewByItself: number;
  hasPersonTakenViewBack: boolean;
  writtenInTurnOfAgent: CellsChanged[];
  waitForNextEditOfAgent: Wait | null;
  changedSinceRest: CellsChanged[];
  heldAsSheetOpened: CellsChanged[];
  changedOffShowSinceRest: CellsChanged[] | null;
  chartGoneToSinceRest: string | null;
  runOfAgentGoneTo: RunOfAgentGoneTo | null;
  lastGoneTo: GoneTo | null;
  isFirstBuild: boolean;
  followed: Followed | null;
  shownByAgent: ShownByAgent | null;
  changesAskedFor: number;
  turnOfAgent: TurnOfAgent;
  doneByAgent: DoneByAgent | null;
  undoOfTurnOffered: UndoOfTurnOffered | null;
  isUndoOfTurnNotToBeHad: boolean;
  saidOfAgent: SaidOfAgent | null;
  find: Find | null;
  contextBarMenu: string | null;
  offersAtSelection: OffersAtSelection;
  workbookChangeCount: number;
  formulasWorkedOutCount: number;
}
export function createInitialPageState(
  reads: ReadsWithTextMeasurer,
  savedPlace: SavedPlace | null,
  areStepsToUndoLost: boolean = false,
  density: CellDensity = DEFAULT_CELL_DENSITY,
  tablesNotFormatted: TableNotFormatted[] = [],
  canImportFiles: boolean = true,
): PageState | null {
  let place = restoredPlace(reads, savedPlace);
  if (place === null) return null;
  let state: PageState = {
    ...place,
    otherRanges: [],
    cameToMergedCellsAt: null,
    leftByKeyAt: null,
    lastPresses: [null, null],
    movedClearOfColumnsTo: null,
    tabRun: null,
    rangeWalked: null,
    pagesTurnedForReader: 0,
    scrolledForEntry: null,
    scrolledForNewChart: null,
    gridWidth: 0,
    gridHeight: 0,
    pageWidth: 0,
    scrolledForLessRoom: savedPlace?.scrolledForLessRoom ?? null,
    heightUnderWhatFloats: 0,
    heightUnderCardAtFoot: 0,
    noticesAtFoot: null,
    zoom: 1,
    isOnPhone: false,
    isNarrowByTouch: false,
    boxesAtFootByTouch: NO_BOXES_AT_FOOT,
    sheetPointedIn: null,
    placesLeft: [],
    ownCollapsing: NO_OWN_COLLAPSING,
    rowsOutOfViewByOwnFilters: NO_ROWS_OUT_OF_VIEW_BY_FILTERS,
    ownRowOrders: NO_OWN_ROW_ORDERS,
    isOwnRowOrderAwaited: false,
    ownFilters: NO_OWN_FILTERS,
    ownFilterList: null,
    ownFilterTried: null,
    rowsAskedFor: null,
    filterKeptOnForColumnsCard: null,
    viewerId: null,
    dragging: null,
    placementSelected: null,
    heldUntilAnswered: null,
    pressesOnFillHandle: 0,
    menu: null,
    customNumberFormat: null,
    pasteThatWaits: null,
    pickForWorkbook: null,
    examplesOfNumberFormats: numberFormatExamples(reads),
    isListOfKeysOpen: false,
    importOfAFile: null,
    fileAwaited: null,
    xlsxFileReady: null,
    xlsxFileYetToBeToldOf: null,
    importAskCount: 0,
    sheetBeingRenamed: null,
    leftByCaret: null,
    figuresOfSelection: NO_FIGURES_OF_SELECTION,
    selectionSeen: {
      cellsAre: 'empty',
      isSoOfEveryCell: true,
      areAllRead: true,
      shape: 'cell',
    },
    selectionLeftByPerson: {
      cellsAre: 'empty',
      isSoOfEveryCell: true,
      areAllRead: true,
      shape: 'cell',
    },
    chartsOnOffer: [],
    formatOfSelection: makeFormatOfSelection(DEFAULT_CELL_FORMAT, reads, CELL_FORMAT_CHOICES, true, 'left', {
      lines: NO_AREA_BORDERS,
      isFromSample: false,
    }),
    borderPen: DEFAULT_BORDER_PEN as BorderPen,
    wordsOffered: null,
    calendar: null,
    linkForm: null,
    explainedUnderCell: NOTHING_EXPLAINED_UNDER_CELL,
    reasonsForErrors: {
      ofEntryCell: null,
      ofCellExplained: null,
      cellToFixInPlace: null,
      isFixInPlaceYetToBeKnown: false,
      isEntryCellToFixInPlace: false,
      isFixAtEntryCellYetToBeKnown: false,
      doCausesWaitForCalculation: false,
    },
    errorsOffered: null,
    errorsReadAsOf: null,
    dropdown: null,
    sidePane: null,
    versionHistoryAskCount: 0,
    takingBack: null,
    cellHistory: null,
    conditionalFormatsAskCount: 0,
    rowsAskedForAskCount: 0,
    holdOnRowsFilteredByAgent: null,
    whyAgentIsAskedWhichRowsOnlyAtEnter: null,
    rulesOfAgentKept: null,
    isAgentForRulesNotToBeHad: false,
    hasViewNoAgentForRules: false,
    readySets: null,
    timesSidePaneAsked: 0,
    timesCalendarAsked: 0,
    waysIn: waysInAtOpening(reads, canImportFiles),
    areWaysInOutOfSight: false,
    isWindowLeft: false,
    notesOfSteps: NO_NOTES_OF_STEPS,
    answerAwaited: null,
    rowsAddedAfterEntries: [],
    peopleList: null,
    timeList: null,
    formulaHelp: EMPTY_FORMULA_HELP,
    formulaFromWords: FORMULA_FROM_WORDS_START as FormulaFromWords,
    fixesOnCells: NO_FIXES_ON_CELLS,
    formulasLostToLastAct: null,
    sortToLookBackOn: null,
    moveOfColumnsUnanswered: null,
    errorsAtOpening: null,
    errorsFoundAtOpening: 'toBeRead',
    sheetsWhoseToastIsSpent: [],
    profilesById: new (Map as MapConstructor)<string, PersonProfile>(),
    peopleLookedUpAtChangeCount: null,
    selectionsOfOthers: [],
    selectionToldToOthers: null,
    selectedToldToAgent: null,
    askOwedToAgent: null,
    textToEditOfEntryCell: '',
    entriesUnanswered: [],
    areFormulasShown: false,
    tablesRead: NO_TABLES_READ,
    tablesNotFormatted: tablesNotFormatted,
    density: savedPlace?.density ?? density,
    lastDone: null,
    hasLastHeldEdgeMoved: false,
    copiedCells: null,
    cutJustMoved: null,
    mode: NAVIGATING_MODE,
    pointedReference: null,
    referencesInEntry: NO_REFERENCES,
    notice: null,
    newsOfLoss: null,
    isEntryEndedUnasked: false,
    undoOffer: null,
    isSelectionJustImported: false,
    marksOfImport: null,
    marksOfImportToCome: null,
    stepsToUndo: 0,
    stepsToRedo: 0,
    formatAsTableChosenLast: null,
    chartBeingMade: null,
    areStepsToUndoLost: areStepsToUndoLost,
    saving: 'allSaved',
    hasUnsavedEdits: false,
    isLargeEditUnsaved: false,
    savingProgress: null,
    calculatingShown: CALCULATING_NOT_SHOWN as CalculatingShown,
    longCalculationTold: NO_LONG_CALCULATION as LongCalculationTold,
    isActShownAsCalculated: false,
    areFormulasShownAsLeft: false,
    isAgentWorking: false,
    isSteppedOutOfCells: false,
    caretAtEnd: null,
    isCommentModeOn: false,
    isCommentModeForACard: false,
    isCommentModeLeftByPress: false,
    hasCommentModeRefused: false,
    doesCommentModePickCells: false,
    isPressToComment: false,
    comments: null,
    commentsPointedAt: [],
    commentsWithAgent: null,
    newCommentOn: null,
    isChatBehindButton: true,
    isChatBeside: false,
    isComposerOpen: false,
    changesByAgent: [],
    isFollowingAgent: false,
    followsOnOneSheet: 'no',
    movesOfViewByItself: 0,
    hasPersonTakenViewBack: false,
    writtenInTurnOfAgent: [],
    waitForNextEditOfAgent: null,
    changedSinceRest: [],
    heldAsSheetOpened: [],
    changedOffShowSinceRest: [],
    chartGoneToSinceRest: null,
    runOfAgentGoneTo: null,
    lastGoneTo: null,
    isFirstBuild: false,
    followed: null,
    shownByAgent: null,
    changesAskedFor: 0,
    turnOfAgent: 'nothingSaid',
    doneByAgent: null,
    undoOfTurnOffered: null,
    isUndoOfTurnNotToBeHad: false,
    saidOfAgent: null,
    find: null,
    contextBarMenu: null,
    offersAtSelection: NO_OFFERS_AT_SELECTION,
    workbookChangeCount: 0,
    formulasWorkedOutCount: 0,
  };
  let { scrollTop: scrollTop, scrollLeft: scrollLeft } = keepScrollAnchoredAcrossChange(
    {
      ...state,
      density: density,
      gridWidth: 1440,
      gridHeight: 800,
    },
    reads,
    reads,
    state,
  );
  let scrolledState: PageState = {
    ...state,
    density: density,
    scrollTop: scrollTop,
    scrollLeft: scrollLeft,
  };
  return updateFiguresOfSelection(null, followEntryCellText(null, settleSelectionSeen(null, scrolledState, reads), reads), reads, false);
}
