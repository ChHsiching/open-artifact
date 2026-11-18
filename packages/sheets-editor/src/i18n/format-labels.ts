import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from './messages.ts';
import { sheetMessages } from './sheet-messages.ts';
import { CUSTOM_FORMAT_PLACEHOLDERS } from '../format/number-format-choices.ts';
import { colorsEqual, WHITE_COLOR, BLACK_COLOR, LIGHT_GRAY_COLOR } from '../model/colors.ts';
import { menuMatchCountChooseRowWords } from '../messages/command-search.ts';
export function checkboxCellLabel({ isChecked: isChecked, isNamedReadOnly: isNamedReadOnly }: Dynamic) {
  if (!isNamedReadOnly)
    return isChecked
      ? translateMessage({
          defaultMessage: 'Checkbox, checked',
          id: 'Y5mlX5+c30',
        })
      : translateMessage({
          defaultMessage: 'Checkbox, not checked',
          id: 'EmGWYmFwCV',
        });
  return isChecked
    ? translateMessage({
        defaultMessage: 'Checkbox, checked, read-only',
        id: '+zaBi+wAD8',
      })
    : translateMessage({
        defaultMessage: 'Checkbox, not checked, read-only',
        id: 'y9WtkL2seH',
      });
}
export function numberFormatGroupLabel(group?: Dynamic) {
  switch (group) {
    case 'numbers':
      return translateMessage({
        defaultMessage: 'Number',
        id: '051maVd5as',
      });
    case 'currencies':
      return translateMessage({
        defaultMessage: 'Currency',
        id: 'WGl56IweqH',
      });
    case 'datesAndTimes':
      return translateMessage({
        defaultMessage: 'Date and time',
        id: 'O6p4z3CR0Q',
      });
  }
}
export function numberFormatChoiceLabel(choice?: Dynamic) {
  switch (choice) {
    case 'general':
      return translateMessage({
        defaultMessage: 'Automatic',
        id: '5wxJthgJ0T',
      });
    case 'number':
      return translateMessage({
        defaultMessage: 'Number',
        id: 'RgyHdSZFuR',
      });
    case 'roundedNumber':
      return translateMessage({
        defaultMessage: 'Number (rounded)',
        id: 'ObOM+zfvqx',
      });
    case 'numberInParentheses':
      return translateMessage({
        defaultMessage: 'Number (parentheses)',
        id: 'GZPKke7ehd',
      });
    case 'currency':
      return translateMessage({
        defaultMessage: 'Currency',
        id: 'jq1KkNhWpm',
      });
    case 'roundedCurrency':
      return translateMessage({
        defaultMessage: 'Currency (rounded)',
        id: 'daLY3qi3BM',
      });
    case 'percent':
      return translateMessage({
        defaultMessage: 'Percent',
        id: '5A4QNvMCYL',
      });
    case 'scientific':
      return translateMessage({
        defaultMessage: 'Scientific',
        id: '00PI08DIs7',
      });
    case 'fraction':
      return translateMessage({
        defaultMessage: 'Fraction',
        id: 'sl9dWNWusR',
      });
    case 'date':
      return translateMessage({
        defaultMessage: 'Date',
        id: '3DGETGAT1Q',
      });
    case 'mediumDate':
      return translateMessage({
        defaultMessage: 'Date (short month)',
        id: 's/SzjM09ti',
      });
    case 'longDate':
      return translateMessage({
        defaultMessage: 'Date (full month)',
        id: 'yatid+VCPy',
      });
    case 'monthAndDay':
      return translateMessage({
        defaultMessage: 'Month and day',
        id: 'zxOZXizAFg',
      });
    case 'monthAndYear':
      return translateMessage({
        defaultMessage: 'Month and year',
        id: 'QE+hNORDhD',
      });
    case 'time':
      return translateMessage({
        defaultMessage: 'Time',
        id: 'PmsOvXue8q',
      });
    case 'dateAndTime':
      return translateMessage({
        defaultMessage: 'Date and time',
        id: '9nJEzkx1IY',
      });
    case 'duration':
      return translateMessage({
        defaultMessage: 'Duration',
        id: 'dljaRq9vqi',
      });
    case 'text':
      return translateMessage({
        defaultMessage: 'Plain text',
        id: 'oskFw4qSpV',
      });
    case 'dropdown':
      return dropdownPaneMessages.dropdown();
    case 'checkbox':
      return sheetMessages.checkboxCells();
    case 'mixed':
      return translateMessage({
        defaultMessage: 'Mixed',
        id: 'mq3+CFfuav',
      });
  }
}
export function customFormatProblemText(why?: Dynamic) {
  switch (why) {
    case 'textNeedsQuotationMarks':
      return translateMessage(
        {
          defaultMessage: 'Put text in quotation marks, as in {pattern}.',
          id: 'isMYGUDOMe',
        },
        {
          pattern: CUSTOM_FORMAT_PLACEHOLDERS.withUnitAndDecimals,
        },
      );
    case 'notPrintedYet':
      return translateMessage(
        {
          defaultMessage: 'Sheets can’t show this format yet. Try one like {pattern}.',
          id: 'dydLtsDj0Y',
        },
        {
          pattern: CUSTOM_FORMAT_PLACEHOLDERS.withDecimals,
        },
      );
    case 'unreadable':
    case 'notJudged':
      return translateMessage(
        {
          defaultMessage: 'Sheets can’t read this format. Try one like {pattern}.',
          id: 'q0xm8vs0YL',
        },
        {
          pattern: CUSTOM_FORMAT_PLACEHOLDERS.withDecimals,
        },
      );
  }
}
export function horizontalAlignmentLabel(alignment?: Dynamic) {
  switch (alignment) {
    case 'left':
      return translateMessage({
        defaultMessage: 'Left',
        id: 'UajUQBhWWl',
      });
    case 'center':
      return translateMessage({
        defaultMessage: 'Center',
        id: 'RcJXvowFzy',
      });
    case 'right':
      return translateMessage({
        defaultMessage: 'Right',
        id: 'e4dLDKguD8',
      });
    case 'general':
      return translateMessage({
        defaultMessage: 'Automatic',
        id: '/eprchPQia',
      });
  }
}
export function verticalAlignmentLabel(alignment?: Dynamic) {
  switch (alignment) {
    case 'top':
      return translateMessage({
        defaultMessage: 'Top',
        id: 'DiZjb1Cg/Z',
      });
    case 'center':
      return translateMessage({
        defaultMessage: 'Middle',
        id: 'HLY4PYSNRw',
      });
    case 'bottom':
      return translateMessage({
        defaultMessage: 'Bottom',
        id: 'Rc0b+q96bd',
      });
  }
}
export function textWrappingLabel(wrapping?: Dynamic) {
  switch (wrapping) {
    case 'overflow':
      return translateMessage({
        defaultMessage: 'Overflow',
        id: 'KYs/qJNmj9',
      });
    case 'wrap':
      return translateMessage({
        defaultMessage: 'Wrap',
        id: '5cGeTxizAm',
      });
  }
}
export function cellColorName(property?: Dynamic, color?: Dynamic) {
  if (color === null)
    return translateMessage({
      defaultMessage: 'Mixed',
      id: '9UcaBtZW1U',
    });
  if (colorsEqual(color, WHITE_COLOR))
    return translateMessage({
      defaultMessage: 'White',
      id: 'c4APvFigus',
    });
  if (colorsEqual(color, BLACK_COLOR))
    return translateMessage({
      defaultMessage: 'Black',
      id: 'pNheB07+QR',
    });
  switch (color.kind) {
    case 'none':
      return property === 'fillColor'
        ? translateMessage({
            defaultMessage: 'None',
            id: 'YmnyW2YeVG',
          })
        : translateMessage({
            defaultMessage: 'Automatic',
            id: 'nyk43hnFbe',
          });
    case 'rgb':
      return colorsEqual(color, LIGHT_GRAY_COLOR) ? standardColorName('gray', 40) : color.hex.toUpperCase();
    case 'standard':
      return standardColorName(color.hue, color.shade);
  }
}
export function colorButtonLabel(property?: Dynamic, color?: Dynamic) {
  return translateMessage(
    {
      defaultMessage: '{property, select, fillColor {Cell color, {color}} other {Text color, {color}}}',
      id: '6jdqajSVqt',
    },
    {
      property: property,
      color: cellColorName(property, color),
    },
  );
}
export function borderEdgesLabel(edges?: Dynamic) {
  switch (edges) {
    case 'all':
      return translateMessage({
        defaultMessage: 'All borders',
        id: 'Z/A1wtuCht',
      });
    case 'inner':
      return translateMessage({
        defaultMessage: 'Inner borders',
        id: 'Vp+yWwnqBa',
      });
    case 'innerHorizontal':
      return translateMessage({
        defaultMessage: 'Inner horizontal borders',
        id: 'rVp7oXCG6+',
      });
    case 'innerVertical':
      return translateMessage({
        defaultMessage: 'Inner vertical borders',
        id: '0NJJ0LjqX4',
      });
    case 'outer':
      return translateMessage({
        defaultMessage: 'Outer borders',
        id: 'cxY68kGlHT',
      });
    case 'left':
      return translateMessage({
        defaultMessage: 'Left border',
        id: 'BdO0cByCL6',
      });
    case 'top':
      return translateMessage({
        defaultMessage: 'Top border',
        id: '3l6PecZpDc',
      });
    case 'right':
      return translateMessage({
        defaultMessage: 'Right border',
        id: 'rAnvCEhw/4',
      });
    case 'bottom':
      return translateMessage({
        defaultMessage: 'Bottom border',
        id: 'RTjyBvvb67',
      });
    case 'clear':
      return translateMessage({
        defaultMessage: 'Clear borders',
        id: '3lbXKn5C3K',
      });
  }
}
export function borderStyleLabel(style?: Dynamic) {
  switch (style) {
    case 'thin':
      return translateMessage({
        defaultMessage: 'Thin',
        id: '4U/uqY09nF',
      });
    case 'medium':
      return translateMessage({
        defaultMessage: 'Medium',
        id: 'O3ZwhFuYdS',
      });
    case 'thick':
      return translateMessage({
        defaultMessage: 'Thick',
        id: 'ks3Zx2NCoh',
      });
    case 'dashed':
      return translateMessage({
        defaultMessage: 'Dashed',
        id: '2upMP0Uhzo',
      });
    case 'dotted':
      return translateMessage({
        defaultMessage: 'Dotted',
        id: 'S8VNnQ2XVE',
      });
    case 'double':
      return translateMessage({
        defaultMessage: 'Double',
        id: 'J1StXApEUC',
      });
  }
}
export const commandMatchCountText = (count?: Dynamic, takesLabel?: Dynamic) =>
  takesLabel === null
    ? translateMessage(
        {
          defaultMessage: '{count, plural, =0 {No matches} one {# match} other {# matches}}',
          id: 'cLNwD3b7vW',
        },
        {
          count: count,
        },
      )
    : menuMatchCountChooseRowWords(count, takesLabel);
