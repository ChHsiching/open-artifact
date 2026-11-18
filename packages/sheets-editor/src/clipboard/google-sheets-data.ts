import type { Dynamic } from '../dynamic.ts';
export function expandRunLengths(json?: Dynamic, most?: Dynamic) {
  let items = optionalJsonArray(json);
  if (items === null) return null;
  let expanded: Dynamic = [];
  for (let index: Dynamic = 0; index < items.length; index += 1) {
    let item = items[index];
    let isRun = typeof item === 'number' && item < 0;
    let runLength = isRun ? -item : 1;
    let runValue = isRun ? items[(index += 1)] : item;
    if (!isJsonCount(runLength) || !isJsonCount(runValue) || expanded.length + runLength > most) return null;
    for (let repeat: Dynamic = 0; repeat < runLength; repeat += 1) expanded.push(runValue);
  }
  return expanded;
}
export function sequenceReader(items?: Dynamic) {
  let index: Dynamic = 0;
  return {
    next: () => items[index++],
    isAtEnd: () => index === items.length,
  };
}
export function googleNumberFormatPatternOf(formatEntry?: Dynamic) {
  let numberFormat = isPlainJsonObject(formatEntry) ? optionalJsonObject(formatEntry['3']) : null;
  if (numberFormat === null) return;
  let pattern = numberFormat['2'];
  return pattern === undefined ? null : isWellFormedText(pattern) ? pattern : undefined;
}
export function formulasLookLocalized(formulas?: Dynamic) {
  let formulasWithoutStrings = formulas.map((formula?: Dynamic) => formula.replaceAll(/"[^"]*"|'[^']*'|[RC]\d+/g, '""'));
  let anyFormulaMatches = (testPattern?: Dynamic) =>
    formulasWithoutStrings.some((formula?: Dynamic) => testPattern.test(formula));
  let formulasWithoutBraces = formulasWithoutStrings.map((formula?: Dynamic) => formula.replaceAll(/\{[^{}]*\}/g, ''));
  if (anyFormulaMatches(/\\/) || formulasWithoutBraces.some((formula?: Dynamic) => formula.includes(';'))) return true;
  return anyFormulaMatches(/\d,\d/) && !anyFormulaMatches(/\D,|,\D|\d\.\d/);
}
export function readGoogleSheetsClipboard(json?: Dynamic, mostCells?: Dynamic) {
  let parsed: Dynamic;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  let root = asPlainJsonObject(parsed);
  let grid = asPlainJsonObject(root?.['15']);
  let values = optionalJsonObject(root?.['3']);
  let [rowCount, columnCount] = [grid?.['1'], grid?.['2']];
  if (root === null || values === null || !isJsonCount(rowCount) || !isJsonCount(columnCount)) return null;
  let cellCount = rowCount * columnCount;
  if (cellCount === 0 || cellCount > mostCells) return null;
  if (root['1'] !== 1 || root['20'] !== cellCount) return null;
  let cellFlags = expandRunLengths(root['2'], cellCount);
  let valueKinds = expandRunLengths(values['1'], cellCount);
  let formatNumbers = expandRunLengths(root['5'], cellCount);
  let formulaNumbers = expandRunLengths(root['9'], cellCount);
  let [numbers, texts, others] = [optionalJsonArray(values['3']), optionalJsonArray(values['4']), optionalJsonArray(values['5'])];
  let numberFormats = optionalJsonArray(root['4'])?.map(googleNumberFormatPatternOf);
  let formulas = optionalJsonArray(root['8']);
  if (
    cellFlags?.length !== cellCount ||
    valueKinds === null ||
    formatNumbers === null ||
    formulaNumbers === null ||
    numbers === null ||
    texts === null ||
    others === null ||
    numberFormats === undefined ||
    formulas === null ||
    !formulas.every(isWellFormedText) ||
    formulasLookLocalized(formulas)
  )
    return null;
  let readers = {
    kinds: sequenceReader(valueKinds),
    numbers: sequenceReader(numbers),
    texts: sequenceReader(texts),
    others: sequenceReader(others),
    formatNumbers: sequenceReader(formatNumbers),
    formulaNumbers: sequenceReader(formulaNumbers),
  };
  let readValue = () => {
    switch (readers.kinds.next()) {
      case 1: {
        let value = readers.numbers.next();
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        return {
          kind: 'number',
          value: value,
        };
      }
      case 2:
      case 4: {
        let value = readers.texts.next();
        return isWellFormedText(value)
          ? {
              kind: 'text',
              value: value,
            }
          : undefined;
      }
      case 3: {
        let value = asPlainJsonObject(readers.others.next());
        if (value?.['1'] === 5) return 'error';
        return value?.['1'] === 4 && (value['4'] === 0 || value['4'] === 1)
          ? {
              kind: 'boolean',
              value: value['4'] === 1,
            }
          : undefined;
      }
      case undefined:
      default:
        return;
    }
  };
  let keepsFormulas =
    formulaNumbers.reduce((total?: Dynamic, formulaNumber?: Dynamic) => total + (formulas[formulaNumber]?.length ?? 0), 0) <=
    MOST_FORMULA_CHARACTERS;
  let cells: Dynamic = [];
  for (let flags of cellFlags as Dynamic) {
    let value = (flags & CELL_HAS_VALUE) === 0 ? null : readValue();
    let numberFormatPattern = (flags & CELL_HAS_FORMAT) === 0 ? null : numberFormats[readers.formatNumbers.next() ?? -1];
    let formula = (flags & CELL_HAS_FORMULA) === 0 ? null : formulas[readers.formulaNumbers.next() ?? -1];
    if (value === undefined || numberFormatPattern === undefined || formula === undefined) return null;
    cells.push({
      value: value === 'error' ? null : value,
      isError: value === 'error',
      formulaByOffsets: keepsFormulas ? formula : null,
      numberFormatPattern: numberFormatPattern,
    });
  }
  return Object.values(readers).every((reader?: Dynamic) => reader.isAtEnd())
    ? {
        rowCount: rowCount,
        columnCount: columnCount,
        cells: cells,
      }
    : null;
}
export const isPlainJsonObject = (value?: Dynamic) => typeof value === 'object' && value !== null && !Array.isArray(value);
export const asPlainJsonObject = (value?: Dynamic) => (isPlainJsonObject(value) ? value : null);
export const optionalJsonObject = (value?: Dynamic) => (value === undefined ? {} : asPlainJsonObject(value));
export const optionalJsonArray = (value?: Dynamic) => (value === undefined ? [] : Array.isArray(value) ? value : null);
export const isJsonCount = (value?: Dynamic) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export const CELL_HAS_VALUE = 1;
export const CELL_HAS_FORMAT = 2;
export const CELL_HAS_FORMULA = 8;
export const PASTED_LONE_SURROGATE_PATTERN = /\p{Cs}/u;
export const isWellFormedText = (value?: Dynamic) => typeof value === 'string' && !PASTED_LONE_SURROGATE_PATTERN.test(value);
export const MOST_FORMULA_CHARACTERS = 1048576;
