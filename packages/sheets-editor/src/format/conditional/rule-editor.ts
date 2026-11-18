import { FieldRoot } from '../../kit/field.tsx';
import { TextInput } from '../../kit/text-input.tsx';
import { SegmentedControl } from '../../kit/segmented-control.tsx';
import { Menu } from '../../kit/menu.tsx';
import { Popover } from '../../kit/popover.tsx';
import { Button } from '../../kit/button.tsx';
import { Icon } from '../../kit/icon.tsx';
import { Tooltip, TooltipGroup } from '../../kit/tooltip.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import {
  ELLIPSIS_INPUT_CLASSES,
  PaneRowNote,
  PaneRow,
  PaneSelect,
  PANE_SELECT_TRIGGER_CLASSES,
  PANE_SELECT_HEIGHT_CLASSES,
  PaneSelectCaret,
  PaneSection,
  revealInSidePane,
  PaneTableButton,
} from '../../ui/side-pane/side-pane.ts';
import { whenBlurredToNothing } from '../../grid/focus-left.ts';
import {
  controlWithChoiceLabel,
  CONDITIONAL_FORMATTING_WORDS,
  operandKindLabel,
  ruleColumnName,
  thisCellOfColumnWords,
  conditionOperatorLabel,
  rulePresetLabel,
  scaleAnchorKindLabel,
  scaleStopLabel,
  scaleStopControlLabel,
  ruleMatchCountWords,
  movedToNumbersWords,
} from '../../messages/conditional-format.ts';
import { SheetDateInput } from '../../chips/date-input.ts';
import { fillPaintStyle } from '../../grid/cell-drawing.ts';
import { shownCellColor } from '../cell-colors.ts';
import { colorsEqual, colorKey, NO_COLOR, STANDARD_HUE_COLORS } from '../../model/colors.ts';
import { optionColorName } from '../../i18n/chip-labels.ts';
import { cellColorName, dropdownPaneMessages, colorButtonLabel } from '../../i18n/format-labels.ts';
import { blockRepeatedEnterOrSpace } from '../../ui/repeated-key-guards.ts';
import { popupPropsUnderHeader } from '../../shell/bottom-insets.ts';
import { COLOR_POPUP_PADDING, SheetColorPicker } from '../color-picker.ts';
import { ruleFormatSampleProps, colorScaleStripes } from './rule-samples.ts';
import { RULE_FORMAT_PRESETS, isFontStyleOn } from './rule-edits.ts';
import { sheetMessages, textStyleLabel } from '../../i18n/sheet-messages.ts';
import { TEXT_TOGGLE_ICONS } from '../../ui/search-menu/bar-commands.ts';
import { useFocusRescue } from '../../ui/focus-rescue.ts';
import { WordsWithColumnNames } from '../../ui/card-rows.ts';
export function RuleTextField({
  box: box,
  name: name,
  whyNotSaidBy: whyNotSaidBy,
  isOfDigits: isOfDigits,
  slotEnd: slotEnd,
  onAct: onAct,
}: Dynamic) {
  return jsx(FieldRoot, {
    invalid: !box.isReadable,
    className: 'min-w-0 flex-1',
    children: jsx(TextInput, {
      fullWidth: true,
      className: ELLIPSIS_INPUT_CLASSES,
      dir: 'auto',
      'aria-label': name,
      'aria-describedby': box.isReadable ? undefined : whyNotSaidBy,
      autoComplete: 'off',
      autoCapitalize: 'off',
      autoCorrect: 'off',
      spellCheck: false,
      inputMode: isOfDigits === true ? 'numeric' : undefined,
      value: box.text,
      slotEnd: slotEnd,
      onChange: (input?: Dynamic) =>
        onAct({
          kind: 'type',
          field: box.field,
          text: input.target.value,
        }),
      onBlur: ({ relatedTarget: relatedTarget, currentTarget: currentTarget }: Dynamic) => {
        if (!box.isBeingTyped) return;
        if (relatedTarget !== null)
          onAct({
            kind: 'enterTyped',
          });
        else
          whenBlurredToNothing(
            currentTarget,
            () =>
              onAct({
                kind: 'enterTyped',
              }),
          );
      },
      onKeyDown: (event?: Dynamic) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          return onAct({
            kind: 'enterTyped',
          });
        }
        if (!box.isReadable && (event.ctrlKey || event.metaKey) && /^[yz]$/i.test(event.key)) return event.stopPropagation();
        if (event.key !== 'Escape' || (!box.isBeingTyped && box.isReadable)) return;
        event.preventDefault();
        event.stopPropagation();
        return onAct({
          kind: 'dropTyped',
          field: box.field,
        });
      },
    }),
  });
}
export function RuleFieldRefusal({ box: box, id: id, isInRow: isInRow = false, children: children }: Dynamic) {
  if (box === null || box.isReadable) return null;
  return jsx(PaneRowNote, {
    id: id,
    isRefusal: true,
    isInRow: isInRow,
    children: children,
  });
}
export function RuleOperandFields({ test: test, operand: operand, onAct: onAct }: Dynamic) {
  let { slot: slot, choice: choice, choices: choices, value: value } = operand;
  let operandId = React.useId();
  let isNumberOperand = value?.kind === 'number' || value?.kind === 'days';
  return jsx('div', {
    className: `flex min-w-0 shrink-0 flex-col ${slot === 'otherEnd' ? 'pt-1' : ''}`,
    children: jsx(PaneRow, {
      label: '',
      children: jsxs('div', {
        className: 'flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1 py-px',
        children: [
          jsx('div', {
            className: 'flex min-w-0 flex-auto',
            children: jsx(PaneSelect, {
              name: controlWithChoiceLabel(CONDITIONAL_FORMATTING_WORDS.kindOfValue(), operandKindLabel(choice)),
              value: choice,
              items: choices.map(
                (input?: Dynamic) => ({
                  value: input,
                  label: operandKindLabel(input),
                }),
              ),
              onChange: (input?: Dynamic) =>
                onAct({
                  kind: 'chooseOperand',
                  test: test,
                  slot: slot,
                  choice: input,
                }),
            }),
          }),
          isNumberOperand &&
            jsxs('div', {
              className: `flex min-w-0 flex-col ${value.kind === 'days' ? 'flex-[99_1_3rem]' : 'flex-[99_1_5.5rem]'}`,
              children: [
                jsx(RuleTextField, {
                  box: value,
                  name: CONDITIONAL_FORMATTING_WORDS.value(),
                  whyNotSaidBy: operandId,
                  ...(value.kind === 'days' && {
                    isOfDigits: true,
                  }),
                  onAct: onAct,
                }),
                jsx(RuleFieldRefusal, {
                  box: value,
                  id: operandId,
                  isInRow: true,
                  children: CONDITIONAL_FORMATTING_WORDS.enterANumber(),
                }),
              ],
            }),
          value?.kind === 'day' &&
            jsx(SheetDateInput, {
              'aria-label': CONDITIONAL_FORMATTING_WORDS.value(),
              className: 'min-w-0 flex-[99_1_8rem]',
              value: value.day,
              onValueCommitted: (input?: Dynamic) => {
                if (input !== null)
                  onAct({
                    kind: 'chooseDay',
                    test: test,
                    slot: slot,
                    day: input,
                  });
              },
            }),
          value?.kind === 'column' &&
            jsx('div', {
              className: 'flex min-w-0 flex-auto',
              children: jsx(PaneSelect, {
                name: controlWithChoiceLabel(
                  CONDITIONAL_FORMATTING_WORDS.value(),
                  ruleColumnName(
                    value.columns.find((input?: Dynamic) => input.value === value.c)?.column ?? {
                      kind: 'gone',
                    },
                  ),
                ),
                value: value.c,
                items: value.columns.map(
                  (input?: Dynamic) => ({
                    value: input.value,
                    label: ruleColumnName(input.column),
                  }),
                ),
                onChange: (input?: Dynamic) =>
                  onAct({
                    kind: 'chooseOperandColumn',
                    test: test,
                    slot: slot,
                    c: input,
                  }),
              }),
            }),
        ],
      }),
    }),
  });
}
export function RuleConditionFields({ test: test, isAlone: isAlone, onAct: onAct, onRemove: onRemove }: Dynamic) {
  let {
    index: index,
    tested: tested,
    columns: columns,
    choice: choice,
    choices: choices,
    isOfDates: isOfDates,
    operands: operands,
    text: text,
    count: count,
  } = test;
  let [valueRefusalId, countRefusalId] = [React.useId(), React.useId()];
  let columnName = ({ value: value, column: column }: Dynamic) =>
    value === null ? thisCellOfColumnWords(column) : ruleColumnName(column);
  let testedColumn = columns.find(({ value: value }: Dynamic) => value === tested);
  return jsxs('div', {
    className: `flex min-w-0 shrink-0 flex-col ${index === 0 ? '' : 'pt-2'}`,
    children: [
      jsx(PaneRow, {
        label: index === 0 ? CONDITIONAL_FORMATTING_WORDS.when() : CONDITIONAL_FORMATTING_WORDS.and(),
        children: jsx(PaneSelect, {
          name: controlWithChoiceLabel(
            CONDITIONAL_FORMATTING_WORDS.column(),
            testedColumn === undefined
              ? ruleColumnName({
                  kind: 'gone',
                })
              : columnName(testedColumn),
          ),
          value: tested ?? THIS_CELL_TESTED_VALUE,
          items: columns.map(
            (input?: Dynamic) =>
              input.value === null && input.column.kind !== 'eachCell'
                ? {
                    value: THIS_CELL_TESTED_VALUE,
                    label: ruleColumnName(input.column),
                    hint: CONDITIONAL_FORMATTING_WORDS.thisCell(),
                  }
                : {
                    value: input.value ?? THIS_CELL_TESTED_VALUE,
                    label: columnName(input),
                  },
          ),
          onChange: (input?: Dynamic) =>
            onAct({
              kind: 'chooseTested',
              test: index,
              tested:
                input === THIS_CELL_TESTED_VALUE
                  ? {
                      kind: 'theCellItself',
                    }
                  : {
                      kind: 'sameRowInColumn',
                      c: input,
                    },
            }),
          ...(!isAlone && {
            lastRow: {
              label: CONDITIONAL_FORMATTING_WORDS.removeCondition(),
              onPicked: onRemove,
            },
          }),
        }),
      }),
      jsx('div', {
        className: 'contents',
        'data-comparison-awaited': choice === null ? '' : undefined,
        children: jsx(PaneRow, {
          label: '',
          children: jsx(PaneSelect, {
            name: controlWithChoiceLabel(
              CONDITIONAL_FORMATTING_WORDS.condition(),
              choice === null ? CONDITIONAL_FORMATTING_WORDS.chooseACondition() : conditionOperatorLabel(choice, isOfDates),
            ),
            value: choice ?? NO_CONDITION_CHOSEN_VALUE,
            placeholder: CONDITIONAL_FORMATTING_WORDS.chooseACondition(),
            items: choices.map(
              (input?: Dynamic) => ({
                value: input,
                label: conditionOperatorLabel(input, isOfDates),
              }),
            ),
            onChange: (input?: Dynamic) => {
              if (input !== NO_CONDITION_CHOSEN_VALUE)
                onAct({
                  kind: 'chooseCondition',
                  test: index,
                  choice: input,
                });
            },
          }),
        }),
      }),
      operands.map(
        (input?: Dynamic) =>
          jsx(
            RuleOperandFields,
            {
              test: index,
              operand: input,
              onAct: onAct,
            },
            input.slot,
          ),
      ),
      text !== null &&
        jsx(PaneRow, {
          label: '',
          children:
            text.offered === null
              ? jsx(RuleTextField, {
                  box: text,
                  name: CONDITIONAL_FORMATTING_WORDS.value(),
                  whyNotSaidBy: valueRefusalId,
                  onAct: onAct,
                })
              : jsx(PaneSelect, {
                  name: controlWithChoiceLabel(CONDITIONAL_FORMATTING_WORDS.value(), text.text),
                  value: text.text,
                  items: text.offered.map(
                    (input?: Dynamic) => ({
                      value: input,
                      label: input,
                    }),
                  ),
                  onChange: (input?: Dynamic) =>
                    onAct({
                      kind: 'chooseText',
                      test: index,
                      text: input,
                    }),
                }),
        }),
      jsx(RuleFieldRefusal, {
        box: text?.offered === null ? text : null,
        id: valueRefusalId,
        children: CONDITIONAL_FORMATTING_WORDS.enterText(),
      }),
      count !== null &&
        jsx(PaneRow, {
          label: '',
          children: jsx(RuleTextField, {
            box: count,
            name: CONDITIONAL_FORMATTING_WORDS.value(),
            whyNotSaidBy: countRefusalId,
            isOfDigits: true,
            onAct: onAct,
          }),
        }),
      jsx(RuleFieldRefusal, {
        box: count,
        id: countRefusalId,
        children: CONDITIONAL_FORMATTING_WORDS.enterANumber(),
      }),
    ],
  });
}
export function RuleColorSwatch({ property: property, color: color }: Dynamic) {
  return jsx('span', {
    'aria-hidden': true,
    className: 'sheet-swatch sheet-swatch-of-rule flex-none',
    'data-has-fill': color.kind !== 'none' || undefined,
    'data-is-empty': color.kind === 'none' || undefined,
    style: fillPaintStyle(shownCellColor(property, color)),
  });
}
export function RuleColorChooser({
  property: property,
  color: color,
  otherColor: otherColor,
  shade: shade,
  form: form,
  name: name,
  nameOfPicker: nameOfPicker,
  isOff = false,
  whatColorPickerShows: whatColorPickerShows,
  onChosen: onChosen,
}: Dynamic) {
  let [openPicker, setOpenPicker] = React.useState(null);
  let swatchesRef = React.useRef(null);
  let isOpenChangeSwallowedRef = React.useRef(false);
  let colorChoices = ruleColorChoicesOfShade(shade);
  let colorChoiceName = (color2?: Dynamic) =>
    color2.kind === 'standard' && colorChoices.some((input?: Dynamic) => colorsEqual(input, color2))
      ? optionColorName(color2)
      : cellColorName(property, color2);
  return jsxs(Fragment, {
    children: [
      jsxs(Menu.Root, {
        open: openPicker === 'list',
        onOpenChange: (isOpen?: Dynamic) => {
          let isSwallowed = isOpenChangeSwallowedRef.current;
          isOpenChangeSwallowedRef.current = false;
          if (!isSwallowed) setOpenPicker(isOpen ? 'list' : null);
        },
        children: [
          jsx(Menu.Trigger, {
            render:
              form === 'field'
                ? jsxs('button', {
                    ref: swatchesRef,
                    type: 'button',
                    'aria-label': name,
                    disabled: isOff,
                    className: `${PANE_SELECT_TRIGGER_CLASSES.className} ${PANE_SELECT_HEIGHT_CLASSES.className}`,
                    children: [
                      jsx(RuleColorSwatch, {
                        property: property,
                        color: color,
                      }),
                      jsx('span', {
                        className: 'min-w-0 flex-1 truncate',
                        children: colorChoiceName(color),
                      }),
                      jsx(PaneSelectCaret, {}),
                    ],
                  })
                : jsx(Button, {
                    ref: swatchesRef,
                    variant: 'ghost',
                    iconOnly: true,
                    'aria-label': name,
                    tooltip: colorChoiceName(color),
                    disabled: isOff,
                    className: 'sheet-button-of-swatch-at-rows-end',
                    icon: jsx(RuleColorSwatch, {
                      property: property,
                      color: color,
                    }),
                  }),
          }),
          jsxs(Menu.Popup, {
            align: form === 'field' ? 'start' : 'end',
            ...(form === 'field' && {
              className: 'min-w-[var(--anchor-width)]',
            }),
            onKeyDownCapture: blockRepeatedEnterOrSpace,
            children: [
              jsx(Menu.Group, {
                'aria-label': nameOfPicker,
                children: colorChoices.map(
                  (input?: Dynamic) =>
                    jsx(
                      Menu.Item,
                      {
                        label: colorChoiceName(input),
                        checked: colorsEqual(color, input),
                        checkedRole: 'radio',
                        checkPosition: 'trailing',
                        onClick: () => onChosen(input),
                        children: jsxs('span', {
                          className: 'flex min-w-32 items-center gap-2',
                          children: [
                            jsx(RuleColorSwatch, {
                              property: property,
                              color: input,
                            }),
                            colorChoiceName(input),
                          ],
                        }),
                      },
                      colorKey(input),
                    ),
                ),
              }),
              jsx(Menu.Separator, {}),
              jsx(Menu.Item, {
                onClick: () => {
                  isOpenChangeSwallowedRef.current = true;
                  setOpenPicker('picker');
                },
                children: jsxs('span', {
                  className: 'flex items-center gap-2',
                  children: [
                    jsx('span', {
                      className: 'grid w-4 place-items-center',
                      children: jsx(Icon, {
                        name: 'Palette',
                        size: 'sm',
                      }),
                    }),
                    dropdownPaneMessages.moreColors(),
                  ],
                }),
              }),
            ],
          }),
        ],
      }),
      jsx(Popover.Root, {
        open: openPicker === 'picker',
        onOpenChange: (input?: Dynamic) => {
          if (!input) setOpenPicker(null);
        },
        children: jsx(Popover.Popup, {
          ...popupPropsUnderHeader(),
          anchor: swatchesRef,
          side: 'bottom',
          align: form === 'field' ? 'start' : 'end',
          padding: COLOR_POPUP_PADDING,
          'aria-label': nameOfPicker,
          finalFocus: () => swatchesRef.current ?? true,
          children: jsx(SheetColorPicker, {
            property: property,
            color: color,
            whatIsColored: {
              kind: 'cells',
              otherColor: otherColor,
            },
            whatItShows: whatColorPickerShows,
            onChosen: onChosen,
            onDone: () => setOpenPicker(null),
          }),
        }),
      }),
    ],
  });
}
export function RuleFormatSection({
  does: { format: format, preset: preset },
  whatColorPickerShows: whatColorPickerShows,
  onAct: onAct,
}: Dynamic) {
  let [fillColor, textColor] = [format.fillColor ?? NO_COLOR, format.font?.color ?? NO_COLOR];
  return jsxs(PaneSection, {
    title: CONDITIONAL_FORMATTING_WORDS.format(),
    children: [
      jsx(PaneRow, {
        label: CONDITIONAL_FORMATTING_WORDS.preview(),
        children: jsx('span', {
          'aria-hidden': true,
          className: 'sheet-rule-sample sheet-rule-preview',
          ...ruleFormatSampleProps(format),
          children: CONDITIONAL_FORMATTING_WORDS.sample(),
        }),
      }),
      jsx(PaneRow, {
        label: CONDITIONAL_FORMATTING_WORDS.presetsLabel(),
        children: jsx('fieldset', {
          'aria-label': CONDITIONAL_FORMATTING_WORDS.presets(),
          className: 'm-0 grid min-w-0 flex-1 grid-cols-6 gap-1 border-0 p-0',
          children: jsx(TooltipGroup, {
            children: RULE_FORMAT_PRESETS.map(
              (input?: Dynamic) =>
                jsx(
                  Tooltip,
                  {
                    content: rulePresetLabel(input.key),
                    children: jsx('button', {
                      type: 'button',
                      'aria-label': rulePresetLabel(input.key),
                      'aria-pressed': preset === input.key,
                      className: 'sheet-rule-sample sheet-rule-preset',
                      ...ruleFormatSampleProps(input.format),
                      onClick: () =>
                        onAct({
                          kind: 'choosePreset',
                          preset: input.key,
                        }),
                      children: jsx('span', {
                        'aria-hidden': true,
                        children: CONDITIONAL_FORMATTING_WORDS.sample(),
                      }),
                    }),
                  },
                  input.key,
                ),
            ),
          }),
        }),
      }),
      jsx(PaneRow, {
        label: sheetMessages.cellColor(),
        children: jsx(RuleColorChooser, {
          property: 'fillColor',
          color: fillColor,
          otherColor: textColor,
          shade: 100,
          form: 'field',
          name: colorButtonLabel('fillColor', fillColor),
          nameOfPicker: sheetMessages.cellColor(),
          whatColorPickerShows: whatColorPickerShows,
          onChosen: (input?: Dynamic) =>
            onAct({
              kind: 'chooseColor',
              property: 'fillColor',
              color: input,
            }),
        }),
      }),
      jsx(PaneRow, {
        label: sheetMessages.textColor(),
        children: jsx(RuleColorChooser, {
          property: 'textColor',
          color: textColor,
          otherColor: fillColor,
          shade: 600,
          form: 'field',
          name: colorButtonLabel('textColor', textColor),
          nameOfPicker: sheetMessages.textColor(),
          whatColorPickerShows: whatColorPickerShows,
          onChosen: (input?: Dynamic) =>
            onAct({
              kind: 'chooseColor',
              property: 'textColor',
              color: input,
            }),
        }),
      }),
      jsx(PaneRow, {
        label: CONDITIONAL_FORMATTING_WORDS.style(),
        children: jsx('span', {
          className: 'flex items-center gap-0.5',
          children: jsx(TooltipGroup, {
            children: RULE_TEXT_STYLES.map(
              (input?: Dynamic) =>
                jsx(
                  Button,
                  {
                    variant: 'ghost',
                    iconOnly: true,
                    icon: TEXT_TOGGLE_ICONS[input].icon,
                    'aria-label': textStyleLabel(input),
                    pressed: isFontStyleOn(format, input),
                    onClick: () =>
                      onAct({
                        kind: 'toggleStyle',
                        style: input,
                      }),
                  },
                  input,
                ),
            ),
          }),
        }),
      }),
    ],
  });
}
export function ColorScaleRamp({ colors: colors }: Dynamic) {
  let rampFills = colorScaleStripes(colors, COLOR_SCALE_RAMP_STEPS).flatMap(({ fill: fill }: Dynamic) => fill ?? []);
  let rampGradient = (paint?: Dynamic) =>
    `linear-gradient(90deg,${rampFills.map((input?: Dynamic) => input[paint]).join(',')})`;
  let rampStyle = {
    '--sheet-run-on-light': rampGradient('onLight'),
    '--sheet-run-on-dark': rampGradient('onDark'),
  };
  return jsx('span', {
    'aria-hidden': true,
    className: 'sheet-rule-sample sheet-color-scale-ramp sheet-color-scale-run',
    style: rampStyle,
  });
}
export function ColorScaleStopFields({
  which: which,
  stop: stop,
  isOfDates: isOfDates,
  whatColorPickerShows: whatColorPickerShows,
  onAct: onAct,
}: Dynamic) {
  let stopFieldId = React.useId();
  let stopColor = stop?.color ?? NO_COLOR;
  let stopAt = stop?.at ?? null;
  let stopName = (input?: Dynamic) => scaleAnchorKindLabel(input, which, isOfDates);
  return jsxs(Fragment, {
    children: [
      jsx(PaneRow, {
        label: scaleStopLabel(which),
        trailing: jsx(RuleColorChooser, {
          property: 'fillColor',
          color: stopColor,
          otherColor: NO_COLOR,
          shade: SCALE_STOP_SWATCH_SHADE,
          form: 'swatch',
          name: scaleStopControlLabel(which, colorButtonLabel('fillColor', stopColor)),
          nameOfPicker: scaleStopControlLabel(which, sheetMessages.cellColor()),
          isOff: stop === undefined,
          whatColorPickerShows: whatColorPickerShows,
          onChosen: (input?: Dynamic) =>
            onAct({
              kind: 'chooseStopColor',
              stop: which,
              color: input,
            }),
        }),
        children: jsx(PaneSelect, {
          name: scaleStopControlLabel(which, stop === undefined ? CONDITIONAL_FORMATTING_WORDS.noMiddle() : stopName(stop.choice)),
          value: stop?.choice ?? NO_MIDDLE_STOP_VALUE,
          items: [
            ...(which === 'middle'
              ? [
                  {
                    value: NO_MIDDLE_STOP_VALUE,
                    label: CONDITIONAL_FORMATTING_WORDS.noMiddle(),
                  },
                ]
              : []),
            ...(stop?.choices ?? [DEFAULT_SCALE_ANCHOR_CHOICE]).map(
              (input?: Dynamic) => ({
                value: input,
                label: stopName(input),
              }),
            ),
          ],
          onChange: (input?: Dynamic) =>
            onAct(
              input === NO_MIDDLE_STOP_VALUE || stop === undefined
                ? {
                    kind: 'setMiddleStop',
                    isOn: input !== NO_MIDDLE_STOP_VALUE,
                  }
                : {
                    kind: 'chooseAnchor',
                    stop: which,
                    choice: input,
                  },
            ),
        }),
      }),
      stopAt !== null &&
        jsx(PaneRow, {
          label: '',
          trailing: null,
          children:
            stopAt.kind === 'day'
              ? jsx(SheetDateInput, {
                  'aria-label': scaleStopControlLabel(which, CONDITIONAL_FORMATTING_WORDS.value()),
                  className: 'min-w-0 flex-1',
                  value: stopAt.day,
                  onValueCommitted: (input?: Dynamic) => {
                    if (input !== null)
                      onAct({
                        kind: 'chooseStopDay',
                        stop: which,
                        day: input,
                      });
                  },
                })
              : jsx(RuleTextField, {
                  box: stopAt,
                  name: scaleStopControlLabel(which, CONDITIONAL_FORMATTING_WORDS.value()),
                  whyNotSaidBy: stopFieldId,
                  ...(stop?.choice === 'percentile' && {
                    isOfDigits: true,
                  }),
                  onAct: onAct,
                }),
        }),
      jsx(RuleFieldRefusal, {
        box: stopAt?.kind === 'typed' ? stopAt : null,
        id: stopFieldId,
        children: CONDITIONAL_FORMATTING_WORDS.enterANumber(),
      }),
    ],
  });
}
export function ConditionalRuleEditor({ editor: editor, whatColorPickerShows: whatColorPickerShows, onAct: onAct }: Dynamic) {
  let { cells: cells, cellsPickedByPage: cellsPickedByPage, does: does, matches: matches, outOf: outOf } = editor;
  let rulesHeadingId = React.useId();
  let testsListRef = React.useRef(null);
  let removedTestRef = React.useRef(null);
  let removeTest = (test?: Dynamic, testIndex?: Dynamic) => {
    let testCount = does.kind === 'formatWhere' ? does.tests.length : 0;
    let openMenu = testsListRef.current?.ownerDocument.activeElement?.closest('[role="menu"]') ?? null;
    onAct(
      {
        kind: 'removeTest',
        test: test,
      },
      (isRemoved?: Dynamic) => {
        if (isRemoved)
          removedTestRef.current = {
            at: testIndex,
            outOf: testCount,
            menu: openMenu,
          };
      },
    );
  };
  React.useLayoutEffect(() => {
    let [removedTest, testsList] = [removedTestRef.current, testsListRef.current];
    if (removedTest === null) return;
    removedTestRef.current = null;
    if (testsList === null || testsList.children.length >= removedTest.outOf) return;
    let ownerDocument = testsList.ownerDocument;
    let isCaretLost =
      ownerDocument.hasFocus() &&
      (ownerDocument.activeElement === ownerDocument.body || removedTest.menu?.contains(ownerDocument.activeElement) === true);
    let nextRemoveButton =
      testsList.children[Math.min(removedTest.at, testsList.children.length - 1)]?.querySelector('button:not(:disabled)') ?? null;
    if (!isCaretLost || nextRemoveButton === null) return;
    nextRemoveButton.focus({
      preventScroll: true,
    });
    revealInSidePane(nextRemoveButton.closest('aside'), nextRemoveButton, true);
  });
  let addedTestRef = React.useRef(null);
  let isLastTestAwaitingComparison = does.kind === 'formatWhere' && does.tests.at(-1)?.choice === null;
  let focusAwaitedComparison = () => {
    let comparisonButton = testsListRef.current?.querySelector('[data-comparison-awaited]')?.querySelector('button');
    if (comparisonButton === null || comparisonButton === undefined) return;
    comparisonButton.focus({
      preventScroll: true,
    });
    revealInSidePane(comparisonButton.closest('aside'), comparisonButton, true);
  };
  React.useLayoutEffect(() => {
    let [addedTest, ownerDocument] = [addedTestRef.current, testsListRef.current?.ownerDocument];
    if (addedTest === null || ownerDocument === undefined) return;
    addedTestRef.current = null;
    let isCaretLost =
      ownerDocument.hasFocus() && (ownerDocument.activeElement === ownerDocument.body || ownerDocument.activeElement === addedTest.from);
    if (isLastTestAwaitingComparison && isCaretLost) focusAwaitedComparison();
  });
  let addTestButtonRef = React.useRef(null);
  let focusAddTestHandlers = useFocusRescue(
    () =>
      addTestButtonRef.current?.focus({
        preventScroll: true,
      }),
  );
  return jsxs(Fragment, {
    children: [
      jsx('div', {
        className: 'shrink-0 pt-md pb-xs',
        children: jsx(PaneRow, {
          children: jsx(SegmentedControl, {
            fullWidth: true,
            'aria-label': CONDITIONAL_FORMATTING_WORDS.kindOfRule(),
            value: does.kind,
            segments: [
              {
                value: 'formatWhere',
                label: CONDITIONAL_FORMATTING_WORDS.highlight(),
              },
              {
                value: 'colorScale',
                label: CONDITIONAL_FORMATTING_WORDS.colorScale(),
              },
            ],
            onChange: (input?: Dynamic) =>
              onAct({
                kind: 'chooseKindOfEffect',
                effect: input,
              }),
          }),
        }),
      }),
      jsxs(PaneSection, {
        title: CONDITIONAL_FORMATTING_WORDS.appliesTo(),
        className: 'border-t-0!',
        ...(matches !== null && {
          actions: jsx('span', {
            className: 'text-footnote text-secondary',
            children: ruleMatchCountWords(does.kind === 'formatWhere' && does.isWholeRow, matches, outOf),
          }),
        }),
        children: [
          jsx(PaneRow, {
            label: CONDITIONAL_FORMATTING_WORDS.cells(),
            children: jsx(RuleTextField, {
              box: cells,
              name: CONDITIONAL_FORMATTING_WORDS.cells(),
              whyNotSaidBy: rulesHeadingId,
              slotEnd: jsx(PaneTableButton, {
                name: CONDITIONAL_FORMATTING_WORDS.takeSelection(),
                onPressed: () =>
                  onAct({
                    kind: 'useSelection',
                  }),
              }),
              onAct: onAct,
            }),
          }),
          jsx(RuleFieldRefusal, {
            box: cells,
            id: rulesHeadingId,
            children: CONDITIONAL_FORMATTING_WORDS.enterCells(),
          }),
          cellsPickedByPage !== null &&
            jsx(PaneRowNote, {
              children: jsx(WordsWithColumnNames, {
                words: movedToNumbersWords(cellsPickedByPage.column),
              }),
            }),
        ],
      }),
      does.kind === 'formatWhere'
        ? jsxs(Fragment, {
            children: [
              jsx(PaneSection, {
                title: CONDITIONAL_FORMATTING_WORDS.conditions(),
                ...(does.canTestBeAdded && {
                  actions: jsx(Button, {
                    variant: 'ghost',
                    iconOnly: true,
                    icon: 'Add',
                    ref: addTestButtonRef,
                    'aria-label': CONDITIONAL_FORMATTING_WORDS.addCondition(),
                    className: '-me-2 text-secondary',
                    onClick: () => {
                      let caretBefore = testsListRef.current?.ownerDocument.activeElement ?? null;
                      if (isLastTestAwaitingComparison) focusAwaitedComparison();
                      else
                        onAct(
                          {
                            kind: 'addTest',
                          },
                          (isAdded?: Dynamic) => {
                            addedTestRef.current = isAdded
                              ? {
                                  from: caretBefore,
                                }
                              : null;
                          },
                        );
                    },
                  }),
                }),
                children: jsx('div', {
                  ref: testsListRef,
                  className: 'contents',
                  ...focusAddTestHandlers,
                  children: does.tests.map((test?: Dynamic) => {
                    let testKey = test.choice === null ? does.tests.length - 1 : test.index;
                    return jsx(
                      RuleConditionFields,
                      {
                        test: test,
                        isAlone: test.choice !== null && does.tests.filter(({ choice: choice }: Dynamic) => choice !== null).length === 1,
                        onAct: onAct,
                        onRemove: () => removeTest(test.index, testKey),
                      },
                      testKey,
                    );
                  }),
                }),
              }),
              jsx(RuleFormatSection, {
                does: does,
                whatColorPickerShows: whatColorPickerShows,
                onAct: onAct,
              }),
            ],
          })
        : jsxs(PaneSection, {
            title: CONDITIONAL_FORMATTING_WORDS.scale(),
            ...(!does.hasNumbersToColor && {
              above: CONDITIONAL_FORMATTING_WORDS.noNumbersToColor(),
            }),
            children: [
              jsx(PaneRow, {
                label: CONDITIONAL_FORMATTING_WORDS.preview(),
                children: jsx(ColorScaleRamp, {
                  colors: does.stops.map(({ color: color }: Dynamic) => color),
                }),
              }),
              ['lowest', 'middle', 'highest'].map(
                (which?: Dynamic) =>
                  jsx(
                    ColorScaleStopFields,
                    {
                      which: which,
                      stop: does.stops.find(({ stop: stop }: Dynamic) => stop === which),
                      isOfDates: does.stops.some(({ isOfDates: isOfDates }: Dynamic) => isOfDates),
                      whatColorPickerShows: whatColorPickerShows,
                      onAct: onAct,
                    },
                    which,
                  ),
              ),
            ],
          }),
    ],
  });
}
export const THIS_CELL_TESTED_VALUE = '';
export const NO_CONDITION_CHOSEN_VALUE = '';
export const ruleColorChoicesOfShade = (shade?: Dynamic) => [
  NO_COLOR,
  ...STANDARD_HUE_COLORS.filter((input?: Dynamic) => input.kind === 'standard' && input.shade === shade),
];
export const RULE_TEXT_STYLES = ['bold', 'italic', 'underline', 'strikethrough'];
export const COLOR_SCALE_RAMP_STEPS = 33;
export const NO_MIDDLE_STOP_VALUE = 'none';
export const DEFAULT_SCALE_ANCHOR_CHOICE = 'percentile';
export const SCALE_STOP_SWATCH_SHADE = 300;