export const commandSearchStopWords = () =>
  translateMessage({
    defaultMessage: 'a an the and as format formats formatted formatting please',
    id: 'kCLF6xVAPN',
  });
export const checkboxAndDropdownSearchWords = () =>
  translateMessage({
    defaultMessage:
      'todo, to do, todos, task, tasks, task list, checklist, check list, done, complete, completed, checked, yes no, true false, boolean, list, options, choices, multiple choice, data validation, validation, status, category, categories, tags, labels',
    id: 'TTXOUUIkar',
  });
export const customFormatOfferLabel = (typed?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Custom format: {typed}',
      id: 'kS97Fr0CFn',
    },
    {
      typed: typed,
    },
  );
export const numberFormatGroupHeardAs = (group?: Dynamic, choice?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{list}, {format}',
      id: 'dnOMAM3Lt8',
    },
    {
      list: numberFormatGroupLabel(group),
      format: numberFormatChoiceLabel(choice),
    },
  );
export const formatPreviewText = (example?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Preview: {example}',
      id: 'hyYXjbj84A',
    },
    {
      example: example,
    },
  );
export const textWrappingButtonLabel = (wrapping?: Dynamic) =>
  wrapping === null
    ? translateMessage({
        defaultMessage: 'Text wrapping, Mixed',
        id: 'QmxhwQs6gv',
      })
    : translateMessage(
        {
          defaultMessage: 'Text wrapping, {choice}',
          id: 'N7KjY9ZMiO',
        },
        {
          choice: textWrappingLabel(wrapping),
        },
      );
