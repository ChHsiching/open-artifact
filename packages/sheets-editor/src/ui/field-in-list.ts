import { menuItemVariants } from '../kit/menu.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { isInListUnderCell } from './list-under-cell.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { CellChip } from '../grid/cell-drawing.ts';
import { LiveAnnouncer } from './live-announcer.ts';
export function fieldInListKeyAction(
  key: Dynamic,
  { isOfInputMethod: isOfInputMethod, isForNew: isForNew, isBlank: isBlank, isHeldDown: isHeldDown }: Dynamic,
) {
  if (isOfInputMethod) return 'leftToText';
  if (isHeldDown && (key === 'Escape' || key === 'Tab' || key === 'Enter')) return 'nothing';
  if (key === 'Escape') return 'dropAndLeave';
  if (key === 'Tab') return 'enterAndLeave';
  if (key === 'Enter') return isForNew && !isBlank ? 'enterAndStay' : 'enterAndLeave';
  return 'leftToText';
}
export function fieldInListEntryOutcome(
  typed: Dynamic,
  { atRest: atRest, onItsWay: onItsWay, dealtWith: dealtWith, refusal: refusal }: Dynamic,
) {
  if (typed === atRest || typed === onItsWay || typed === dealtWith) return 'nothingTyped';
  if (typed.trim() === '') return 'restored';
  return refusal === null ? 'entered' : 'refused';
}
export function fieldInListBlurAction(isChip?: Dynamic, isCaretGoneNowhere?: Dynamic) {
  if (isChip) return 'entersAndEnds';
  return isCaretGoneNowhere ? 'nothing' : 'saysCaretHasGone';
}
export function fieldTextAfterEntry({ shown: shown, entered: entered, value: value, isThere: isThere, isForNew: isForNew }: Dynamic) {
  if (isForNew) return !isThere && shown === '' ? entered : shown;
  return shown === entered ? value : shown;
}
export function fieldInListAfterListChange(
  typed: Dynamic,
  { isFieldGone: isFieldGone, isCaretOnBody: isCaretOnBody, isListShutting: isListShutting }: Dynamic,
) {
  if (!(isFieldGone && isCaretOnBody) && !isListShutting) return 'staysAsItIs';
  return typed === null ? 'caretGoesBack' : 'textIsEnteredAndCaretGoesBack';
}
export function FieldInList({
  name: name,
  value: value,
  placeholder: placeholder,
  lead: lead,
  asTyped: asTyped,
  namesPasted: namesPasted,
  whyRefused: whyRefused,
  onEntered: onEntered,
  isForNew: isForNew,
  asChip: asChip,
  doesPressDropText: doesPressDropText,
  doesPressAskForNext: doesPressAskForNext,
  timesAsked: timesAsked,
  onOverWithoutKey: onOverWithoutKey,
  onLeftByKey: onLeftByKey,
  onCaretChange: onCaretChange,
  onTypedChange: onTypedChange,
}: Dynamic) {
  let [typed, setTyped] = React.useState(value);
  let [onItsWay, setOnItsWay] = React.useState(null);
  let [lastValue, setLastValue] = React.useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (typed === lastValue) setTyped(value);
  }
  let valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  });
  let [isFocused, setIsFocused] = React.useState(false);
  let [refusal, setRefusal] = React.useState(null);
  let refusalShown =
    refusal === null
      ? null
      : {
          words: whyRefused(refusal.text),
          isDrawn: refusal.isDrawn,
        };
  let atRest = isForNew === true ? '' : value;
  let isTypedChanged = typed !== atRest && typed !== onItsWay;
  let handlersRef = React.useRef({
    enter: () => true,
    doesPressDropText: doesPressDropText,
    doesPressAskForNext: doesPressAskForNext,
    endWithoutKey: () => {},
  });
  let isChip = asChip !== undefined;
  let dealtWithRef = React.useRef(null);
  let enterNames = (names?: Dynamic) => {
    let [firstName] = names;
    let typedBefore = typed;
    dealtWithRef.current = typedBefore;
    onTypedChange(null);
    setOnItsWay(firstName);
    if (isForNew === true) setTyped('');
    onEntered(names, (isThere?: Dynamic) => {
      setOnItsWay((input?: Dynamic) => (input === firstName ? null : input));
      setTyped(
        (input?: Dynamic) =>
          fieldTextAfterEntry({
            shown: input,
            entered: firstName,
            value: valueRef.current,
            isThere: isThere,
            isForNew: isForNew === true,
          }),
      );
      if (isThere) return;
      if (dealtWithRef.current === typedBefore) dealtWithRef.current = null;
      setRefusal({
        text: firstName,
        isDrawn: true,
      });
    });
  };
  let enterTyped = (how?: Dynamic) => {
    let outcome = fieldInListEntryOutcome(typed, {
      atRest: atRest,
      onItsWay: onItsWay,
      dealtWith: dealtWithRef.current,
      refusal: whyRefused(typed),
    });
    if (outcome === 'restored' || (outcome === 'refused' && how === 'press')) setTyped(atRest);
    if (outcome === 'refused')
      setRefusal({
        text: typed,
        isDrawn: how === 'key',
      });
    if (outcome === 'entered') enterNames([typed]);
    return outcome !== 'refused';
  };
  let isEndedRef = React.useRef(false);
  let endWithoutKey = () => {
    if (isEndedRef.current) return;
    isEndedRef.current = true;
    onOverWithoutKey?.();
  };
  let leaveByKey = () => {
    isEndedRef.current = true;
    onLeftByKey();
  };
  let typedToOffer = isTypedChanged && typed.trim() !== '' && whyRefused(typed) === null ? typed : null;
  React.useEffect(() => onTypedChange(typedToOffer), [typedToOffer, onTypedChange]);
  let rowRef = React.useRef(null);
  let inputRef = React.useRef(null);
  React.useEffect(() => {
    handlersRef.current = {
      enter: enterTyped,
      doesPressDropText: doesPressDropText,
      doesPressAskForNext: doesPressAskForNext,
      endWithoutKey: endWithoutKey,
    };
  });
  React.useEffect(() => {
    let fieldDocument = inputRef.current?.ownerDocument;
    if (!isFocused || (!isTypedChanged && !isChip) || fieldDocument === undefined) return;
    let whereIsPress = (pressTarget?: Dynamic) => {
      if (!(pressTarget instanceof Element)) return 'elsewhere';
      if (rowRef.current?.contains(pressTarget) === true) return 'ownRow';
      if (!isInListUnderCell(pressTarget) || pressTarget.closest(`[${ROW_OF_FIELD_IN_LIST_ATTRIBUTE}]`) !== null) return 'elsewhere';
      let rowOrButton = pressTarget.closest(LIST_ROW_OR_BUTTON_SELECTOR);
      if (rowOrButton === null) return 'restOfListOrCard';
      if (handlersRef.current.doesPressAskForNext?.(rowOrButton) === true) return 'rowThatAsksForNext';
      return handlersRef.current.doesPressDropText?.(rowOrButton) === true ? 'rowThatDropsText' : 'rowOrButton';
    };
    let onPressOutside = ({ type: type, target: target }: Dynamic) => {
      let pressedWhere = whereIsPress(target);
      if (pressedWhere === 'rowThatDropsText' && type === 'click') onTypedChange(null);
      if (!doesPressEnterFieldInList(pressedWhere, type === 'click' ? 'click' : 'pointerdown')) return;
      handlersRef.current.enter(isPressThatEndsField(pressedWhere) ? 'press' : 'key');
      if (isPressThatEndsField(pressedWhere)) handlersRef.current.endWithoutKey();
    };
    fieldDocument.addEventListener('pointerdown', onPressOutside, true);
    fieldDocument.addEventListener('click', onPressOutside, true);
    return () => {
      fieldDocument.removeEventListener('pointerdown', onPressOutside, true);
      fieldDocument.removeEventListener('click', onPressOutside, true);
    };
  }, [isFocused, isTypedChanged, isChip, onTypedChange]);
  React.useLayoutEffect(() => {
    if (timesAsked === undefined) return;
    let sheetFrame = inputRef.current?.closest('[data-presentation="sheet"]') ?? null;
    inputRef.current?.focus({
      preventScroll: sheetFrame === null,
    });
  }, [timesAsked]);
  let typeText = (text?: Dynamic) => {
    dealtWithRef.current = null;
    setTyped(asTyped(text));
    setRefusal(null);
  };
  let onKeyDownInField = (event?: Dynamic) => {
    event.stopPropagation();
    let isOfInputMethod = event.nativeEvent.isComposing || event.keyCode === 229;
    let keyAction = fieldInListKeyAction(event.key, {
      isOfInputMethod: isOfInputMethod,
      isForNew: isForNew === true,
      isBlank: typed.trim() === '',
      isHeldDown: event.repeat,
    });
    if (keyAction === 'leftToText') return;
    event.preventDefault();
    if (keyAction === 'nothing') return;
    if (keyAction === 'dropAndLeave') {
      dealtWithRef.current = typed;
      setTyped(atRest);
      setRefusal(null);
      onTypedChange(null);
      leaveByKey();
    } else if (enterTyped('key') && keyAction === 'enterAndLeave') leaveByKey();
  };
  let onPasteInField = (event?: Dynamic) => {
    let [firstName, ...otherNames] = namesPasted(event.clipboardData);
    if (firstName === undefined || otherNames.length === 0) return;
    event.preventDefault();
    let { value: fieldText, selectionStart: selectionStart, selectionEnd: selectionEnd } = event.currentTarget;
    let [textBefore, textAfter] = [
      fieldText.slice(0, selectionStart ?? fieldText.length),
      fieldText.slice(selectionEnd ?? fieldText.length),
    ];
    if (isForNew === true) enterNames([asTyped(textBefore + firstName + textAfter), ...otherNames]);
    else typeText(textBefore + [firstName, ...otherNames].join(' ') + textAfter);
  };
  let wasUnfocusedAtPressRef = React.useRef(false);
  let inputElement = jsx('input', {
    ref: inputRef,
    ...{
      [FIELD_IN_LIST_ATTRIBUTE]: '',
    },
    tabIndex: -1,
    'aria-label': name,
    'aria-invalid': (refusalShown?.isDrawn === true && refusalShown.words !== null) || undefined,
    placeholder: placeholder,
    value: typed,
    spellCheck: false,
    autoComplete: 'off',
    autoCorrect: 'off',
    ...(asChip === undefined ? FIELD_INPUT_PROPS : FIELD_INPUT_OVER_CHIP_PROPS),
    onChange: (input?: Dynamic) => typeText(input.target.value),
    onPaste: onPasteInField,
    onFocus: ({ currentTarget: currentTarget }: Dynamic) => {
      isEndedRef.current = false;
      setIsFocused(true);
      onCaretChange(true, currentTarget);
    },
    onBlur: ({ relatedTarget: relatedTarget, currentTarget: currentTarget }: Dynamic) => {
      setIsFocused(false);
      let blurAction = fieldInListBlurAction(isChip, relatedTarget === null);
      if (blurAction === 'nothing') return;
      if (blurAction === 'saysCaretHasGone') return onCaretChange(false, currentTarget);
      enterTyped('press');
      onCaretChange(false, currentTarget);
      return endWithoutKey();
    },
    onMouseDown: stopFieldEventPropagation,
    onPointerDown: stopFieldEventPropagation,
    onPointerDownCapture: (event?: Dynamic) => {
      wasUnfocusedAtPressRef.current = event.currentTarget.ownerDocument.activeElement !== event.currentTarget;
    },
    onClick: (event?: Dynamic) => {
      stopFieldEventPropagation(event);
      let { selectionStart: selectionStart, selectionEnd: selectionEnd } = event.currentTarget;
      if (wasUnfocusedAtPressRef.current && selectionStart === selectionEnd) event.currentTarget.select();
      wasUnfocusedAtPressRef.current = false;
    },
    onKeyDown: onKeyDownInField,
    onKeyUp: stopFieldEventPropagation,
  });
  return jsx('div', {
    ref: rowRef,
    ...{
      [ROW_OF_FIELD_IN_LIST_ATTRIBUTE]: '',
    },
    className: asChip === undefined ? FIELD_ROW_CLASSES : FIELD_CHIP_ROW_CLASSES,
    'data-highlighted': (asChip !== undefined && isFocused) || undefined,
    children: jsxs('div', {
      className: 'flex min-w-0 flex-1 flex-col',
      children: [
        jsxs('label', {
          className: 'flex min-w-0 cursor-text items-center gap-xs',
          children: [
            lead,
            asChip === undefined
              ? inputElement
              : jsx('span', {
                  ...(asChip(typed).isPillDrawn ? FIELD_CHIP_PILL_PROPS : FIELD_CHIP_PLAIN_PROPS),
                  children: jsx(CellChip, {
                    optionPaints: asChip(typed).paints,
                    children: jsxs('span', {
                      className: 'relative block min-w-[1ch] max-w-full overflow-hidden whitespace-pre',
                      children: [
                        jsx('span', {
                          'aria-hidden': true,
                          ...FIELD_TEXT_COPY_PROPS,
                          children: typed === '' ? (placeholder ?? ' ') : typed,
                        }),
                        inputElement,
                      ],
                    }),
                  }),
                }),
          ],
        }),
        refusalShown?.isDrawn === true &&
          refusalShown.words !== null &&
          jsx('p', {
            'aria-hidden': true,
            className: 'pt-0.5 text-footnote text-danger',
            children: refusalShown.words,
          }),
        jsx(LiveAnnouncer, {
          words: refusalShown?.words,
        }),
      ],
    }),
  });
}
export const doesPressEnterFieldInList = (input?: Dynamic, options?: Dynamic) =>
  input === 'elsewhere' ? options === 'pointerdown' : (input === 'rowOrButton' || input === 'rowThatAsksForNext') && options === 'click';
