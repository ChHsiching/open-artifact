import { Button } from '../../kit/button.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { areWaysInShown, subscribeWaysInShown } from './ways-in-shown.ts';
import { subscribeBottomInsets, getBottomSafeAreaInset } from '../../shell/bottom-insets.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { MAX_DECIMAL_PLACES } from '../../format/number-format-choices.ts';
import { decimalPlacesLimitText } from '../../i18n/grid-action-labels.ts';
import { useBarIcon } from '../bar-buttons.ts';
import { jsx } from 'react/jsx-runtime';
import { ToolbarTooltip } from '../toolbar-tooltip.ts';
import { describeWhyNot } from '../why-not.ts';
import { isRepeatedEnterOrSpace } from '../repeated-key-guards.ts';
export function useBarTooltipSide() {
  let [side, setSide] = React.useState(barTooltipSide);
  React.useEffect(() => {
    let update = () => React.startTransition(() => setSide(barTooltipSide()));
    update();
    let stopWaysIn = subscribeWaysInShown(update);
    let stopListening = subscribeBottomInsets(update);
    return () => {
      stopWaysIn();
      stopListening();
    };
  }, []);
  return side;
}
export function whyNoDecimalStep(step: Dynamic, { more: more, fewer: fewer, whyNeither: whyNeither }: Dynamic) {
  switch (whyNeither) {
    case 'noNumbers':
      return sheetMessages.decimalPlacesOfNoNumbers();
    case 'formatsDiffer':
      return sheetMessages.decimalPlacesOfFormatsThatDiffer();
    case 'dropdownOrCheckbox':
      return sheetMessages.decimalPlacesOfDropdownsAndCheckboxes();
    case 'formatHasNone':
      return sheetMessages.decimalPlacesOfFormatWithNone();
    case null:
  }
  if (more === null && fewer === null) return null;
  if (step === 'fewer' && more?.count === 1) return sheetMessages.noDecimalPlacesToRemove();
  if (step === 'more' && fewer !== null && fewer.count >= MAX_DECIMAL_PLACES - 1) return decimalPlacesLimitText(MAX_DECIMAL_PLACES);
  return sheetMessages.decimalPlacesOfFormatWithNone();
}
export function DecimalPlacesButton({
  step: step,
  decimalPlaces: decimalPlaces,
  whyNoToolForCells: whyNoToolForCells,
  onChosen: onChosen,
}: Dynamic) {
  let side = useBarTooltipSide();
  let barIcon = useBarIcon();
  let name = step === 'more' ? sheetMessages.increaseDecimalPlaces() : sheetMessages.decreaseDecimalPlaces();
  let isShut = whyNoToolForCells !== null || decimalPlaces[step] === null;
  return jsx(ToolbarTooltip, {
    name: name,
    side: side,
    isShut: isShut,
    children: jsx(Button, {
      variant: 'ghost',
      iconOnly: true,
      icon: barIcon(DECIMAL_STEP_ICONS[step]),
      'aria-label': name,
      tooltip: false,
      disabled: isShut,
      disabledReason: describeWhyNot(name, whyNoToolForCells ?? whyNoDecimalStep(step, decimalPlaces)) ?? name,
      disabledReasonSide: side,
      onKeyDown: (event?: Dynamic) => {
        if (isRepeatedEnterOrSpace(event)) event.preventDefault();
      },
      onClick: () =>
        onChosen({
          stepOfDecimalPlaces: step,
        }),
    }),
  });
}
export const barTooltipSide = () => (getBottomSafeAreaInset() > 0 || areWaysInShown() ? 'bottom' : 'top');
export const DECIMAL_STEP_ICONS = {
  fewer: 'DecimalsFewer',
  more: 'DecimalsMore',
};