export const standardColorName = (hue?: Dynamic, shade?: Dynamic) =>
  translateMessage(
    {
      defaultMessage:
        '{hue, select, gray {Gray {shade}} red {Red {shade}} orange {Orange {shade}} yellow {Yellow {shade}} green {Green {shade}} teal {Teal {shade}} blue {Blue {shade}} purple {Purple {shade}} other {Magenta {shade}}}',
      id: '9f78KhXUcW',
    },
    {
      hue: hue,
      shade: String(shade),
    },
  );
export const sampleNumberText = () =>
  translateMessage({
    defaultMessage: '1,200',
    id: 'ZmomhS4XmP',
  });
export const borderMenuMessages = {
  style: () =>
    translateMessage({
      defaultMessage: 'Thickness',
      id: 'tYCF4a4Ux0',
    }),
  color: () =>
    translateMessage({
      defaultMessage: 'Color',
      id: 'e5zS3c+8zN',
    }),
  borderStyle: () =>
    translateMessage({
      defaultMessage: 'Border thickness',
      id: 'MJOxIEukT+',
    }),
  borderColor: () =>
    translateMessage({
      defaultMessage: 'Border color',
      id: 'DvblvVEUZ4',
    }),
  showGridlines: () =>
    translateMessage({
      defaultMessage: 'Show gridlines',
      id: '8QSaLG0zPm',
    }),
};
export const bordersButtonLabel = (which?: Dynamic) =>
  translateMessage(
    {
      defaultMessage:
        '{which, select, none {Borders, none} all {Borders, all} outer {Borders, outer} inner {Borders, inner} top {Borders, top} bottom {Borders, bottom} left {Borders, left} right {Borders, right} horizontal {Borders, inner horizontal} vertical {Borders, inner vertical} unsure {Borders} other {Borders, some}}',
      id: 'IkSDLcg4tk',
    },
    {
      which: which,
    },
  );
