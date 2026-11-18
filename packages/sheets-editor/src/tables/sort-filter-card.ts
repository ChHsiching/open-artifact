import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import {
  sortByColumnLabel,
  filterViewChoiceLabel,
  rowCountWords,
  filterAndSortSummaryParts,
  filterAndSortSummary,
  customSortMessages,
  sortAndFilterMessages,
} from './sort-filter-labels.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { labelWithCount, AskOrPickList, askListFoundSaid } from '../ui/ask-list/ask-or-pick-list.ts';
import { filterMessages, filterByColumnLabel } from './filter-messages.ts';
import { ruleColumnName } from '../messages/conditional-format.ts';
import { MOST_CHARACTERS_OF_WORDS } from '../words/vocabulary.ts';
import { SIDE_PANE_DEFAULT_WIDTH } from '../ui/side-pane/side-pane.ts';
import { isoDayOfDate } from '../chips/calendar.ts';
export let SORT_FILTER_ANSWER_ROW_ID: Dynamic;
export let CUSTOM_SORT_ROW_ID: Dynamic;
export function SortFilterCardList({
  card: card,
  onAct: onAct,
  onCustomSortAsked: onCustomSortAsked,
  onColumnAsked: onColumnAsked,
}: Dynamic) {
  let [text, setText] = React.useState('');
  let whyOutOfUseId = React.useId();
  let hasText = text.trim() !== '';
  let { answer: answer, hasTable: hasTable } = card;
  let answerRowId = card.askThatAnswered === null ? SORT_FILTER_ANSWER_ROW_ID : `${SORT_FILTER_ANSWER_ROW_ID} ${card.askThatAnswered}`;
  let restTimerRef = React.useRef(undefined);
  let isRowPointedRef = React.useRef(false);
  React.useEffect(() => () => clearTimeout(restTimerRef.current), []);
  let rows = [
    ...card.sortsOfColumn.map(
      (sort?: Dynamic) => ({
        id: `sort ${sort.direction}`,
        asked: sort.asked,
        drawn: sortByColumnLabel(sort),
      }),
    ),
    ...card.suggested.map(
      ({ what: what, asked: asked, records: records }: Dynamic, suggestedIndex?: Dynamic) => ({
        id: `suggested ${suggestedIndex}`,
        asked: asked,
        drawn: filterViewChoiceLabel(what),
        atEnd: records === null ? undefined : rowCountWords(records),
      }),
    ),
  ];
  let filterRows = rows.filter(({ asked: asked }: Dynamic) => asked.filter !== null);
  let hasSortRows = rows.length > filterRows.length;
  let headingCount = hasSortRows && filterRows.length > 0 ? 2 : 1;
  let [shownRowCount] = React.useState(Math.max(rows.length + 1 + headingCount + (hasTable ? 0 : 0.75), 4));
  let answerRow =
    answer === null
      ? null
      : {
          id: answerRowId,
          isOfAgent: card.askThatAnswered !== null,
          laysItselfOut: true,
          drawn: jsxs('span', {
            className: 'flex min-w-0 flex-1 flex-col',
            children: [
              jsxs('span', {
                className: `min-w-0 wrap-anywhere ${card.askThatAnswered === null ? 'line-clamp-2' : ''}`,
                children: [
                  filterAndSortSummaryParts(answer).first,
                  filterAndSortSummaryParts(answer).thenSort !== null &&
                    jsxs('span', {
                      className: 'text-muted',
                      children: [' ', filterAndSortSummaryParts(answer).thenSort],
                    }),
                ],
              }),
              (answer.lines.length > 0 || answer.records !== null) &&
                jsx('span', {
                  className: 'min-h-[1lh] text-footnote text-muted',
                  children: answer.records === null ? '' : rowCountWords(answer.records),
                }),
            ],
          }),
          inFull: filterAndSortSummary(answer),
        };
  let customSortRow = {
    id: CUSTOM_SORT_ROW_ID,
    drawn: customSortMessages.customSort(),
  };
  let sortRows = rows.filter(({ asked: asked }: Dynamic) => asked.filter === null);
  let alwaysGroup = {
    id: 'always',
    heading: null,
    rows: [customSortRow],
  };
  let areSortsForOneself = hasSortRows && card.areSortsForOneself;
  let sortsGroup = {
    id: 'sorts',
    heading: labelWithCount(filterMessages.sorts(), areSortsForOneself ? filterMessages.forYouOnly() : filterMessages.forEveryone()),
    rows: areSortsForOneself ? sortRows : [...sortRows, customSortRow],
  };
  let filtersGroup = {
    id: 'filters',
    heading: labelWithCount(filterMessages.filters(), filterMessages.forYouOnly()),
    rows: filterRows,
  };
  let groupsWithoutText = areSortsForOneself
    ? [sortsGroup, ...(filterRows.length === 0 ? [] : [filtersGroup]), alwaysGroup]
    : filterRows.length === 0
      ? [sortsGroup]
      : !hasSortRows
        ? [filtersGroup, alwaysGroup]
        : [sortsGroup, filtersGroup];
  let columnsMatching = (searchText?: Dynamic) =>
    card.columns.filter(({ column: column }: Dynamic) => ruleColumnName(column).toLowerCase().includes(searchText.trim().toLowerCase()));
  let columnsFound = columnsMatching(text);
  let columnRows = columnsFound.map(
    ({ c: c, column: column, isAsked: isAsked }: Dynamic) => ({
      id: `column ${c}`,
      drawn: ruleColumnName(column),
      atEnd: isAsked
        ? jsx('span', {
            className: 'flex text-accent',
            children: jsx(Icon, {
              name: 'Filter',
              size: 'xs',
              alt: sortAndFilterMessages.filtered(),
            }),
          })
        : undefined,
    }),
  );
  let isColumnFoundOnly = hasText && answer === null && columnRows.length > 0;
  let whyNoAnswer = !hasTable
    ? sortAndFilterMessages.noTable()
    : !hasText
      ? null
      : card.callToAgent !== null
        ? card.callToAgent === 'failed'
          ? sortAndFilterMessages.callFailed()
          : sortAndFilterMessages.callRateLimited()
        : card.areWordsNotRead && !isColumnFoundOnly
          ? card.wordsNotKnown.length === 0
            ? sortAndFilterMessages.notUnderstood()
            : sortAndFilterMessages.wordsNotUnderstood(card.wordsNotKnown)
          : card.sortLeftOutBecause === null
            ? null
            : card.sortLeftOutBecause === 'cannotEdit'
              ? sortAndFilterMessages.cannotEdit()
              : sortAndFilterMessages.tableHasBlankRows(card.sortLeftOutBecause.blankRows);
  let answerGroups =
    answerRow !== null || whyNoAnswer !== null
      ? [
          {
            id: 'answer',
            heading: null,
            rows: answerRow === null ? [] : [answerRow],
          },
        ]
      : [];
  let columnGroups =
    columnRows.length === 0
      ? []
      : [
          {
            id: 'columns',
            heading: sortAndFilterMessages.filterByColumn(),
            rows: columnRows,
          },
        ];
  let groups = hasText ? [...answerGroups, ...columnGroups, alwaysGroup] : [...groupsWithoutText, ...columnGroups];
  let columnFound = isColumnFoundOnly ? columnsFound[0]?.column : undefined;
  let askedOfRow = (rowId?: Dynamic) =>
    rowId === answerRowId ? (answer?.asked ?? null) : (rows.find((row?: Dynamic) => row.id === rowId)?.asked ?? null);
  let takeAnswer = () =>
    onAct({
      kind: 'takeAnswer',
      askOnShow: card.askThatAnswered,
    });
  return jsx(AskOrPickList, {
    nameOfField: sortAndFilterMessages.sayWhichRowsToShow(),
    nameOfList: sortAndFilterMessages.waysToSortAndFilter(),
    placeholder: sortAndFilterMessages.whichRowsToShow(),
    text: text,
    ...(!hasTable && {
      idOfWhyFieldIsOutOfUse: whyOutOfUseId,
    }),
    mostCharacters: MOST_CHARACTERS_OF_WORDS,
    stands: 'atRest',
    isAgentAtWork: card.isAgentAsked,
    said: card.isAgentAsked ? sortAndFilterMessages.agentIsWorking() : hasText ? null : whyNoAnswer,
    foundSaid: hasText ? sortFilterFoundSaid(answer, columnFound ?? null, whyNoAnswer) : askListFoundSaid(null),
    note:
      whyNoAnswer === null
        ? null
        : jsx('div', {
            id: whyOutOfUseId,
            className: 'px-md py-1 text-footnote text-secondary',
            children: whyNoAnswer,
          }),
    idOfAgentsNote: card.callToAgent === null ? null : `call ${card.askThatAnswered}`,
    sections: groups,
    doesFirstRowAnswer: hasText && (answer !== null || isColumnFoundOnly),
    ...(card.columnCameBackFrom !== null && {
      rowPointedAtFirst: `column ${card.columnCameBackFrom}`,
    }),
    foot: null,
    wordsOfFoot: {
      keep: '',
      discard: '',
      stop: '',
    },
    height: card.isOfFilterBar
      ? {
          atMost: '600px',
        }
      : sortFilterCardHeight(shownRowCount),
    width: SIDE_PANE_DEFAULT_WIDTH,
    onTextChange: (typedText?: Dynamic) => {
      setText(typedText);
      onAct({
        kind: 'type',
        words: typedText,
        today: isoDayOfDate(new (Date as Dynamic)()),
      });
      clearTimeout(restTimerRef.current);
      restTimerRef.current = setTimeout(
        () =>
          onAct({
            kind: 'rest',
            isRowPointedAt: isRowPointedRef.current,
            isColumnFound: columnsMatching(typedText).length > 0,
          }),
        SORT_FILTER_REST_MS,
      );
    },
    onCompositionBegun: () => clearTimeout(restTimerRef.current),
    onRowPointedAt: (rowId?: Dynamic) => {
      isRowPointedRef.current = rowId !== null;
      onAct({
        kind: 'pointAt',
        asked: askedOfRow(rowId),
      });
    },
    onRowTaken: (rowId?: Dynamic) => {
      if (rowId === CUSTOM_SORT_ROW_ID) return onCustomSortAsked();
      let column = card.columns.find(({ c: c }: Dynamic) => rowId === `column ${c}`);
      if (column !== undefined) return card.tableKey === null ? undefined : onColumnAsked?.(card.tableKey, column.c);
      if (rowId === answerRowId) return takeAnswer();
      let asked = askedOfRow(rowId);
      return asked === null
        ? undefined
        : onAct({
            kind: 'take',
            asked: asked,
          });
    },
    onEntered: takeAnswer,
    onKept: () => {},
    onSteppedBack: () => {},
  });
}
[SORT_FILTER_ANSWER_ROW_ID, CUSTOM_SORT_ROW_ID] = ['answer', 'customSort'];
export const sortFilterCardHeight = (rowCount?: Dynamic) => `calc(3.625rem + ${rowCount} * max(var(--ui-h-control), 1.75rem))`;
export const SORT_FILTER_REST_MS = 500;
export const sortFilterFoundSaid = (answer?: Dynamic, foundColumn?: Dynamic, note?: Dynamic) =>
  askListFoundSaid({
    rowOfEnter: answer !== null ? filterAndSortSummary(answer) : foundColumn === null ? null : filterByColumnLabel(foundColumn),
    count: answer === null || answer.records === null ? null : rowCountWords(answer.records),
    note: note,
  });
