import { FieldRoot } from '../kit/field.tsx';
import { TextInput } from '../kit/text-input.tsx';
import { CheckboxMark } from '../kit/checkbox.tsx';
import { Combobox } from '../kit/combobox.tsx';
import { Popover } from '../kit/popover.tsx';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { inputsOfFilterChoice, isIsoDateText } from './own-filter-conditions.ts';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { PaneSelect } from '../ui/side-pane/side-pane.ts';
import { controlWithChoiceLabel, CONDITIONAL_FORMATTING_WORDS, ruleColumnName } from '../messages/conditional-format.ts';
import {
  filterChoiceLabel,
  filterMessages,
  wholeNumberRangeHint,
  describeFilterLineAlternatives,
  removeFilterLineLabel,
  describeFilterCondition,
  conditionJoinHint,
  changeConditionLabel,
  readyFilterLabel,
  rowsInViewOfAllText,
  filterByColumnLabel,
  searchOrFilterColumnLabel,
} from './filter-messages.ts';
import { SheetDateInput } from '../chips/date-input.ts';
import { isElementFocused } from './own-filter-bar-view.ts';
import { joinMessageParts } from '../i18n/messages.ts';
import { WordsWithColumnNames } from '../ui/card-rows.ts';
import { ARROW_STOP_ATTRIBUTES, labelWithCount, AskOrPickList, askListFoundSaid } from '../ui/ask-list/ask-or-pick-list.ts';
import { MAX_FILTER_CONDITIONS } from './filter-model.ts';
import { CellChip } from '../grid/cell-drawing.ts';
import { sortByColumnLabel, sortDirectionWords, filterViewChoiceLabel, rowCountWords, sortAndFilterMessages } from './sort-filter-labels.ts';
import { MOST_CHARACTERS_OF_WORDS } from '../words/vocabulary.ts';
import { TABLE_CARD_WIDTH } from './hung-card-place.ts';
import { usePopupGivenUpOnBlur } from '../ui/popup-given-up-on-blur.ts';
import { usePopupFieldFocus } from '../ui/popup-field-focus.ts';
import { isOnPhone, useTouchBelowSm } from '../app/media-queries.ts';
import { useBottomInsetWhileOpen, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { wrapTabFocusInBar } from '../ui/dom-events.ts';
export function OwnFilterConditionEditor({
  condition: condition,
  list: { choices: choices, isOfDays: isOfDays, mostCounted: mostCounted },
  box: box,
  x: removeButton,
  onAct: onAct,
  onChanged: onChanged,
  onDone: onDone,
}: Dynamic) {
  let [held, setHeld] = React.useState(condition.held);
  let editorRef = React.useRef(null);
  let mistypedNoteId = React.useId();
  let changeHeld = (nextHeld?: Dynamic) => {
    setHeld(nextHeld);
    onChanged();
    onAct({
      kind: 'changeCondition',
      key: condition.key,
      held: nextHeld,
    });
  };
  let fieldKinds = inputsOfFilterChoice(held.choice, isOfDays);
  let areFieldsFilled = fieldKinds.every(
    (fieldKind?: Dynamic, fieldIndex?: Dynamic) => (fieldIndex === 0 ? held.first : held.second).trim() !== '',
  );
  let choicesShown = choices.includes(held.choice) ? choices : [held.choice, ...choices];
  return jsxs('div', {
    ref: (element?: Dynamic) => {
      editorRef.current = element;
      box(element);
    },
    className: 'flex shrink-0 items-start ps-md',
    children: [
      jsxs('div', {
        className: '-ms-[var(--ui-gap-xs)] flex min-w-0 flex-1 flex-wrap items-center gap-x-xs',
        children: [
          jsx('div', {
            className: 'flex max-w-full flex-none',
            children: jsx(PaneSelect, {
              isFlush: true,
              isSamePickTold: true,
              name: controlWithChoiceLabel(CONDITIONAL_FORMATTING_WORDS.condition(), filterChoiceLabel(held.choice, isOfDays)),
              value: held.choice,
              items: choicesShown.map(
                (choice?: Dynamic) => ({
                  value: choice,
                  label: filterChoiceLabel(choice, isOfDays),
                }),
              ),
              onChange: (choice?: Dynamic) => {
                let needsNoFields = inputsOfFilterChoice(choice, isOfDays).length === 0;
                if (choice !== held.choice)
                  changeHeld({
                    ...held,
                    choice: choice,
                  });
                if (needsNoFields && editorRef.current !== null)
                  onDone(
                    {
                      ...held,
                      choice: choice,
                    },
                    editorRef.current,
                  );
              },
            }),
          }),
          fieldKinds.map((fieldKind?: Dynamic, fieldIndex?: Dynamic) => {
            let heldSide = fieldIndex === 0 ? 'first' : 'second';
            let fieldLabel =
              fieldKinds.length === 1 ? CONDITIONAL_FORMATTING_WORDS.value() : fieldIndex === 0 ? filterMessages.from() : filterMessages.to();
            return jsx(
              'div',
              {
                className: `min-w-0 ${fieldKind === 'day' ? 'flex-[1_1_7.5rem]' : fieldKind === 'text' ? 'flex-[1_1_5rem]' : 'flex-[1_1_4rem]'}`,
                children:
                  fieldKind === 'day'
                    ? jsx(SheetDateInput, {
                        'aria-label': fieldLabel,
                        size: 'sm',
                        className: UNDERLINED_FIELD_PROPS.className,
                        value: isIsoDateText(held[heldSide]) ? held[heldSide] : null,
                        onValueCommitted: (day?: Dynamic) =>
                          changeHeld({
                            ...held,
                            [heldSide]: day ?? '',
                          }),
                      })
                    : jsx(FieldRoot, {
                        invalid: condition.isMistyped[fieldIndex] === true,
                        children: jsx(TextInput, {
                          fullWidth: true,
                          'aria-label': fieldLabel,
                          'aria-describedby': condition.isMistyped[fieldIndex] === true ? mistypedNoteId : undefined,
                          placeholder: fieldLabel,
                          inputMode: fieldKind === 'count' ? 'numeric' : undefined,
                          autoCapitalize: 'off',
                          autoCorrect: 'off',
                          className: `${COARSE_POINTER_TALL_CLASS} ${UNDERLINED_FIELD_PROPS.className}`,
                          value: held[heldSide],
                          onChange: ({ currentTarget: currentTarget }: Dynamic) =>
                            changeHeld({
                              ...held,
                              [heldSide]: currentTarget.value,
                            }),
                          onKeyDown: (keyEvent?: Dynamic) => {
                            let isComposing = keyEvent.nativeEvent.isComposing || keyEvent.keyCode === 229;
                            if (keyEvent.key !== 'Enter' || isComposing || !areFieldsFilled) return;
                            keyEvent.preventDefault();
                            onDone(held, keyEvent.currentTarget);
                          },
                        }),
                      }),
              },
              heldSide,
            );
          }),
          condition.isMistyped.includes(true) &&
            jsx('p', {
              id: mistypedNoteId,
              className: 'basis-full pb-1 text-caption leading-snug text-danger',
              children: fieldKinds.includes('count') ? wholeNumberRangeHint(mostCounted) : CONDITIONAL_FORMATTING_WORDS.enterANumber(),
            }),
        ],
      }),
      removeButton,
    ],
  });
}
export function OwnFilterConditionControls({ list: list, onAct: onAct }: Dynamic) {
  let [editingKey, setEditingKey] = React.useState(null);
  let [heldAtDone, setHeldAtDone] = React.useState(null);
  let focusToMoveRef = React.useRef(null);
  let noteFocusToMove = (key: Dynamic, isOpen: Dynamic, { ownerDocument: ownerDocument }: Dynamic) => {
    focusToMoveRef.current = {
      key: key,
      isOpen: isOpen,
      from: ownerDocument.activeElement,
    };
  };
  let takeFocusWhenShown =
    (key?: Dynamic, isOpen?: Dynamic) =>
    (element?: Dynamic) => {
      let owed = focusToMoveRef.current;
      if (element === null || owed?.key !== key || owed.isOpen !== isOpen) return;
      focusToMoveRef.current = null;
      if (isFocusStillNear(element, owed.from)) element.querySelector('button')?.focus();
    };
  let hasChoices = list.choices.length > 0;
  let addConditionRef = React.useRef(null);
  let focusAddWhenShownRef = React.useRef(false);
  let pressedRemoveRef = React.useRef(null);
  let removeButtonRef = React.useCallback(
    (button?: Dynamic) =>
      () => {
        if (pressedRemoveRef.current !== button) return;
        pressedRemoveRef.current = null;
        if (!isElementFocused(button)) return;
        if (addConditionRef.current !== null) addConditionRef.current.focus();
        else if (hasChoices) focusAddWhenShownRef.current = true;
        else button.closest('[role="dialog"]')?.querySelector('input')?.focus();
      },
    [hasChoices],
  );
  let addConditionButtonRef = React.useCallback((button?: Dynamic) => {
    addConditionRef.current = button;
    if (button === null) return;
    if (focusAddWhenShownRef.current && isFocusStillNear(button, null)) button.focus();
    focusAddWhenShownRef.current = false;
  }, []);
  let renderRemoveButton = (label?: Dynamic, action?: Dynamic) =>
    jsx('span', {
      className: 'flex h-control flex-none items-center ps-xs pe-md pointer-coarse:h-10',
      children: jsx(Button, {
        ref: removeButtonRef,
        variant: 'ghost',
        size: 'xs',
        iconOnly: true,
        icon: 'X',
        flush: 'end',
        'aria-label': label,
        className: 'text-secondary',
        onClick: ({ currentTarget: currentTarget }: Dynamic) => {
          pressedRemoveRef.current = currentTarget;
          onAct(action);
        },
      }),
    });
  let { conditions: conditions, join: join } = list;
  return jsxs(Fragment, {
    children: [
      list.otherLines.map(({ lineIndex: lineIndex, line: line }: Dynamic) => {
        let lineWords = describeFilterLineAlternatives(line);
        return jsxs(
          'div',
          {
            className: 'flex shrink-0 items-center ps-md',
            children: [
              jsx('span', {
                className: 'min-w-0 flex-1 truncate text-body',
                title: joinMessageParts(lineWords),
                children: jsx(WordsWithColumnNames, {
                  words: lineWords,
                }),
              }),
              renderRemoveButton(removeFilterLineLabel(joinMessageParts(lineWords)), {
                kind: 'removeLine',
                lineIndex: lineIndex,
              }),
            ],
          },
          lineIndex,
        );
      }),
      conditions.map((condition?: Dynamic, conditionIndex?: Dynamic) => {
        let { key: conditionKey, held: conditionHeld, said: said } = condition;
        let saidText = said === null ? null : describeFilterCondition(said);
        let removeButton = renderRemoveButton(saidText === null ? filterMessages.removeCondition() : removeFilterLineLabel(saidText), {
          kind: 'removeCondition',
          key: conditionKey,
        });
        return jsxs(
          React.Fragment,
          {
            children: [
              conditionIndex > 0 &&
                jsx('div', {
                  className: 'flex shrink-0 ps-md',
                  children: jsx(Button, {
                    variant: 'ghost',
                    size: 'xs',
                    flush: 'start',
                    className: 'text-secondary pointer-coarse:h-10',
                    'aria-label': conditionJoinHint(join),
                    onClick: () =>
                      onAct({
                        kind: 'joinConditions',
                        by: join === 'and' ? 'or' : 'and',
                      }),
                    children: join === 'and' ? filterMessages.and() : filterMessages.or(),
                  }),
                }),
              saidText === null || (conditionKey === editingKey && !isSameHeldCondition(conditionHeld, heldAtDone))
                ? jsx(OwnFilterConditionEditor, {
                    condition: condition,
                    list: list,
                    box: takeFocusWhenShown(conditionKey, true),
                    x: removeButton,
                    onAct: onAct,
                    onChanged: () => {
                      focusToMoveRef.current = null;
                      setHeldAtDone(null);
                      setEditingKey(conditionKey);
                    },
                    onDone: (doneHeld?: Dynamic, doneFrom?: Dynamic) => {
                      noteFocusToMove(conditionKey, false, doneFrom);
                      setHeldAtDone(doneHeld);
                      setEditingKey(conditionKey);
                    },
                  })
                : jsxs('div', {
                    ref: takeFocusWhenShown(conditionKey, false),
                    className: 'flex shrink-0 items-center',
                    children: [
                      jsx(Combobox.FooterAction, {
                        ...ARROW_STOP_ATTRIBUTES,
                        className: `min-w-0 flex-1 ${FOCUS_SHADOW_CLASS}`,
                        'aria-label': changeConditionLabel(saidText),
                        onClick: ({ currentTarget: currentTarget }: Dynamic) => {
                          noteFocusToMove(conditionKey, true, currentTarget);
                          setHeldAtDone(null);
                          setEditingKey(conditionKey);
                        },
                        children: jsx('span', {
                          className: 'min-w-0 flex-1 truncate text-start',
                          title: saidText,
                          children: saidText,
                        }),
                      }),
                      removeButton,
                    ],
                  }),
            ],
          },
          conditionKey,
        );
      }),
      hasChoices &&
        conditions.length < MAX_FILTER_CONDITIONS &&
        jsxs(Combobox.FooterAction, {
          ref: addConditionButtonRef,
          ...ARROW_STOP_ATTRIBUTES,
          className: FOCUS_SHADOW_CLASS,
          onClick: ({ currentTarget: currentTarget }: Dynamic) => {
            let newKey = (Math.max as Dynamic)(-1, ...conditions.map((condition?: Dynamic) => condition.key)) + 1;
            noteFocusToMove(newKey, true, currentTarget);
            setHeldAtDone(null);
            setEditingKey(newKey);
            onAct({
              kind: 'addCondition',
              key: newKey,
            });
          },
          children: [
            jsx(Icon, {
              name: 'Add',
              size: 'md',
              className: 'flex-none',
            }),
            jsx('span', {
              className: 'min-w-0 flex-1 truncate text-start',
              children: filterMessages.addCondition(),
            }),
          ],
        }),
    ],
  });
}
export function filterValueRow(filterValue?: Dynamic) {
  let label = filterValueLabel(filterValue);
  return {
    id: `value ${filterValue.index}`,
    mark: listRowMarkSlot(
      jsx(CheckboxMark, {
        checked: filterValue.isTicked,
      }),
    ),
    isTicked: filterValue.isTicked,
    laysItselfOut: true,
    drawn:
      filterValue.optionPaints === null
        ? jsx('span', {
            className: `min-w-0 flex-1 truncate ${filterValue.text === null ? 'text-secondary' : ''}`,
            children: label,
          })
        : jsx('span', {
            className: 'sheet-own-filter-option flex-1',
            children: jsx(CellChip, {
              optionPaints: filterValue.optionPaints,
              children: label,
            }),
          }),
    atEnd: tabularCount(filterValue.records),
    inFull: label,
  };
}
export function OwnFilterListBody({ list: list, isColumnNamedAbove = false, onAct: onAct, onSort: onSort }: Dynamic) {
  let [typedWords, setTypedWords] = React.useState('');
  let pointedRowRef = React.useRef(null);
  let isTouchBelowSm2 = useTouchBelowSmAtOpen();
  let isSearching = typedWords.trim() !== '';
  let { answer: answer, values: values } = list;
  let hasConditionControls = list.choices.length > 0 || list.conditions.length > 0 || list.otherLines.length > 0;
  let sortRows =
    list.sort === null || onSort === null
      ? []
      : FILTER_LIST_SORT_DIRECTIONS.map((direction?: Dynamic) => {
          let sortKeys = list.sort?.keys ?? null;
          let sortWords = sortByColumnLabel({
            column: list.column,
            direction: direction,
            holds: sortKeys,
          });
          return {
            id: direction,
            words: sortWords,
            underHeading: sortDirectionWords(sortKeys, direction),
            drawn: sortWords,
            isChecked: list.sort?.inForce === direction,
            isOutOfUse: !list.canSortNow,
          };
        });
  let readyRows = list.ready.map(({ what: what, label: label, records: records }: Dynamic) => {
    let readyWords =
      what === 'mine'
        ? filterViewChoiceLabel({
            kind: what,
          })
        : what === 'allBut'
          ? filterViewChoiceLabel({
              kind: what,
              label: label ?? '',
            })
          : readyFilterLabel(what);
    let count = rowCountWords(records);
    return {
      id: what,
      words: readyWords,
      drawn: readyWords,
      atEnd: tabularCount(count),
      count: count,
    };
  });
  let searchedFor = typedWords.trim().toLowerCase();
  let readyMatches = (answer === null ? readyRows : []).filter(
    ({ words: words }: Dynamic) => words.toLowerCase().includes(searchedFor),
  );
  let sortMatches = sortRows.filter(
    ({ words: words, underHeading: underHeading }: Dynamic) =>
      searchedFor.length >= MIN_CHARACTERS_TO_MATCH_SORTS &&
      [underHeading, words].some((candidate?: Dynamic) => candidate.toLowerCase().startsWith(searchedFor)),
  );
  let foundRows = [...readyMatches, ...sortMatches];
  let answerWords = answer === null ? null : describeFilterLineAlternatives(answer.line);
  let answerRow =
    answer === null || answerWords === null
      ? null
      : withTwoLineDrawing(
          {
            id: FILTER_ANSWER_ROW_ID,
            inFull: joinMessageParts(answerWords),
          },
          jsx(WordsWithColumnNames, {
            words: answerWords,
          }),
          jsx('span', {
            className: 'min-h-[1lh] text-footnote text-muted',
            children: answer.records === null ? '' : tabularCount(rowCountWords(answer.records)),
          }),
        );
  let valueRows =
    values === null || values.length === 0
      ? []
      : [
          {
            id: SELECT_ALL_ROW_ID,
            mark: listRowMarkSlot(
              jsx(CheckboxMark, {
                checked: list.ticked === 'all',
                indeterminate: list.ticked === 'some',
              }),
            ),
            isTicked: list.ticked === 'some' ? 'some' : list.ticked === 'all',
            drawn: filterMessages.selectAll(),
          },
          ...values.map(filterValueRow),
          ...(list.areMoreLeftOut
            ? [
                {
                  id: MORE_VALUES_ROW_ID,
                  drawn: filterMessages.moreValuesLeftOut(),
                  isOutOfUse: true,
                },
              ]
            : []),
        ];
  let sections = (isSearching ? [answerRow === null ? [] : [answerRow], foundRows, valueRows] : [readyRows, valueRows]).flatMap(
    (rows?: Dynamic, sectionIndex?: Dynamic) =>
      rows.length === 0
        ? []
        : [
            {
              id: String(sectionIndex),
              heading:
                rows === readyRows
                  ? sortAndFilterMessages.suggested()
                  : rows === valueRows
                    ? labelWithCount(filterMessages.values(), list.records === null ? null : rowsInViewOfAllText(list.records), false)
                    : null,
              rows: rows,
            },
          ],
  );
  let [settledWords, setSettledWords] = React.useState(null);
  React.useEffect(() => {
    let timer = setTimeout(() => setSettledWords(typedWords), TYPED_WORDS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [typedWords]);
  let listNote =
    values === null
      ? filterMessages.valuesNotListed()
      : isSearching && sections.length === 0 && (!list.areWordsOnTheirWay || settledWords === typedWords)
        ? filterMessages.noMatches()
        : null;
  let answerSaid =
    answer === null || answerWords === null
      ? undefined
      : {
          words: joinMessageParts(answerWords),
          ...(answer.records !== null && {
            count: rowCountWords(answer.records),
          }),
        };
  let firstFound = !isSearching
    ? null
    : (answerSaid ?? foundRows.find(({ isOutOfUse: isOutOfUse }: Dynamic) => isOutOfUse !== true) ?? null);
  let readyRowOf = (rowId?: Dynamic) =>
    rowId === FILTER_ANSWER_ROW_ID ? 'answer' : (list.ready.find(({ what: what }: Dynamic) => what === rowId)?.what ?? null);
  let takeRow = (rowId?: Dynamic) => {
    let [rowKind, valueIndex] = rowId.split(' ');
    let [sortDirection, readyRow] = [
      FILTER_LIST_SORT_DIRECTIONS.find((direction?: Dynamic) => direction === rowId),
      readyRowOf(rowId),
    ];
    if (sortDirection !== undefined) return onSort?.(sortDirection);
    if (readyRow !== null)
      return onAct({
        kind: 'take',
        row: readyRow,
      });
    if (rowId === SELECT_ALL_ROW_ID)
      return onAct({
        kind: list.ticked === 'all' ? 'tickNone' : 'tickAll',
      });
    return rowKind === 'value'
      ? onAct({
          kind: 'tick',
          index: Number(valueIndex),
        })
      : undefined;
  };
  return jsx(AskOrPickList, {
    nameOfField: filterByColumnLabel(list.column),
    nameOfList: sortAndFilterMessages.waysToSortAndFilter(),
    placeholder: isColumnNamedAbove ? filterMessages.searchOrFilter() : searchOrFilterColumnLabel(list.column),
    text: typedWords,
    mostCharacters: MOST_CHARACTERS_OF_WORDS,
    stands: 'atRest',
    isAgentAtWork: false,
    said: isSearching ? null : listNote,
    foundSaid: isSearching ? filterListFoundSaid(firstFound, listNote) : askListFoundSaid(null),
    note:
      listNote === null
        ? null
        : jsx('p', {
            className: 'px-md py-1.5 text-body text-secondary',
            children: listNote,
          }),
    sections: sections,
    doesFirstRowAnswer: firstFound !== null,
    overList: isSearching
      ? []
      : [
          ...(sortRows.length === 0
            ? []
            : [
                {
                  id: 'sorts',
                  heading: labelWithCount(
                    filterMessages.sorts(),
                    list.sort?.isForOneself === true ? filterMessages.forYouOnly() : filterMessages.forEveryone(),
                  ),
                  controls: sortRows.map(
                    ({ id: sortDirection, underHeading: underHeading, isChecked: isChecked }: Dynamic) =>
                      jsxs(
                        Combobox.FooterAction,
                        {
                          ...ARROW_STOP_ATTRIBUTES,
                          className: `${FOCUS_SHADOW_CLASS} disabled:opacity-disabled`,
                          'aria-current': isChecked,
                          disabled: !list.canSortNow,
                          onClick: () => onSort?.(sortDirection),
                          children: [
                            jsx('span', {
                              className: 'min-w-0 flex-1 truncate text-start',
                              children: underHeading,
                            }),
                            isChecked &&
                              jsx('span', {
                                className: 'flex flex-none text-accent',
                                children: jsx(Icon, {
                                  name: 'Check',
                                  size: 'md',
                                  bold: true,
                                }),
                              }),
                          ],
                        },
                        sortDirection,
                      ),
                  ),
                },
              ]),
          ...(hasConditionControls
            ? [
                {
                  id: 'conditions',
                  heading: labelWithCount(filterMessages.filters(), filterMessages.forYouOnly()),
                  controls: jsx(OwnFilterConditionControls, {
                    list: list,
                    onAct: onAct,
                  }),
                },
              ]
            : []),
        ],
    foot: null,
    wordsOfFoot: {
      keep: '',
      discard: '',
      stop: '',
    },
    height: isTouchBelowSm2
      ? '100%'
      : {
          atMost: '520px',
        },
    isUnderTitle: isColumnNamedAbove,
    width: TABLE_CARD_WIDTH,
    onTextChange: (words?: Dynamic) => {
      pointedRowRef.current = null;
      setTypedWords(words);
      onAct({
        kind: 'type',
        words: words,
        blank: filterMessages.blankAsAValue(),
      });
    },
    onRowPointedAt: (rowId?: Dynamic) => {
      let readyRow = readyRowOf(rowId);
      if (readyRow === pointedRowRef.current) return;
      pointedRowRef.current = readyRow;
      onAct({
        kind: 'pointAt',
        row: readyRow,
      });
    },
    onRowTaken: takeRow,
    onEntered: () =>
      onAct({
        kind: 'take',
        row: 'answer',
      }),
    onKept: () => {},
    onSteppedBack: () => {},
  });
}
export function OwnFilterListPopover({
  list: list,
  anchor: anchor,
  clearAtFoot: clearAtFoot,
  onDrawn: onDrawn,
  whatHasCaretAfter: whatHasCaretAfter,
  onAct: onAct,
  onSort: onSort,
  onShut: onShut,
  onActedWithin: onActedWithin,
  onGone: onGone,
  onBack: onBack,
}: Dynamic) {
  let [listShown, setListShown] = React.useState(list);
  if (list !== null && list !== listShown) setListShown(list);
  let popupRef = React.useRef(null);
  let goBack = React.useCallback(({ detail: detail }: Dynamic) => onBack?.(detail === 0), [onBack]);
  let { isGivenUp: isGivenUp, holdPopup: holdPopup, noteFocus: noteFocus } = usePopupGivenUpOnBlur(list !== null, onShut);
  let isOpen = list !== null && !isGivenUp;
  let focusOnOpen = usePopupFieldFocus({
    isOpen: isOpen,
    popup: popupRef,
    shut: onShut,
  });
  let initialFocus = React.useCallback(() => (isOnPhone() ? popupRef.current : focusOnOpen()), [focusOnOpen]);
  let popupElementRef = React.useCallback(
    (popup?: Dynamic) => {
      popupRef.current = popup;
      holdPopup(popup);
      onDrawn?.(popup);
    },
    [holdPopup, onDrawn],
  );
  let roomUnderKeyboard = useBottomInsetWhileOpen(list !== null, false);
  React.useLayoutEffect(() => {
    if (isOpen && popupRef.current !== null) onDrawn?.(popupRef.current);
  }, [isOpen, onDrawn]);
  return jsx(Popover.Root, {
    open: isOpen,
    onOpenChange: (open: Dynamic, { event: openEvent, reason: reason }: Dynamic) => {
      let isOnFilterOpener = openEvent.target instanceof Element && openEvent.target.closest(FILTER_OPENER_SELECTOR) !== null;
      if (!open && !(reason === 'outside-press' && isOnFilterOpener)) onShut();
    },
    onOpenChangeComplete: (open?: Dynamic) => {
      if (!open) onGone();
    },
    children: jsxs(Popover.Popup, {
      ref: popupElementRef,
      anchor: anchor,
      side: 'bottom',
      align: 'start',
      padding: 'none',
      ...(onBack !== null && {
        className: 'flex flex-col',
      }),
      collisionPadding: popupCollisionPadding(Math.max(roomUnderKeyboard, clearAtFoot)),
      collisionAvoidance: FILTER_LIST_COLLISION_AVOIDANCE,
      'aria-label': listShown === null || onBack !== null ? undefined : filterByColumnLabel(listShown.column),
      initialFocus: initialFocus,
      sheetHeight: 'tall',
      finalFocus: whatHasCaretAfter,
      onFocus: noteFocus,
      onKeyDown: wrapTabFocusInBar,
      onPointerDownCapture: onActedWithin,
      onKeyDownCapture: onActedWithin,
      children: [
        listShown !== null &&
          onBack !== null &&
          jsx(Popover.Header, {
            showClose: false,
            onBack: goBack,
            backLabel: filterMessages.backToSortAndFilter(),
            children: ruleColumnName(listShown.column),
          }),
        listShown !== null &&
          jsx(
            OwnFilterListBody,
            {
              list: listShown,
              isColumnNamedAbove: onBack !== null,
              onAct: onAct,
              onSort: onSort,
            },
            `${listShown.tableKey} ${listShown.c}`,
          ),
      ],
    }),
  });
}
export const useTouchBelowSmAtOpen = () => React.useState(useTouchBelowSm())[0];
export const filterValueLabel = ({ text: text, isChecked: isChecked }: Dynamic) =>
  isChecked === null ? (text ?? filterMessages.blankAsAValue()) : filterChoiceLabel(isChecked ? 'isChecked' : 'isNotChecked', false);
export const COARSE_POINTER_TALL_CLASS = 'pointer-coarse:h-10';
export const UNDERLINED_FIELD_PROPS = {
  className:
    'rounded-none! border-b border-b-border bg-transparent! px-xs! shadow-none! focus-visible:border-b-current data-[invalid]:border-b-danger focus-visible:data-[invalid]:border-b-2 forced-colors:focus-visible:border-b-[Highlight]',
};
export const FOCUS_SHADOW_CLASS = 'focus-visible:shadow-focus';
export const isFocusStillNear = (element?: Dynamic, focusedBefore?: Dynamic) => {
  let { activeElement: activeElement } = element.ownerDocument;
  return element.ownerDocument.hasFocus() && (activeElement === focusedBefore || activeElement?.contains(element) === true);
};
export const isSameHeldCondition = (held?: Dynamic, other?: Dynamic) =>
  held.choice === other?.choice && held.first === other.first && held.second === other.second;
export const listRowMarkSlot = (mark?: Dynamic) =>
  jsx('span', {
    'data-size': 'xs',
    className: 'flex w-5 flex-none justify-start',
    children: mark,
  });
export const tabularCount = (count?: Dynamic) =>
  jsx('span', {
    className: 'tabular-nums',
    children: count,
  });
export const FILTER_LIST_SORT_DIRECTIONS = ['ascending', 'descending'];
export const filterListFoundSaid = (firstFound?: Dynamic, note?: Dynamic) =>
  askListFoundSaid(
    firstFound === null
      ? {
          rowOfEnter: null,
          count: null,
          note: note,
        }
      : {
          rowOfEnter: firstFound.words,
          count: firstFound.count ?? null,
          note: null,
        },
  );
export const FILTER_LIST_COLLISION_AVOIDANCE = {
  side: 'none',
  align: 'shift',
  fallbackAxisSide: 'none',
};
export const MIN_CHARACTERS_TO_MATCH_SORTS = 3;
export const TYPED_WORDS_SETTLE_MS = 500;
export const FILTER_ANSWER_ROW_ID = 'answer';
export const SELECT_ALL_ROW_ID = 'all';
export const MORE_VALUES_ROW_ID = 'more';
export const withTwoLineDrawing = (row?: Dynamic, words?: Dynamic, atEnd?: Dynamic) => ({
  ...row,
  laysItselfOut: true,
  drawn: jsxs('span', {
    className: 'flex min-w-0 flex-1 flex-col',
    children: [
      jsx('span', {
        className: 'line-clamp-2 min-w-0 wrap-anywhere',
        children: words,
      }),
      atEnd,
    ],
  }),
});
export const FILTER_OPENER_SELECTOR =
  '.sheet-own-filter-button, .sheet-own-filter-bar :is([aria-haspopup="dialog"], .sheet-own-filter-line-remove)';
export const whatHasCaretAfterFilterList = (caretReturn?: Dynamic) => {
  if (caretReturn.isOtherCardOpen) return false;
  return caretReturn.opener !== null && !caretReturn.isLeftByPress ? caretReturn.opener : caretReturn.otherwise();
};
export const OwnFilterList = React.memo(function (props?: Dynamic) {
  let listKey = props.list === null ? null : `${props.list.tableKey} ${props.list.c}`;
  let [shownKey, setShownKey] = React.useState(listKey);
  let [timesSwitched, setTimesSwitched] = React.useState(0);
  if (listKey !== shownKey) {
    setShownKey(listKey);
    if (listKey !== null && shownKey !== null) setTimesSwitched(timesSwitched + 1);
  }
  return jsx(
    OwnFilterListPopover,
    {
      ...props,
    },
    timesSwitched,
  );
});