export const isPressThatEndsField = (input?: Dynamic) => input !== 'rowThatAsksForNext';
export const FIELD_IN_LIST_ATTRIBUTE = 'data-field-in-list';
export const isFieldInList = (input?: Dynamic) => input instanceof Element && input.hasAttribute(FIELD_IN_LIST_ATTRIBUTE);
export const ROW_OF_FIELD_IN_LIST_ATTRIBUTE = 'data-row-of-field-in-list';
export const FIELD_ROW_CLASSES = menuItemVariants({
  className: 'cursor-text hover:bg-fill-ghost-hover focus-within:bg-transparent focus-within:hover:bg-transparent',
});
export const FIELD_INPUT_PROPS = {
  className: 'min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-primary focus:placeholder:text-muted',
};
export const FIELD_INPUT_OVER_CHIP_PROPS = {
  className: 'absolute inset-0 w-full bg-transparent p-0 font-[inherit] text-[length:inherit] text-inherit outline-none placeholder:text-secondary',
};
export const FIELD_TEXT_COPY_PROPS = {
  className: 'sheet-copy-of-field-text invisible',
};
export const FIELD_CHIP_PILL_PROPS = {
  className: 'flex min-w-0 flex-1',
};
export const FIELD_CHIP_PLAIN_PROPS = {
  className: `${FIELD_CHIP_PILL_PROPS.className} [&>.sheet-chip]:bg-transparent! [&>.sheet-chip]:text-primary!`,
};
export const LIST_ROW_OR_BUTTON_SELECTOR = '[role="option"], button';
export const FIELD_CHIP_ROW_CLASSES = menuItemVariants({
  className: 'cursor-text',
});
export const stopFieldEventPropagation = (input?: Dynamic) => input.stopPropagation();