export const borderThicknessButtonLabel = (style?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Border thickness, {style}',
      id: '9IJPT2SXvh',
    },
    {
      style: borderStyleLabel(style),
    },
  );
export const borderColorButtonLabel = (color?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Border color, {color}',
      id: 'q7kvj6Npe2',
    },
    {
      color: cellColorName('textColor', color),
    },
  );
export const dropdownPaneMessages = {
  dropdown: () =>
    translateMessage({
      defaultMessage: 'Dropdown',
      id: 'kTo3a+3erf',
    }),
  paneTitle: () =>
    translateMessage({
      defaultMessage: 'Dropdown',
      id: 'J9pHkuyZ/k',
    }),
  selectCellWithDropdown: () =>
    translateMessage({
      defaultMessage: 'Select a cell with a dropdown',
      id: 'l0zVNJHJq3',
    }),
  optionsWillAppearHere: () =>
    translateMessage({
      defaultMessage: 'The dropdown’s options will appear here.',
      id: '3+CaPO/lGk',
    }),
  colors: () =>
    translateMessage({
      defaultMessage: 'Colors',
      id: '/qsHSE5X8Y',
    }),
  optionColors: () =>
    translateMessage({
      defaultMessage: 'Option colors',
      id: 'eLb5RFNXoQ',
    }),
  moreColors: () =>
    translateMessage({
      defaultMessage: 'More colors',
      id: '7DgU77PuUQ',
    }),
  options: () =>
    translateMessage({
      defaultMessage: 'Options',
      id: 'n54Lrm9U5P',
    }),
  appliesTo: () =>
    translateMessage({
      defaultMessage: 'Applies to',
      id: '2p1vHpvoXy',
    }),
  cells: () =>
    translateMessage({
      defaultMessage: 'Cells',
      id: '8xHzouB02c',
    }),
  useSelection: () =>
    translateMessage({
      defaultMessage: 'Use selection',
      id: 'E7kK7gRK+f',
    }),
  headerRow: () =>
    translateMessage({
      defaultMessage: 'Header row',
      id: 'fp4+096hL1',
    }),
  optionName: () =>
    translateMessage({
      defaultMessage: 'Option name',
      id: 'XclmYgLTmP',
    }),
  moreForDropdown: () =>
    translateMessage({
      defaultMessage: 'Dropdown actions',
      id: 'a1t9aarnNq',
    }),
  deleteOption: () =>
    translateMessage({
      defaultMessage: 'Delete',
      id: 'hSuqBu8Kee',
    }),
  presets: () =>
    translateMessage({
      defaultMessage: 'Presets',
      id: '8Jcmo9e+DE',
    }),
  editOptions: () =>
    translateMessage({
      defaultMessage: 'Edit options',
      id: '9tHE/iNdG0',
    }),
  option: () =>
    translateMessage({
      defaultMessage: 'Option',
      id: 'vDRZXMICLT',
    }),
  addOption: () =>
    translateMessage({
      defaultMessage: 'Add option',
      id: '6XCAV3cGCj',
    }),
  everywhere: () =>
    translateMessage({
      defaultMessage: 'Everywhere',
      id: 'TIX/qcGhMR',
    }),
  startFrom: () =>
    translateMessage({
      defaultMessage: 'Presets',
      id: 'd0dlL8goA1',
    }),
  customOptions: () =>
    translateMessage({
      defaultMessage: 'Custom',
      id: 'lik0YVSJ0/',
    }),
  mostOptionsReached: () =>
    translateMessage({
      defaultMessage: 'A dropdown can have up to 100 options.',
      id: '+T38pAp823',
    }),
  keysThatMoveOption: () =>
    translateMessage({
      defaultMessage: 'Use the up and down arrow keys to move it.',
      id: 'jF/6Zvx5FC',
    }),
};
