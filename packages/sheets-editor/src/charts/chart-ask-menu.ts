import { AgentMark } from '../kit/agent-mark.tsx';
import { Icon } from '../kit/icon.tsx';
import { Shortcut } from '../kit/shortcut.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { MAX_ASK_WORDS_LENGTH, cleanAskWords } from '../agent/chat-with-agent.ts';
import { jsx } from 'react/jsx-runtime';
import { ChartThumbnail } from './chart-thumbnail.ts';
import { chartKindName, CHART_MESSAGES } from './chart-words.ts';
import { DrawnAndSaid, AgentWritingRow } from '../agent/agent-rows.ts';
import { chartMessages } from '../messages/charts.ts';
import { AskOrPickList } from '../ui/ask-list/ask-or-pick-list.ts';
import { SIDE_PANE_DEFAULT_WIDTH } from '../ui/side-pane/side-pane.ts';
export let KEEP_CHANGE_ROW: Dynamic;
export let DISCARD_CHANGE_ROW: Dynamic;
export function chartKindOfRow(rowId?: Dynamic) {
  if (rowId === ASK_AGENT_ROW || rowId === ANY_KIND_ROW) return 'any';
  return rowId === 'bar' || rowId === 'stackedBar' || rowId === 'line' || rowId === 'pie' ? rowId : null;
}
export function nextKindsOnlyState(state?: Dynamic, options?: Dynamic) {
  let canBeUsedWith = (showsOnlyKinds2?: Dynamic) => options.canTakeKind || (!showsOnlyKinds2 && !options.isFieldLocked);
  let showsOnlyKinds = state.canBeUsed && canBeUsedWith(state.showsOnlyKinds) ? state.showsOnlyKinds : options.areOnlyKindsDue;
  return {
    showsOnlyKinds: showsOnlyKinds,
    canBeUsed: canBeUsedWith(showsOnlyKinds),
  };
}
export function ChartAskMenu({
  onOffer: onOffer,
  whyNot: whyNot,
  canPageMakeChart: canPageMakeChart,
  areKindsForPage = canPageMakeChart,
  onAsked: onAsked,
  changesChart = false,
  noteOnLastAsk = null,
  mostTyped = MAX_ASK_WORDS_LENGTH,
  typed: typed,
  onTyped: onTyped,
  isKeyOfAnother: isKeyOfAnother,
  change = null,
  askedOfAgent = '',
  isKindAsked = false,
  isNoteOfFault = true,
  isLastAskNotToBeRepeated = false,
  onChangeKept: onChangeKept,
  onSteppedBackFromChange: onSteppedBackFromChange,
}: Dynamic) {
  let canAskAgent = whyNot === null;
  let [ownTyped, setOwnTyped] = React.useState('');
  let [typedText, setTypedText] = [typed ?? ownTyped, onTyped ?? setOwnTyped];
  let hasTyped = cleanAskWords(typedText) !== '';
  let canTakeKind = (!hasTyped && onOffer.length > 0 && canPageMakeChart) || canAskAgent;
  let withUsability = (row?: Dynamic) => ({
    ...row,
    isOutOfUse: !(chartKindOfRow(row.id) === 'any' ? canAskAgent : canTakeKind),
  });
  let [isFieldLocked, setIsFieldLocked] = React.useState(whyNot === 'noChat');
  let nextIsFieldLocked = isFieldLockedForNoChat(isFieldLocked, whyNot);
  if (nextIsFieldLocked !== isFieldLocked) setIsFieldLocked(nextIsFieldLocked);
  let areOnlyKindsDue = whyNot === 'noChat' && areKindsForPage && onOffer.length > 0;
  let [kindsOnly, setKindsOnly] = React.useState(NO_KINDS_ONLY_STATE);
  let nextKindsOnly = nextKindsOnlyState(kindsOnly, {
    areOnlyKindsDue: areOnlyKindsDue,
    canTakeKind: canTakeKind,
    isFieldLocked: nextIsFieldLocked,
  });
  let { showsOnlyKinds: showsOnlyKinds } = nextKindsOnly;
  if (showsOnlyKinds !== kindsOnly.showsOnlyKinds || nextKindsOnly.canBeUsed !== kindsOnly.canBeUsed) setKindsOnly(nextKindsOnly);
  let kindRows =
    onOffer.length > 0
      ? onOffer.map(
          (chart?: Dynamic) => ({
            id: chart.kind,
            mark: jsx(ChartThumbnail, {
              chart: chart,
              size: CHART_THUMBNAIL_SIZE,
              isOutOfUse: !canTakeKind,
            }),
            drawn: chartKindName(chart.kind),
          }),
        )
      : DEFAULT_CHART_KINDS.map(
          ({ kind: kind, icon: icon }: Dynamic) => ({
            id: kind,
            mark: jsx(Icon, {
              name: icon,
              size: 'md',
            }),
            drawn: chartKindName(kind),
          }),
        );
  let kindSections = [
    {
      id: 'kinds',
      heading:
        hasTyped || onOffer.length === 0 || changesChart
          ? null
          : jsx('span', {
              className: 'flex h-4 items-center',
              children: CHART_MESSAGES.suggested(),
            }),
      rows: [
        ...(hasTyped
          ? [
              {
                id: ASK_AGENT_ROW,
                mark: WAND_ROW_MARK,
                drawn: changesChart ? CHART_MESSAGES.changeThisChart() : CHART_MESSAGES.makeThisChart(),
              },
            ]
          : []),
        ...kindRows,
      ].map(withUsability),
    },
    ...(hasTyped || changesChart || showsOnlyKinds
      ? []
      : [
          {
            id: 'anyKind',
            heading: null,
            rows: [
              withUsability({
                id: ANY_KIND_ROW,
                mark: WAND_ROW_MARK,
                drawn: jsx(DrawnAndSaid, {
                  drawn: CHART_MESSAGES.quickChart(),
                  said: CHART_MESSAGES.quickChartSaid(),
                }),
              }),
            ],
          },
        ]),
  ];
  let [kindsSection] = kindSections;
  let sections =
    !changesChart || kindsSection === undefined
      ? kindSections
      : [
          ...(hasTyped
            ? [
                {
                  id: 'ask',
                  heading: null,
                  rows: kindsSection.rows.slice(0, 1),
                },
                {
                  id: 'line',
                  heading: null,
                  rows: [],
                },
              ]
            : []),
          {
            id: 'kinds',
            heading: jsx('span', {
              className: 'flex h-4 items-center',
              children: CHART_MESSAGES.changeChartType(),
            }),
            rows: kindsSection.rows.slice(hasTyped ? 1 : 0),
          },
        ];
  let [mostKindRows, setMostKindRows] = React.useState(kindRows.length);
  if (kindRows.length > mostKindRows) setMostKindRows(kindRows.length);
  let [hasHadOffers, setHasHadOffers] = React.useState(onOffer.length > 0);
  if (onOffer.length > 0 && !hasHadOffers) setHasHadOffers(true);
  if (showsOnlyKinds !== kindsOnly.showsOnlyKinds) {
    setMostKindRows(kindRows.length);
    setHasHadOffers(onOffer.length > 0);
  }
  let [hasHadNote, setHasHadNote] = React.useState(false);
  let [noteHeight, setNoteHeight] = React.useState(null);
  let noteId = React.useId();
  let workingText = changesChart ? chartMessages.changingChart() : CHART_MESSAGES.makingChart();
  let changeSaid = (
    {
      agentWrites: workingText,
      waits: chartMessages.changeIsPreview(),
      none: null,
    } as Dynamic
  )[change ?? 'none'];
  let [stoppedWithTyped, setStoppedWithTyped] = React.useState(null);
  if (stoppedWithTyped !== null && !isStopNoteStillValid(stoppedWithTyped, typedText, change)) setStoppedWithTyped(null);
  let [wasRequestKept, setWasRequestKept] = React.useState(false);
  let stoppedSaid =
    stoppedWithTyped === null ? null : wasRequestKept ? chartMessages.stoppedWithRequestKept() : chartMessages.stoppedWithRequestGone();
  let stepBackFromChange = () => {
    setStoppedWithTyped(typedText);
    setWasRequestKept(hasTyped && !isKindAsked);
    onSteppedBackFromChange?.();
  };
  let isNoAgentNote = whyNot === 'noChat' && !showsOnlyKinds;
  let note = isNoAgentNote ? CHART_MESSAGES.noAgent() : noteOnLastAsk;
  let measureNote = (noteElement?: Dynamic) => {
    if (noteElement !== null && noteElement.offsetHeight > 0)
      setNoteHeight((input?: Dynamic) => Math.max(input ?? 0, noteElement.offsetHeight));
  };
  if (note !== null && !hasHadNote) setHasHadNote(true);
  let keepOrDiscardSections = [
    {
      id: 'keepOrDiscard',
      heading: null,
      rows: [
        {
          id: KEEP_CHANGE_ROW,
          mark: EMPTY_ROW_MARK,
          drawn: chartMessages.keepChange(),
        },
        {
          id: DISCARD_CHANGE_ROW,
          mark: EMPTY_ROW_MARK,
          drawn: chartMessages.discardChange(),
          atEnd: ESC_SHORTCUT_HINT,
          isLikeWhatStoodThere: true,
        },
      ],
    },
  ];
  let fieldName = changesChart ? chartMessages.askAgentToChangeChart() : CHART_MESSAGES.askAgentToMakeAChart();
  let takeRow = (rowId?: Dynamic) => {
    if (rowId === KEEP_CHANGE_ROW) return onChangeKept?.();
    if (rowId === DISCARD_CHANGE_ROW) return onSteppedBackFromChange?.();
    let kind = chartKindOfRow(rowId);
    if (kind !== null && (kind === 'any' ? canAskAgent : canTakeKind)) onAsked(kind, typedText);
  };
  return jsx(AskOrPickList, {
    nameOfField: fieldName,
    nameOfList: changesChart ? chartMessages.editWithAgent() : CHART_MESSAGES.insertChart(),
    placeholder: fieldName,
    text: change !== null && typedText === '' ? askedOfAgent : typedText,
    ...((nextIsFieldLocked || change === 'waits') && {
      idOfWhyFieldIsOutOfUse: noteId,
    }),
    isFieldLeftOut: showsOnlyKinds,
    mostCharacters: mostTyped,
    stands: change === 'agentWrites' ? 'whileAgentWrites' : 'atRest',
    hasAnswer: change === 'waits' || isLastAskNotToBeRepeated,
    isAgentAtWork: change === 'agentWrites',
    said: isNoAgentNote ? note : (changeSaid ?? (changesChart ? null : noteOnLastAsk) ?? stoppedSaid),
    note:
      change === 'waits'
        ? jsx('div', {
            id: noteId,
            className: 'sr-only',
            children: changeSaid,
          })
        : note === null
          ? null
          : jsx('div', {
              ref: measureNote,
              id: noteId,
              className: `px-md py-1 text-footnote ${isNoAgentNote || !isNoteOfFault ? 'text-secondary' : 'text-danger'}`,
              children: note,
            }),
    sections: change === 'waits' ? keepOrDiscardSections : sections,
    ...(change === 'agentWrites' && {
      inPlaceOfList: jsx(AgentWritingRow, {
        words: {
          writes: workingText,
          stop: chartMessages.stopChange(),
        },
        isAmongRowsOfList: true,
        isStopARow: changesChart,
        sizeOfWandInList: CHART_MENU_WAND_SIZE,
        onStopped: stepBackFromChange,
      }),
    }),
    doesFirstRowAnswer: hasTyped || change === 'waits',
    foot: null,
    wordsOfFoot: {
      keep: '',
      discard: '',
      stop: '',
    },
    height:
      change !== null && changesChart
        ? CHANGE_PREVIEW_MENU_HEIGHT
        : showsOnlyKinds
          ? chartKindsOnlyHeight(kindRows.length)
          : chartMenuHeight(
              changesChart && !hasTyped ? mostKindRows - 1 : mostKindRows,
              hasHadOffers || changesChart,
              note !== null || (hasHadNote && !changesChart) ? (noteHeight ?? 'unmeasured') : null,
              changesChart && !hasTyped,
            ),
    width: SIDE_PANE_DEFAULT_WIDTH,
    ...(isKeyOfAnother !== undefined && {
      isKeyOfAnother: isKeyOfAnother,
    }),
    onTextChange: setTypedText,
    onRowPointedAt: ignoreChartMenuEvent,
    onRowTaken: takeRow,
    onEntered: () => (hasTyped ? takeRow(ASK_AGENT_ROW) : undefined),
    onKept: ignoreChartMenuEvent,
    onSteppedBack: stepBackFromChange,
  });
}
export const CHART_MENU_BASE_REM = 3.5;
export const CHART_MENU_FLUSH_REM = 0.5;
export const CHART_MENU_HEADING_REM = 1.75;
export const CHART_MENU_NOTE_REM = 1.5625;
export const chartMenuHeight = (rowCount?: Dynamic, hasHeading?: Dynamic, noteHeight?: Dynamic, isFlush: Dynamic = false) =>
  `calc(${CHART_MENU_BASE_REM - (isFlush ? CHART_MENU_FLUSH_REM : 0) + (hasHeading ? CHART_MENU_HEADING_REM : 0) + (noteHeight === 'unmeasured' ? CHART_MENU_NOTE_REM : 0)}rem + ${typeof noteHeight === 'number' ? `${noteHeight}px + ` : ''}${rowCount + 1} * max(var(--ui-h-control), 1.75rem))`;
