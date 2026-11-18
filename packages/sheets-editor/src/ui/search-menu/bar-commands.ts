import type { Dynamic } from '../../dynamic.ts';
import { oneRangeActOfCommand } from '../../selection/several-ranges.ts';
import { oneRangeNeededText } from '../../i18n/notice-labels.ts';
import { toolSearchWords, toolLabelWithValue } from '../../tools/search-words.ts';
import { optionColorName, toolUnavailableText } from '../../i18n/chip-labels.ts';
import {
  cellColorName,
  numberFormatChoiceLabel,
  horizontalAlignmentLabel,
  verticalAlignmentLabel,
  borderEdgesLabel,
  borderMenuMessages,
} from '../../i18n/format-labels.ts';
import { colorsEqual, NO_COLOR, STANDARD_HUE_COLORS, GRAYSCALE_COLORS, LIGHT_GRAY_COLOR, WHITE_COLOR, BLACK_COLOR } from '../../model/colors.ts';
import { NUMBER_FORMAT_MENU_CHOICES } from '../../format/number-format-choices.ts';
import { sheetMessages, textStyleLabel } from '../../i18n/sheet-messages.ts';
import { numberFormatIconOf } from '../toolbar/number-format-menu.ts';
import { customSortMessages, sortAndFilterMessages } from '../../tables/sort-filter-labels.ts';
import { SUM_BAR_AGGREGATES } from '../../state/transitions.ts';
import {
  figureNameLabel,
  insertColumnsLeftLabel,
  insertColumnsRightLabel,
  insertRowsAboveLabel,
  insertRowsBelowLabel,
} from '../../i18n/grid-action-labels.ts';
import { commandSearchSynonyms } from '../../messages/command-search.ts';
import { FONT_MARKS } from '../../editor/text-looks.ts';
import { formatToggleShortcut, HORIZONTAL_ALIGN_ICONS, VERTICAL_ALIGN_ICONS, isWrapTextOn, wrapTextToggled } from '../toolbar/text-menus.ts';
import { HORIZONTAL_ALIGNMENTS } from '../../format/toolbar-choices.ts';
import { VERTICAL_ALIGN_CHOICES, FONT_SIZE_CHOICES } from '../../format/toolbar-size-choices.ts';
import { jsx } from 'react/jsx-runtime';
import { BordersOfBlockIcon, borderChoiceIcon } from '../../format/borders-picker.ts';
import { CONDITIONAL_FORMATTING_WORDS } from '../../messages/conditional-format.ts';
import { CHART_MESSAGES } from '../../charts/chart-words.ts';
import { localeMessages } from '../../messages/locale.ts';
import { timeZoneMessages } from '../locale-time-zone-pick.ts';
import { DECIMAL_PLACE_CHANGES } from '../../format/decimal-places.ts';
import { whyNoDecimalStep, DECIMAL_STEP_ICONS } from '../toolbar/decimal-places.ts';
import { contextToolsThatFit } from '../toolbar/context-tools.ts';
import { ALL_FUNCTION_NAMES, functionNamesOffered, FUNCTION_NAMES_COMMON_FIRST } from '../../formulas/autocomplete.ts';
import { fillPaintStyle } from '../../grid/cell-drawing.ts';
import { shownCellColor } from '../../format/cell-colors.ts';
import { BORDER_EDGE_CHOICES } from '../../format/borders.ts';
export function searchMenuBarCommands(barState?: Dynamic, actions?: Dynamic) {
  let {
    whyNoToolForCells: whyNoToolForCells,
    formatOfSelection: {
      shared: shared,
      togglesOn: togglesOn,
      numberFormat: numberFormat,
      decimalPlaces: decimalPlaces,
      formatsThatFit: formatsThatFit,
      bordersOfBlock: bordersOfBlock,
      checkboxesToSet: checkboxesToSet,
    },
  } = barState;
  let selectedCountOf = (input?: Dynamic) => (input === 'columns' ? barState.selectedColumnCount : barState.selectedRowCount);
  let whyOneRangeNeeded = (input?: Dynamic) => {
    let value = barState.isOneRangeNeeded ? oneRangeActOfCommand(input) : null;
    return value === null ? null : oneRangeNeededText(value);
  };
  let pickerCommand = ({ tool: tool, label: label, icon: icon }: Dynamic) => ({
    id: `bar.${tool}`,
    label: label,
    otherWords: [
      ...toolSearchWords(tool),
      ...(tool === 'borders' ? [...toolSearchWords('borderInTheSingular'), ...toolSearchWords('bordersPanel')] : []),
      ...(tool === 'textColor' ? toolSearchWords('textColorPicker') : []),
      ...(tool === 'fillColor' ? toolSearchWords('fillColorPicker') : []),
    ],
    icon: icon,
    actsOn: 'opens',
    home: 'toolbar',
    whyNot: tool === 'conditionalFormatting' ? null : (whyNoToolForCells ?? (tool === 'chart' ? barState.whyNoChart : null)),
    run: () => actions.onPickerAsked(tool),
  });
  let colorCommands = (input?: Dynamic, options?: Dynamic, context?: Dynamic) =>
    colorCommandChoices(input).map(
      (input2?: Dynamic) => ({
        id: `bar.${input}.${colorCommandKey(input2)}`,
        label: toolLabelWithValue(options, input2.kind === 'standard' ? optionColorName(input2) : cellColorName(input, input2)),
        otherWords: toolSearchWords(input, input2.kind === 'none' ? `${input}.none` : `color.${colorCommandKey(input2)}`),
        icon: colorSwatchIcon(input, input2),
        isTicked: context !== null && colorsEqual(context, input2),
        actsOn: 'cells',
        whyNot: whyNoToolForCells,
        run: () =>
          actions.onFormatChosen(
            input === 'fillColor'
              ? {
                  fillColor: input2,
                }
              : {
                  textColor: input2,
                },
          ),
      }),
    );
  let numberFormatChoice = barState.arePeopleSelected ? 'person' : numberFormat.choice;
  let numberFormatCommands2 = (formatsThatFit.includes('general') ? NUMBER_FORMAT_MENU_CHOICES : []).map((input?: Dynamic) => {
    if (input === 'customFormat')
      return {
        id: 'bar.numberFormat.customFormat',
        label: toolLabelWithValue(sheetMessages.numberFormat(), sheetMessages.customFormat()),
        otherWords: toolSearchWords('numberFormat', 'customFormat'),
        icon: 'Sliders',
        actsOn: 'opens',
        whyNot: whyNoToolForCells,
        run: () =>
          actions.onFormatChosen({
            patternToType: true,
          }),
      };
    let state = {
      id: `bar.numberFormat.${input}`,
      label: toolLabelWithValue(sheetMessages.numberFormat(), numberFormatChoiceLabel(input)),
      otherWords: toolSearchWords('numberFormat', input),
      icon: numberFormatIconOf(input).icon,
      isTicked: numberFormatChoice === input,
      actsOn: 'cells',
      whyNot: whyNoToolForCells,
      run: () =>
        actions.onFormatChosen({
          numberFormatChoice: input,
        }),
    };
    if (shared.cellControl?.kind !== 'none') state.isWeighty = true;
    return state;
  });
  let whyNoMerge = barState.isOneRangeNeeded ? oneRangeNeededText('mergeCells') : sheetMessages.moreCellsNeededToMerge();
  let customSortCommands = [
    {
      id: 'bar.customSort',
      label: customSortMessages.customSort(),
      otherWords: toolSearchWords('customSort'),
      icon: 'Sort',
      actsOn: 'opens',
      home: 'pane',
      whyNot: whyNoToolForCells,
      run: () => actions.onSortPaneAsked('sheet'),
    },
  ];
  let contextToolCommands = (input?: Dynamic) => {
    switch (input) {
      case 'insertDropdown':
      case 'insertPerson':
      case 'insertDate':
      case 'insertCheckbox':
      case 'asDropdown':
      case 'asCheckbox':
      case 'fontSize':
      case 'wrapText':
      case 'currency':
      case 'percent':
      case 'fewerDecimalPlaces':
      case 'moreDecimalPlaces':
      case 'mergeCells':
      case 'unmergeCells':
        return [];
      case 'optionsOfDropdown':
        return [
          {
            id: 'bar.optionsOfDropdown',
            label: sheetMessages.optionsOfDropdownInFull(),
            otherWords: toolSearchWords('optionsOfDropdown'),
            icon: 'Dropdown',
            isTicked: barState.isPaneOfDropdownOpen,
            actsOn: 'opens',
            home: 'pane',
            whyNot: null,
            run: actions.onPaneOfDropdownAsked,
          },
        ];
      case 'checkAll':
      case 'uncheckAll': {
        let { isChecking: isChecking, icon: icon, inWords: inWords, whyNot: whyNot } = CHECKBOX_SETTING_TOOLS[input];
        return [
          {
            id: `bar.${input}`,
            label: inWords(),
            otherWords: toolSearchWords(input),
            icon: icon,
            actsOn: 'cells',
            whyNot: whyNoToolForCells ?? whyNot(checkboxesToSet),
            isWeighty: true,
            run: () => actions.onCheckboxesSet(isChecking),
          },
        ];
      }
      case 'sum':
        return SUM_BAR_AGGREGATES.map(
          (input2?: Dynamic) => ({
            id: `bar.sum.${input2}`,
            label: toolLabelWithValue(sheetMessages.calculations(), figureNameLabel(input2)),
            otherWords: toolSearchWords('calculations', input2),
            icon: 'Sigma',
            actsOn: 'cells',
            whyNot:
              whyNoToolForCells ??
              (barState.canWriteFigures
                ? null
                : barState.selectedColumnCount > 1
                  ? sheetMessages.oneColumnNeededForFigure()
                  : sheetMessages.noRoomForFigure()),
            isWeighty: true,
            run: () => actions.onFigureChosen(input2),
          }),
        );
      case 'insertColumns':
      case 'insertRows':
        return INSERT_ROW_COLUMN_TOOLS.filter(({ insert: insert }: Dynamic) => insert === input).flatMap(
          ({ of: of, first: first, second: second }: Dynamic) =>
            [first, second].map(
              ({ change: change, icon: icon, inWords: inWords }: Dynamic) => ({
                id: `bar.${change}`,
                label: inWords(selectedCountOf(of)),
                otherWords: toolSearchWords(input, change),
                icon: icon,
                actsOn: 'cells',
                whyNot: whyNoToolForCells ?? whyOneRangeNeeded(change),
                isWeighty: true,
                run: () => actions.onSheetChangeChosen(change),
              }),
            ),
        );
      case 'sort':
        return [
          {
            id: 'bar.sortAndFilter',
            label: sortAndFilterMessages.sortAndFilter(),
            otherWords: commandSearchSynonyms('sortAndFilter'),
            icon: 'Filter',
            actsOn: 'opens',
            home: 'toolbar',
            whyNot: whyNoToolForCells,
            run: () => actions.onPickerAsked('sort'),
          },
          ...(barState.sectionShows === 'columns' ? customSortCommands : []),
        ];
    }
  };
  return [
    ...FONT_MARKS.map(
      (input?: Dynamic) => ({
        id: `bar.${input}`,
        label: textStyleLabel(input),
        otherWords: toolSearchWords(input),
        icon: TEXT_TOGGLE_ICONS[input].icon,
        keys: formatToggleShortcut(input),
        isTicked: togglesOn[input],
        actsOn: 'cells',
        whyNot: whyNoToolForCells,
        run: () =>
          actions.onFormatChosen({
            toggle: input,
          }),
      }),
    ),
    ...HORIZONTAL_ALIGNMENTS.map(
      (input?: Dynamic) => ({
        id: `bar.align.${input}`,
        label: toolLabelWithValue(sheetMessages.align(), horizontalAlignmentLabel(input)),
        otherWords: toolSearchWords('align', `align.${input}`),
        icon: HORIZONTAL_ALIGN_ICONS[input],
        isTicked: shared.alignment.horizontal === input,
        actsOn: 'cells',
        whyNot: whyNoToolForCells,
        run: () =>
          actions.onFormatChosen({
            horizontalAlignment: input,
          }),
      }),
    ),
    ...VERTICAL_ALIGN_CHOICES.map(
      (input?: Dynamic) => ({
        id: `bar.alignVertically.${input}`,
        label: toolLabelWithValue(sheetMessages.alignVertically(), verticalAlignmentLabel(input)),
        otherWords: toolSearchWords('alignVertically', `alignVertically.${input}`),
        icon: VERTICAL_ALIGN_ICONS[input],
        isTicked: shared.alignment.vertical === input,
        actsOn: 'cells',
        whyNot: whyNoToolForCells,
        run: () =>
          actions.onFormatChosen({
            verticalAlignment: input,
          }),
      }),
    ),
    {
      id: 'bar.wrapText',
      label: sheetMessages.wrapText(),
      otherWords: toolSearchWords('wrapText'),
      icon: 'TextWrap',
      isTicked: isWrapTextOn(shared),
      actsOn: 'cells',
      whyNot: whyNoToolForCells,
      run: () => actions.onFormatChosen(wrapTextToggled(shared)),
    },
    ...FONT_SIZE_CHOICES.map((input?: Dynamic) => fontSizeCommand(input, barState, actions)),
    pickerCommand({
      tool: 'textColor',
      label: sheetMessages.textColor(),
      icon: COLOR_TOOL_ICONS.textColor,
    }),
    ...colorCommands('textColor', sheetMessages.textColor(), shared.font.color),
    pickerCommand({
      tool: 'fillColor',
      label: sheetMessages.cellColor(),
      icon: COLOR_TOOL_ICONS.fillColor,
    }),
    ...colorCommands('fillColor', sheetMessages.cellColor(), shared.fillColor),
    pickerCommand({
      tool: 'borders',
      label: sheetMessages.borders(),
      icon: jsx(BordersOfBlockIcon, {
        lines: bordersOfBlock,
      }),
    }),
    ...BORDER_CHOICES_WITH_CLEAR.map(
      (input?: Dynamic) => ({
        id: `bar.borders.${input}`,
        label: borderEdgesLabel(input),
        otherWords: toolSearchWords('borders', 'borderInTheSingular', `borders.${input}`),
        icon: borderChoiceIcon(input),
        actsOn: 'cells',
        whyNot: whyNoToolForCells,
        run: () => actions.onBordersChosen(input),
      }),
    ),
    {
      id: 'bar.borders.color',
      label: borderMenuMessages.borderColor(),
      otherWords: [...toolSearchWords('borders'), ...toolSearchWords('borderColor')],
      icon: colorSwatchIcon('textColor', barState.borderPen.color),
      actsOn: 'opens',
      home: 'toolbar',
      whyNot: whyNoToolForCells,
      run: () => actions.onPickerAsked('borders'),
    },
    {
      id: 'bar.showGridlines',
      label: borderMenuMessages.showGridlines(),
      otherWords: toolSearchWords('showGridlines'),
      icon: null,
      isTicked: !barState.areGridlinesHidden,
      actsOn: 'sheet',
      whyNot: whyNoToolForCells,
      run: actions.onGridlinesToggled,
    },
    pickerCommand({
      tool: 'conditionalFormatting',
      label: CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
      icon: 'ConditionalFormat',
    }),
    pickerCommand({
      tool: 'chart',
      label: CHART_MESSAGES.insertChart(),
      icon: 'Chart',
    }),
    ...numberFormatCommands2,
    {
      id: 'bar.locale',
      label: localeMessages.locale(),
      otherWords: toolSearchWords('locale'),
      icon: 'Globe',
      actsOn: 'file',
      whyNot: null,
      isWeighty: true,
      run: actions.onLocaleAsked,
    },
    {
      id: 'bar.timeZone',
      label: timeZoneMessages.timeZone(),
      otherWords: toolSearchWords('timeZone'),
      icon: 'Clock',
      actsOn: 'file',
      whyNot: null,
      isWeighty: true,
      run: actions.onTimeZoneAsked,
    },
    ...DECIMAL_PLACE_CHANGES.flatMap((input?: Dynamic) => {
      let value = decimalPlaces[input] === null ? whyNoDecimalStep(input, decimalPlaces) : null;
      if (whyNoToolForCells === null && decimalPlaces[input] === null && value === null) return [];
      return [
        {
          id: `bar.${input}DecimalPlaces`,
          label: input === 'more' ? sheetMessages.increaseDecimalPlaces() : sheetMessages.decreaseDecimalPlaces(),
          otherWords: toolSearchWords(`${input}DecimalPlaces`),
          icon: DECIMAL_STEP_ICONS[input],
          actsOn: 'cells',
          whyNot: whyNoToolForCells ?? value,
          keepsOpen: true,
          run: () =>
            actions.onFormatChosen({
              stepOfDecimalPlaces: input,
            }),
        },
      ];
    }),
    ...contextToolsThatFit(barState.sectionShows, 'all', {
      hasSortAndFilter: barState.isSortAndFilterOnBar,
    }).flatMap(contextToolCommands),
    ...(barState.canMergeSelection || !barState.canUnmergeSelection
      ? [
          {
            id: 'bar.mergeCells',
            label: sheetMessages.mergeCells(),
            otherWords: toolSearchWords('mergeCells'),
            icon: MERGE_TOOL_ICONS.mergeCells,
            actsOn: 'cells',
            whyNot: whyNoToolForCells ?? (barState.canMergeSelection ? null : whyNoMerge),
            isWeighty: true,
            run: () => actions.onMergeChangeChosen('mergeCells'),
          },
        ]
      : []),
    ...(barState.canUnmergeSelection
      ? [
          {
            id: 'bar.unmergeCells',
            label: sheetMessages.unmergeCells(),
            otherWords: toolSearchWords('unmergeCells'),
            icon: MERGE_TOOL_ICONS.unmergeCells,
            actsOn: 'cells',
            whyNot: whyNoToolForCells,
            isWeighty: true,
            run: () => actions.onMergeChangeChosen('unmergeCells'),
          },
        ]
      : []),
    ...barState.inserts.map(
      ({ what: what, icon: icon, label: label, fits: fits, whyNotNow: whyNotNow }: Dynamic) => ({
        id: `bar.insert.${what}`,
        label: toolLabelWithValue(sheetMessages.insert(), label),
        otherWords: toolSearchWords('insert', INSERT_TOOL_OF_CELL_CONTROL[what]),
        icon: icon,
        isTicked: what !== 'date' && numberFormatChoice === what,
        actsOn: what === 'person' ? 'activeCell' : 'cells',
        whyNot: whyNoToolForCells ?? (fits ? (whyNotNow ?? null) : toolUnavailableText(label)),
        isWeighty: true,
        run: () => actions.onInsertChosen(what),
      }),
    ),
  ];
}
export function functionCommands(names?: Dynamic, state?: Dynamic, actions?: Dynamic) {
  if (!state.canEdit || state.isEntryOpen) return [];
  return names.map(
    (input?: Dynamic) => ({
      id: `function.${input}`,
      label: input,
      icon: 'Function',
      actsOn: 'activeCell',
      whyNot: null,
      run: () => actions.onFunctionChosen(input),
    }),
  );
}
export function functionCommandsForFormula(query?: Dynamic, limit?: Dynamic, state?: Dynamic, actions?: Dynamic) {
  let trimmed = query.trim();
  if (!trimmed.startsWith('=')) return [];
  let typedName = trimmed.slice(1).trimStart().toUpperCase();
  let names = typedName.endsWith('(')
    ? ALL_FUNCTION_NAMES.filter((input?: Dynamic) => `${input}(` === typedName)
    : functionNamesOffered(typedName);
  return functionCommands(names.slice(0, limit), state, actions);
}
export function functionCommandsForPrefix(query?: Dynamic, limit?: Dynamic, state?: Dynamic, actions?: Dynamic) {
  let prefix = query.trim().toUpperCase();
  if (prefix.length < FUNCTION_PREFIX_MIN_LENGTH) return [];
  return functionCommands(FUNCTION_NAMES_COMMON_FIRST.filter((input?: Dynamic) => input.startsWith(prefix)).slice(0, limit), state, actions);
}
export const colorSwatchIcon = (tool?: Dynamic, color?: Dynamic) =>
  jsx('span', {
    'aria-hidden': true,
    className: 'sheet-swatch',
    'data-as-icon': true,
    'data-has-fill': color.kind === 'none' ? undefined : true,
    'data-no-color': color.kind === 'none' ? true : undefined,
    style: fillPaintStyle(shownCellColor(tool, color)),
  });
