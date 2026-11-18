import type { Dynamic } from '../dynamic.ts';
import { numberFormatOfChoice } from './number-format-choices.ts';
import { isCheckboxFormat } from '../chips/checkboxes.ts';
import { booleanOfValue } from '../chips/checkbox-presses.ts';
export function generalAlignmentOf(value?: Dynamic) {
  switch (value?.kind) {
    case 'number':
      return 'right';
    case 'boolean':
    case 'error':
      return 'center';
    case 'text':
    case undefined:
      return 'left';
  }
}
export function formatOfToolbarChoice(choice?: Dynamic, reads?: Dynamic) {
  if (choice.bold !== undefined)
    return {
      font: {
        bold: choice.bold,
      },
    };
  if (choice.italic !== undefined)
    return {
      font: {
        italic: choice.italic,
      },
    };
  if (choice.underline !== undefined)
    return {
      font: {
        underline: choice.underline,
      },
    };
  if (choice.strikethrough !== undefined)
    return {
      font: {
        strikethrough: choice.strikethrough,
      },
    };
  if (choice.textColor !== undefined)
    return {
      font: {
        color: choice.textColor,
      },
    };
  if (choice.fontSizeInPoints !== undefined)
    return {
      font: {
        size: choice.fontSizeInPoints,
      },
    };
  if (choice.horizontalAlignment !== undefined)
    return {
      alignment: {
        horizontal: choice.horizontalAlignment,
      },
    };
  if (choice.verticalAlignment !== undefined)
    return {
      alignment: {
        vertical: choice.verticalAlignment,
      },
    };
  if (choice.wrapText !== undefined)
    return {
      alignment: {
        wrap: choice.wrapText,
      },
    };
  if (choice.fillColor !== undefined)
    return {
      fillColor: choice.fillColor,
    };
  if (choice.customNumberFormat !== undefined)
    return {
      numberFormat: choice.customNumberFormat,
    };
  if (choice.decimalPlaces !== undefined)
    return {
      numberFormat: {
        pattern: choice.decimalPlaces.pattern,
      },
    };
  return {
    numberFormat: numberFormatOfChoice(choice.numberFormatChoice, reads),
  };
}
export const HORIZONTAL_ALIGNMENTS = ['left', 'center', 'right', 'general'];
export const resolvedHorizontalAlignment = (alignment?: Dynamic, value?: Dynamic) =>
  alignment === 'general' ? generalAlignmentOf(value) : alignment;
export const shownHorizontalAlignment = (format?: Dynamic, value?: Dynamic) =>
  isCheckboxFormat(format) && booleanOfValue(value) !== null ? 'center' : resolvedHorizontalAlignment(format.alignment.horizontal, value);
