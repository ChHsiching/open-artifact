import type { Dynamic } from '../../dynamic.ts';
export function contextToolsShapeOf({
  cellsAre: cellsAre,
  isSoOfEveryCell: isSoOfEveryCell,
  areAllRead: areAllRead,
  shape: shape,
}: Dynamic) {
  if (shape === 'cells') {
    let severalShape = SEVERAL_CELLS_SHAPE_OF_KIND[cellsAre];
    return severalShape !== undefined && (isSoOfEveryCell || severalShape === 'numbers' || (severalShape === 'checkboxes' && areAllRead))
      ? severalShape
      : 'cells';
  }
  if (shape !== 'cell') return shape;
  if (cellsAre === 'trueOrFalse' && !isSoOfEveryCell) return 'neverWraps';
  return cellsAre === 'mixed' ? 'text' : cellsAre;
}
export function nextContextToolsState(state: Dynamic, selection: Dynamic, { isHeld: isHeld, isRestedOn: isRestedOn }: Dynamic) {
  let isFirstSeen = state.actSeen === null;
  if (isHeld && !isFirstSeen) return state;
  let actSeen = isHeld || isRestedOn ? selection.selectionLeftByPerson : null;
  if (actSeen === state.actSeen && !isFirstSeen) return state;
  let shown = contextToolsShapeOf(isFirstSeen || actSeen === null ? selection.selectionSeen : actSeen);
  let isSortAndFilterOnBar2 = selection.isSortAndFilterOnBar;
  return shown === state.shown && isSortAndFilterOnBar2 === state.hasSortAndFilter && actSeen === state.actSeen
    ? state
    : {
        shown: shown,
        hasSortAndFilter: isSortAndFilterOnBar2,
        actSeen: actSeen,
      };
}
export function contextToolSlotCount(barLayout?: Dynamic, isSwipedRow?: Dynamic) {
  if (isSwipedRow) return 'all';
  return barLayout.includes('section') ? 0 : 4;
}
export function contextToolsOfShape(shape: Dynamic, { hasSortAndFilter = false, formatsThatFit: formatsThatFit }: Dynamic) {
  let tools =
    (formatsThatFit?.includes('dropdown') ?? true)
      ? CONTEXT_TOOLS_OF_SHAPE[shape]
      : CONTEXT_TOOLS_OF_SHAPE[shape].filter((input?: Dynamic) => input !== 'asDropdown');
  return hasSortAndFilter && !tools.includes('sort') ? ['sort', ...tools] : tools;
}
export function contextToolsThatFit(shape?: Dynamic, slots?: Dynamic, options: Dynamic = {}) {
  let roomLeft: Dynamic = slots === 'all' ? 1 / 0 : slots * (CONTEXT_TOOL_WIDTH + CONTEXT_TOOL_GAP);
  let toolsThatFit = new (Set as Dynamic)(
    contextToolsOfShape(shape, options).filter((input?: Dynamic) => {
      if (input === 'mergeCells' && shape === 'dates' && options.hasSortAndFilter === true && slots !== 'all') return false;
      let value =
        (input === 'wrapText' && options.isByFinger === true ? CONTEXT_TOOL_WIDTH : (CONTEXT_TOOL_WIDTHS[input] ?? CONTEXT_TOOL_WIDTH)) +
        CONTEXT_TOOL_GAP;
      if (value > roomLeft) return false;
      roomLeft -= value;
      return true;
    }),
  );
  return CONTEXT_TOOLS_IN_ORDER.filter((input?: Dynamic) => toolsThatFit.has(input));
}
export function contextToolsLeftOver(shape?: Dynamic, slots?: Dynamic, options: Dynamic = {}) {
  let shownTools = contextToolsThatFit(shape, slots, options);
  let allTools = contextToolsOfShape(shape, options);
  return CONTEXT_TOOLS_IN_ORDER.filter((input?: Dynamic) => allTools.includes(input) && !shownTools.includes(input));
}
export const SEVERAL_CELLS_SHAPE_OF_KIND = {
  number: 'numbers',
  date: 'dates',
  dropdown: 'dropdowns',
  checkbox: 'checkboxes',
  person: 'people',
  trueOrFalse: 'severalTrueOrFalse',
  empty: 'emptyCells',
};
export const CONTEXT_TOOLS_IN_ORDER = [
  'sort',
  'insertDropdown',
  'insertPerson',
  'insertDate',
  'insertCheckbox',
  'fontSize',
  'optionsOfDropdown',
  'checkAll',
  'uncheckAll',
  'fewerDecimalPlaces',
  'moreDecimalPlaces',
  'currency',
  'percent',
  'sum',
  'insertColumns',
  'insertRows',
  'wrapText',
  'asDropdown',
  'asCheckbox',
  'mergeCells',
  'unmergeCells',
];
export const CONTEXT_TOOLS_OF_SHAPE = {
  empty: ['insertDropdown', 'insertPerson', 'insertDate', 'insertCheckbox'],
  text: ['fontSize', 'wrapText', 'asDropdown'],
  trueOrFalse: ['fontSize', 'asCheckbox'],
  neverWraps: ['fontSize'],
  date: ['fontSize'],
  number: ['fewerDecimalPlaces', 'moreDecimalPlaces', 'currency', 'percent'],
  checkbox: [],
  person: [],
  dropdown: ['optionsOfDropdown'],
  numbers: ['fewerDecimalPlaces', 'moreDecimalPlaces', 'sum'],
  dates: ['fontSize', 'mergeCells'],
  dropdowns: ['optionsOfDropdown'],
  checkboxes: ['checkAll', 'uncheckAll'],
  people: [],
  severalTrueOrFalse: ['fontSize', 'asCheckbox', 'mergeCells'],
  emptyCells: ['insertDropdown', 'insertPerson', 'insertDate', 'insertCheckbox'],
  cells: ['fontSize', 'wrapText', 'mergeCells'],
  columns: ['sort', 'insertColumns', 'wrapText'],
  rows: ['insertRows', 'wrapText'],
  merged: ['unmergeCells', 'fontSize', 'wrapText'],
  mergedOnly: ['unmergeCells', 'fontSize', 'wrapText'],
};
export const CONTEXT_TOOL_WIDTHS = {
  fontSize: 41,
  optionsOfDropdown: 92,
  sum: 44,
  insertColumns: 44,
  insertRows: 44,
  wrapText: 44,
};
export const CONTEXT_TOOL_WIDTH = 28;
export const CONTEXT_TOOL_GAP = 4;