export const TEXT_TOGGLE_ICONS = {
  bold: {
    icon: 'TextBold',
  },
  italic: {
    icon: 'TextItalics',
  },
  underline: {
    icon: 'TextUnderline',
  },
  strikethrough: {
    icon: 'Strikethrough',
  },
};
export const COLOR_TOOL_ICONS = {
  textColor: 'TextT',
  fillColor: 'PaintBucket',
};
export const MERGE_TOOL_ICONS = {
  mergeCells: 'TableCellsMerge',
  unmergeCells: 'TableCellSplit',
};
export const CHECKBOX_SETTING_TOOLS = {
  checkAll: {
    isChecking: true,
    icon: 'Check',
    inWords: sheetMessages.checkAll,
    whyNot({ isAnyToCheck: isAnyToCheck, isAnyUncheckedByFormula: isAnyUncheckedByFormula }: Dynamic) {
      if (isAnyToCheck) return null;
      return isAnyUncheckedByFormula ? sheetMessages.formulasSetWhatIsLeft() : sheetMessages.nothingToCheck();
    },
  },
  uncheckAll: {
    isChecking: false,
    icon: 'X',
    inWords: sheetMessages.uncheckAll,
    whyNot({ isAnyToUncheck: isAnyToUncheck, isAnyCheckedByFormula: isAnyCheckedByFormula }: Dynamic) {
      if (isAnyToUncheck) return null;
      return isAnyCheckedByFormula ? sheetMessages.formulasSetWhatIsLeft() : sheetMessages.nothingToUncheck();
    },
  },
};
export const INSERT_ROW_COLUMN_TOOLS = [
  {
    of: 'columns',
    insert: 'insertColumns',
    first: {
      change: 'insertColumnLeft',
      icon: 'TableColumnInsertLeft',
      inWords: insertColumnsLeftLabel,
    },
    second: {
      change: 'insertColumnRight',
      icon: 'TableColumnInsertRight',
      inWords: insertColumnsRightLabel,
    },
  },
  {
    of: 'rows',
    insert: 'insertRows',
    first: {
      change: 'insertRowAbove',
      icon: 'TableRowInsertAbove',
      inWords: insertRowsAboveLabel,
    },
    second: {
      change: 'insertRowBelow',
      icon: 'TableRowInsertBelow',
      inWords: insertRowsBelowLabel,
    },
  },
];
export const BORDER_CHOICES_WITH_CLEAR = [...BORDER_EDGE_CHOICES, 'clear'];
export const INSERT_TOOL_OF_CELL_CONTROL = {
  dropdown: 'insertDropdown',
  person: 'insertPerson',
  date: 'insertDate',
  checkbox: 'insertCheckbox',
};
export const COLOR_COMMAND_SHADES = {
  fillColor: 100,
  textColor: 600,
};
export const fontSizeCommand = (size?: Dynamic, barState?: Dynamic, actions?: Dynamic) => ({
  id: `bar.fontSize.${size}`,
  label: toolLabelWithValue(sheetMessages.fontSize(), String(size)),
  otherWords: toolSearchWords('fontSize', `fontSize.${size}`),
  icon: 'TextAa',
  isTicked: barState.formatOfSelection.shared.font.size === size,
  actsOn: 'cells',
  whyNot: barState.whyNoToolForCells,
  run: () =>
    actions.onFormatChosen({
      fontSizeInPoints: size,
    }),
});
export const colorCommandChoices = (tool?: Dynamic) => [
  NO_COLOR,
  ...[...STANDARD_HUE_COLORS, ...GRAYSCALE_COLORS].filter(
    (input?: Dynamic) =>
      input.kind === 'standard' ? input.shade === COLOR_COMMAND_SHADES[tool] : tool === 'textColor' && !colorsEqual(input, LIGHT_GRAY_COLOR),
  ),
];
export const colorCommandKey = (color?: Dynamic) => {
  if (color.kind === 'standard') return color.hue;
  if (color.kind === 'none') return color.kind;
  if (colorsEqual(color, WHITE_COLOR)) return 'white';
  return colorsEqual(color, BLACK_COLOR) ? 'black' : color.hex;
};
export const FUNCTION_PREFIX_MIN_LENGTH = 2;
