import type { Dynamic } from '../dynamic.ts';
import {
  expectsOperandAtEnd,
  nameBeingTyped,
  isTypingNameArgument,
  openBracketAhead,
  isBooleanLiteralName,
  enclosingCallAtEnd,
  describeFunction,
  acceptsArgumentCount,
  describedArgumentAt,
  isBareNameArgumentAtCaret,
  bracketPairAtCaret,
} from './function-help.ts';
import { formulaReadsAsWords } from './word-tokens.ts';
import { headedColumnsMatchingWord } from './column-headings.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
import { stepListIndex } from '../ui/list-cards.ts';
import { startEntryEditing } from '../editor/start-entry.ts';
import { FUNCTION_CATALOG, FUNCTION_FAMILIES } from './function-catalog.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function keepFunctionListHighlight(oldList?: Dynamic, list?: Dynamic) {
  if (oldList === null || list === null || list === oldList) return list;
  let { highlighted: highlighted, isHighlightedByKey: isHighlightedByKey } = oldList;
  let match =
    typeof highlighted === 'string'
      ? list.names.find((name?: Dynamic) => name === highlighted)
      : list.columns.find(({ columnId: columnId }: Dynamic) => columnId === highlighted.columnId);
  return match === undefined
    ? list
    : {
        ...list,
        highlighted: match,
        isHighlightedByKey: isHighlightedByKey,
      };
}
export function functionNamesMatching(names?: Dynamic, typed?: Dynamic) {
  let matches = names.filter((name?: Dynamic) => name.startsWith(typed));
  if (!SEARCH_INSIDE_NAMES_PATTERN.test(typed)) return matches;
  return [...matches, ...names.filter((name?: Dynamic) => name.indexOf(typed) > 0)];
}
export function functionNamesOffered(typed?: Dynamic) {
  let common = functionNamesMatching(FUNCTION_NAMES_COMMON_FIRST, typed);
  let others = typed.length === 1 ? [] : functionNamesMatching(OTHER_FUNCTION_NAMES, typed);
  return others[0] === typed ? [typed, ...common, ...others.slice(1)] : [...common, ...others];
}
export function functionListAt(
  text: Dynamic,
  caretAt: Dynamic,
  list: Dynamic,
  isAllAskedFor: Dynamic,
  activeCell: Dynamic,
  workbook: WorkbookReads,
) {
  if (NAME_GOES_ON_PATTERN.test(text.slice(caretAt))) return null;
  let textToCaret = text.slice(0, caretAt);
  if (isAllAskedFor && !expectsOperandAtEnd(textToCaret)) return null;
  let nameTyped = isAllAskedFor
    ? {
        start: caretAt,
        typed: '',
      }
    : nameBeingTyped(textToCaret);
  if (nameTyped === null) return null;
  if (!isAllAskedFor && isTypingNameArgument(textToCaret, text.slice(caretAt), nameTyped, workbook.decimalSign)) return null;
  let typedUpper = nameTyped.typed.toUpperCase();
  let hasBracketAhead = openBracketAhead(text.slice(caretAt)) !== null;
  let sheetNames = workbook.listSheets().map((sheet?: Dynamic) => sheet.name);
  let readsAsWords = formulaReadsAsWords(text, sheetNames, workbook.decimalSign);
  let isOffered = (name?: Dynamic) =>
    (isCommonFunction(name) || !readsAsWords) && (!isBooleanLiteralName(name) || (name !== typedUpper && !hasBracketAhead));
  let names = isAllAskedFor ? FUNCTION_NAMES_BY_FAMILY.names : functionNamesOffered(typedUpper).filter(isOffered);
  let columns =
    isAllAskedFor || activeCell === null || enclosingCallAtEnd(textToCaret, workbook.decimalSign) === null
      ? []
      : headedColumnsMatchingWord(nameTyped.typed, activeCell, workbook);
  let exactName =
    typedUpper.length > 1 && isCommonFunction(typedUpper) ? names.find((name?: Dynamic) => name === typedUpper) : undefined;
  let highlighted = columns.length === 0 ? names[0] : (exactName ?? columns[0]);
  if (highlighted === undefined) return null;
  return list !== null &&
    list.typedFrom === nameTyped.start &&
    list.typedTo === caretAt &&
    areSameFunctionNames(names, list.names) &&
    areSameColumnOffers(columns, list.columns)
    ? list
    : {
        typedFrom: nameTyped.start,
        typedTo: caretAt,
        columns: columns,
        names: names,
        families: isAllAskedFor ? FUNCTION_NAMES_BY_FAMILY.families : NO_FUNCTION_FAMILIES,
        highlighted: highlighted,
        isHighlightedByKey: false,
      };
}
export function functionGuideAt(text?: Dynamic, caretAt?: Dynamic, guide?: Dynamic, said?: Dynamic, decimalSign?: Dynamic) {
  let textToCaret = text.slice(0, caretAt);
  let call = enclosingCallAtEnd(textToCaret, decimalSign);
  let described = call === null ? null : describeFunction(call.name);
  if (call === null || described === null || described.arguments.length === 0) return null;
  let argumentCount =
    acceptsArgumentCount(described, call.argumentAt + 1) &&
    describedArgumentAt(described, call.argumentAt, null)?.takes === 'aName' &&
    isBareNameArgumentAtCaret(textToCaret, text.slice(caretAt), decimalSign)
      ? call.argumentAt + 1
      : null;
  return call.name === guide?.name && call.start === guide.start && call.argumentAt === guide.argumentAt && argumentCount === guide.argumentCount
    ? guide
    : {
        ...call,
        argumentCount: argumentCount,
        said: said,
      };
}
export function caretAfterTextChange(before?: Dynamic, after?: Dynamic) {
  let shorterLength = Math.min(before.length, after.length);
  let sameAtStart: Dynamic = 0;
  while (sameAtStart < shorterLength && before[sameAtStart] === after[sameAtStart]) sameAtStart += 1;
  let sameAtEnd: Dynamic = 0;
  while (sameAtEnd < shorterLength - sameAtStart && before.at(-1 - sameAtEnd) === after.at(-1 - sameAtEnd)) sameAtEnd += 1;
  let caretAt = after.length - sameAtEnd;
  return {
    text: after,
    start: caretAt,
    end: caretAt,
  };
}
export function refreshFormulaHelp(before: Dynamic, state: PageState, isHelpOff: Dynamic, workbook: WorkbookReads) {
  let { mode: mode, formulaHelp: help } = state;
  if (mode.kind !== 'editing' || isHelpOff || !isFormulaText(mode.text))
    return help === EMPTY_FORMULA_HELP
      ? state
      : {
          ...state,
          formulaHelp: EMPTY_FORMULA_HELP,
        };
  let hasScrolled = state.scrollTop !== before.scrollTop || state.scrollLeft !== before.scrollLeft;
  let hasWorkbookChanged =
    state.workbookChangeCount !== before.workbookChangeCount || state.formulasWorkedOutCount !== before.formulasWorkedOutCount;
  if (
    mode === before.mode &&
    help === before.formulaHelp &&
    state.menu === before.menu &&
    state.peopleList === before.peopleList &&
    state.sheetPointedIn === before.sheetPointedIn &&
    !hasWorkbookChanged &&
    !hasScrolled
  )
    return state;
  let { text: text } = mode;
  let listShutAt =
    before.formulaHelp.list !== null && before.mode === mode && hasScrolled && mode.typingIn === 'cell' ? text : help.listShutAt;
  let pointedReference = state.pointedReference?.text === text ? state.pointedReference : null;
  let caret =
    help.caret?.text === text || before.mode.kind !== 'editing' || before.mode.text === text
      ? help.caret
      : pointedReference === null
        ? caretAfterTextChange(before.mode.text, text)
        : {
            text: text,
            start: pointedReference.end,
            end: pointedReference.end,
          };
  let caretAt = caret?.text === text ? caret.start : text.length;
  let isMenuOpen = state.menu !== null || state.peopleList !== null;
  let isTextChanged = before.mode.kind === 'editing' && before.mode.text !== text;
  let isAllAskedFor = help.allAskedForAt === text;
  let isListKeptShut = isMenuOpen || listShutAt === text || (help.list === null && !isTextChanged && !isAllAskedFor);
  let activeCell = state.sheetPointedIn === null ? state.activeCell : null;
  let freshList = isListKeptShut ? null : functionListAt(text, caretAt, help.list, isAllAskedFor, activeCell, workbook);
  let list = hasWorkbookChanged && !isTextChanged ? keepFunctionListHighlight(help.list, freshList) : freshList;
  let allAskedForAt = isAllAskedFor && list !== null ? text : null;
  let isCaretAfterPick = help.caretAfterPick !== before.formulaHelp.caretAfterPick;
  let guideSaid = before.mode.kind !== 'editing' ? 'never' : isCaretAfterPick ? 'atOnce' : 'afterRest';
  let isCaretMoved = help.caret !== before.formulaHelp.caret;
  let writtenWhole = isCaretAfterPick || !(isTextChanged || isCaretMoved) ? help.writtenWhole : null;
  let guide = isMenuOpen || list !== null ? null : functionGuideAt(text, caretAt, help.guide, guideSaid, workbook.decimalSign);
  let bracketsFound = caret?.text === text && caret.end === caret.start ? bracketPairAtCaret(text, caretAt) : null;
  let brackets =
    bracketsFound?.opensAt === help.brackets?.opensAt && bracketsFound?.closesAt === help.brackets?.closesAt ? help.brackets : bracketsFound;
  if (
    caret === help.caret &&
    brackets === help.brackets &&
    list === help.list &&
    guide === help.guide &&
    writtenWhole === help.writtenWhole &&
    listShutAt === help.listShutAt &&
    allAskedForAt === help.allAskedForAt
  )
    return state;
  let nextHelp = {
    ...help,
    caret: caret,
    writtenWhole: writtenWhole,
    listShutAt: listShutAt,
    allAskedForAt: allAskedForAt,
    list: list,
    guide: guide,
    brackets: brackets,
  };
  return {
    ...state,
    formulaHelp: nextHelp,
  };
}
export function setFormulaHelpCaret(state: PageState, caret?: Dynamic) {
  let caretBefore = state.formulaHelp.caret;
  let isSameCaret =
    caretBefore !== null && caretBefore.text === caret.text && caretBefore.start === caret.start && caretBefore.end === caret.end;
  if (state.mode.kind !== 'editing' || !isFormulaText(caret.text) || isSameCaret) return state;
  return {
    ...state,
    formulaHelp: {
      ...state.formulaHelp,
      caret: caret,
    },
  };
}
export function moveFunctionListHighlight(state: PageState, step?: Dynamic) {
  let { list: list } = state.formulaHelp;
  if (list === null) return state;
  let rows = [...list.columns, ...list.names];
  let highlighted = rows[stepListIndex(rows.indexOf(list.highlighted), step, rows.length) ?? -1];
  if (highlighted === undefined) return state;
  let nextList = {
    ...list,
    highlighted: highlighted,
    isHighlightedByKey: true,
  };
  return {
    ...state,
    formulaHelp: {
      ...state.formulaHelp,
      list: nextList,
    },
  };
}
export function listAllFunctions(state: PageState, workbook: ReadsWithTextMeasurer) {
  let { mode: mode } = state;
  if (state.formulaHelp.list !== null) return shutFunctionList(state);
  if (mode.kind === 'editing' && !isFormulaText(mode.text)) return state;
  let [text, typingIn] = mode.kind === 'editing' ? [mode.text, mode.typingIn] : ['=', 'formulaBar'];
  let editing = startEntryEditing(state, workbook, text, typingIn);
  return {
    ...editing,
    mode:
      mode.kind !== 'editing' && editing.mode.kind === 'editing'
        ? {
            ...editing.mode,
            isBegunToListFunctions: true,
            ...(editing.mode.textAtStart !== text && {
              isTypedOverCell: true,
            }),
          }
        : editing.mode,
    formulaHelp: {
      ...editing.formulaHelp,
      allAskedForAt: text,
      listShutAt: null,
    },
  };
}
export function shutFunctionList(state: PageState) {
  let { mode: mode, formulaHelp: help } = state;
  if (mode.kind !== 'editing' || help.list === null) return state;
  return {
    ...state,
    formulaHelp: {
      ...help,
      listShutAt: mode.text,
    },
  };
}
export function writeFunctionListPick(state: PageState, workbook: ReadsWithTextMeasurer, written?: Dynamic, caretShift?: Dynamic, writtenWhole?: Dynamic) {
  let { mode: mode, formulaHelp: help } = state;
  if (mode.kind !== 'editing' || help.list === null) return state;
  let { typedFrom: typedFrom, typedTo: typedTo } = help.list;
  let textToCaret = `${mode.text.slice(0, typedFrom)}${written}`;
  let text = `${textToCaret}${mode.text.slice(typedTo)}`;
  let editing = startEntryEditing(state, workbook, text, mode.typingIn);
  let caretAt = textToCaret.length + caretShift;
  let caret = {
    text: text,
    start: caretAt,
    end: caretAt,
  };
  return {
    ...editing,
    formulaHelp: {
      ...editing.formulaHelp,
      caret: caret,
      caretAfterPick: caret,
      writtenWhole: writtenWhole,
    },
  };
}
export function pickFunctionListRow(state: PageState, workbook: ReadsWithTextMeasurer, pick?: Dynamic) {
  let { mode: mode, formulaHelp: help } = state;
  let { list: list } = help;
  if (mode.kind !== 'editing' || list === null) return state;
  let { highlighted: highlighted } = list;
  let picked =
    pick ??
    (typeof highlighted === 'string'
      ? {
          name: highlighted,
        }
      : highlighted);
  if ('columnId' in picked) {
    let column = list.columns.find(({ columnId: columnId }: Dynamic) => columnId === picked.columnId);
    return column === undefined ? state : writeFunctionListPick(state, workbook, column.cells, 0, column);
  }
  if (!list.names.includes(picked.name)) return state;
  let bracketAhead = openBracketAhead(mode.text.slice(list.typedTo));
  let takesNoArguments = describeFunction(picked.name)?.arguments.length === 0;
  let brackets = bracketAhead !== null || isBooleanLiteralName(picked.name) ? '' : takesNoArguments ? '()' : '(';
  let written = `${picked.name}${brackets}`;
  let writtenWhole = takesNoArguments ? picked.name : null;
  return writeFunctionListPick(state, workbook, written, bracketAhead?.length ?? 0, writtenWhole);
}
export const EMPTY_FORMULA_HELP = {
  caret: null,
  caretAfterPick: null,
  writtenWhole: null,
  listShutAt: null,
  allAskedForAt: null,
  list: null,
  guide: null,
  brackets: null,
};
export const COMMON_FUNCTION_NAMES = [
  'SUM',
  'AVERAGE',
  'COUNT',
  'MIN',
  'MAX',
  'IF',
  'SUMIF',
  'ROUND',
  'XLOOKUP',
  'VLOOKUP',
  'COUNTA',
  'COUNTIF',
  'COUNTIFS',
  'SUMIFS',
  'IFERROR',
  'INDEX',
  'MATCH',
  'UNIQUE',
  'TODAY',
  'NOW',
  'DATE',
  'MONTH',
  'YEAR',
  'TEXT',
  'AND',
  'OR',
  'NOT',
  'NPV',
];
export const isCommonFunction = (name?: Dynamic) => describeFunction(name)?.isCommon === true;
export const CATALOG_FUNCTION_NAMES = FUNCTION_CATALOG.map(({ name: name }: Dynamic) => name);
export const FUNCTION_NAMES_COMMON_FIRST = [
  ...COMMON_FUNCTION_NAMES,
  ...CATALOG_FUNCTION_NAMES.filter((name?: Dynamic) => isCommonFunction(name) && !COMMON_FUNCTION_NAMES.includes(name)),
];
export const OTHER_FUNCTION_NAMES = CATALOG_FUNCTION_NAMES.filter((name?: Dynamic) => !FUNCTION_NAMES_COMMON_FIRST.includes(name));
export const ALL_FUNCTION_NAMES = [...FUNCTION_NAMES_COMMON_FIRST, ...OTHER_FUNCTION_NAMES];
export const FUNCTION_NAMES_BY_FAMILY = (() => {
  let names: Dynamic = [];
  let families = FUNCTION_FAMILIES.map((family?: Dynamic) => {
    let from = names.length;
    (names.push as Dynamic)(...ALL_FUNCTION_NAMES.filter((name?: Dynamic) => describeFunction(name)?.family === family));
    return {
      family: family,
      from: from,
    };
  });
  return {
    names: names,
    families: families,
  };
})();
export const NO_FUNCTION_FAMILIES: Dynamic = [];
export const areSameFunctionNames = (names?: Dynamic, otherNames?: Dynamic) =>
  names.length === otherNames?.length && names.every((name?: Dynamic, index?: Dynamic) => name === otherNames[index]);
export const areSameColumnOffers = (columns?: Dynamic, otherColumns?: Dynamic) =>
  columns.length === otherColumns.length &&
  columns.every(
    ({ columnId: columnId, heading: heading, cells: cells }: Dynamic, index?: Dynamic) =>
      columnId === otherColumns[index]?.columnId && heading === otherColumns[index].heading && cells === otherColumns[index].cells,
  );
export const NAME_GOES_ON_PATTERN = /^[A-Za-z0-9_.]/;
export const SEARCH_INSIDE_NAMES_PATTERN = /^[A-Z]{3,}$/;
export const eventsToPickFunction = (name?: Dynamic) => [
  {
    kind: 'allFunctionsAskedFor',
  },
  {
    kind: 'functionListRowChosen',
    name: name,
  },
];
export const isColumnPick = (state: PageState, pick?: Dynamic) =>
  pick === null ? typeof state.formulaHelp.list?.highlighted === 'object' : 'columnId' in pick;