export const chartKindsOnlyHeight = (kindCount?: Dynamic) =>
  `calc(2 * var(--ui-menu-gutter, 0.25rem) + ${CHART_MENU_HEADING_REM}rem + ${kindCount} * max(var(--ui-h-control), 1.75rem))`;
export const CHANGE_PREVIEW_MENU_HEIGHT = chartMenuHeight(1, false, null, true);
[KEEP_CHANGE_ROW, DISCARD_CHANGE_ROW] = ['keep', 'discard'];
export const ESC_SHORTCUT_HINT = jsx(Shortcut, {
  'aria-hidden': true,
  keys: 'esc',
  variant: 'text',
  className: 'pointer-coarse:hidden',
});
export const ignoreChartMenuEvent = () => {};
export const CHART_THUMBNAIL_SIZE = 20;
export const CHART_MENU_WAND_SIZE = 14;
export const EMPTY_ROW_MARK = jsx('span', {
  className: 'w-5 flex-none',
});
export const DEFAULT_CHART_KINDS = [
  {
    kind: 'bar',
    icon: 'Chart',
  },
  {
    kind: 'line',
    icon: 'ChartLine',
  },
];
export const ASK_AGENT_ROW = 'ask';
export const ANY_KIND_ROW = 'any';
export const WAND_ROW_MARK = jsx('span', {
  className: 'flex w-5 flex-none justify-center',
  children: jsx(AgentMark, {
    size: CHART_MENU_WAND_SIZE,
  }),
});
export const isFieldLockedForNoChat = (wasLocked?: Dynamic, whyNot?: Dynamic) => wasLocked && whyNot === 'noChat';
export const isStopNoteStillValid = (stoppedWithTyped?: Dynamic, typed?: Dynamic, change?: Dynamic) =>
  stoppedWithTyped === typed && change === null;
export const NO_KINDS_ONLY_STATE = {
  showsOnlyKinds: false,
  canBeUsed: false,
};
