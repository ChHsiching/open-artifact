import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from '../i18n/messages.ts';
import { describeFunction } from '../formulas/function-help.ts';
export function functionCategoryLabel(category?: Dynamic) {
  switch (category) {
    case 'math':
      return translateMessage({
        defaultMessage: 'Math',
        id: 'WseqOTZ0HH',
      });
    case 'statistical':
      return translateMessage({
        defaultMessage: 'Statistical',
        id: 'nL+3oFpsuw',
      });
    case 'logical':
      return translateMessage({
        defaultMessage: 'Logical',
        id: 'uhsYJxUDbl',
      });
    case 'lookup':
      return translateMessage({
        defaultMessage: 'Lookup',
        id: 'BIWEXblwqa',
      });
    case 'text':
      return translateMessage({
        defaultMessage: 'Text',
        id: 'Npii+gy9xJ',
      });
    case 'dateAndTime':
      return translateMessage({
        defaultMessage: 'Date and time',
        id: '7MtbhY0W+U',
      });
    case 'financial':
      return translateMessage({
        defaultMessage: 'Financial',
        id: 'v/G0OSXVuH',
      });
  }
}
export function functionNameWithDescription(functionName?: Dynamic) {
  let description = describeFunction(functionName)?.description;
  if (description === undefined) return functionName;
  return translateMessage(
    {
      defaultMessage: '{name}. {description}',
      id: 'fRgWZsoPVR',
    },
    {
      name: functionName,
      description: description,
    },
  );
}
export function functionArgumentWords({
  functionName: functionName,
  number: number,
  count: count,
  argument: argument,
  isOptional: isOptional,
}: Dynamic) {
  let canBe = isOptional ? 'leftOut' : 'other';
  if (functionName !== null && count !== null)
    return translateMessage(
      {
        defaultMessage:
          '{canBe, select, leftOut {{functionName}, argument {number} of {count}: {argument}, optional} other {{functionName}, argument {number} of {count}: {argument}}}',
        id: 'lULrFCuZh2',
      },
      {
        canBe: canBe,
        functionName: functionName,
        number: number,
        count: count,
        argument: argument,
      },
    );
  if (functionName !== null)
    return translateMessage(
      {
        defaultMessage:
          '{canBe, select, leftOut {{functionName}, argument {number}: {argument}, optional} other {{functionName}, argument {number}: {argument}}}',
        id: 'MCQzYaxyV9',
      },
      {
        canBe: canBe,
        functionName: functionName,
        number: number,
        argument: argument,
      },
    );
  if (count !== null)
    return translateMessage(
      {
        defaultMessage:
          '{canBe, select, leftOut {Argument {number} of {count}: {argument}, optional} other {Argument {number} of {count}: {argument}}}',
        id: 'FcHVknxLGP',
      },
      {
        canBe: canBe,
        number: number,
        count: count,
        argument: argument,
      },
    );
  return translateMessage(
    {
      defaultMessage: '{canBe, select, leftOut {Argument {number}: {argument}, optional} other {Argument {number}: {argument}}}',
      id: '/zepenytWd',
    },
    {
      canBe: canBe,
      number: number,
      argument: argument,
    },
  );
}
export const formulaAutocompleteLabel = (hasColumns?: Dynamic) =>
  hasColumns
    ? translateMessage({
        defaultMessage: 'Columns and functions',
        id: 'sOksXd7bOt',
      })
    : translateMessage({
        defaultMessage: 'Functions',
        id: 'yxQoYaGQHk',
      });
export const functionListLabel = () =>
  translateMessage({
    defaultMessage: 'Functions',
    id: 'IHwpZjJEln',
  });
export const autocompleteColumnsHeading = () =>
  translateMessage({
    defaultMessage: 'Columns',
    id: 'QYjcmFEMdM',
  });
export const autocompleteFunctionsHeading = () =>
  translateMessage({
    defaultMessage: 'Functions',
    id: '4Tle03spNC',
  });
export const autocompleteColumnWords = (row?: Dynamic) =>
  typeof row === 'string'
    ? functionNameWithDescription(row)
    : translateMessage(
        {
          defaultMessage: '{heading}, {cells}',
          id: 'GN0BiFfCCi',
        },
        {
          heading: row.heading,
          cells: row.cells,
        },
      );
export const autocompleteRowWords = (heading?: Dynamic, row?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{heading}: {row}',
      id: 'r+Q8k9rQbO',
    },
    {
      heading: heading,
      row: autocompleteColumnWords(row),
    },
  );
export const functionWithoutArgumentsWords = (functionName?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{functionName}, no arguments',
      id: 'IhIu6eAA4b',
    },
    {
      functionName: functionName,
    },
  );
