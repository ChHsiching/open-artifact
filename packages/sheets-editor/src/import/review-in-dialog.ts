import { Tabs } from '../kit/tabs.tsx';
import { Dialog } from '../kit/dialog.tsx';
import { SegmentedControl } from '../kit/segmented-control.tsx';
import { Button } from '../kit/button.tsx';
import { TooltipGroup } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import {
  importPlanSoFar,
  columnsQuestionDecides,
  importQuestionExamples,
  isImportPlanComing,
  openImportQuestionIds,
  importNotesToShow,
  importLinesLeftOut,
} from './import-review.ts';
import {
  readingsThatDiffer,
  withoutYear,
  columnsNamedWords,
  columnsAskedAgainAfterChange,
  askedAgainColumns,
  AgentsReadSection,
  AgentsReadFailed,
  HeadingsLineSelect,
} from './settings-pane.ts';
import {
  importQuestionHeading,
  rowsAndColumnsLabel,
  columnsToCheckLabel,
  columnNthLabel,
  PICTURE_BOX_CLASS,
  importDialogLabels,
  addBackColumnLabel,
  notInSheetLabel,
  addBackLineLabel,
} from './import-picture.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { PaneRow, SidePane, SIDE_PANE_DEFAULT_WIDTH, PaneSection } from '../ui/side-pane/side-pane.ts';
import { LAST_DONE_SETTLE_MS } from '../ui/last-done-announcer.ts';
import { subscribeToFocusIn } from '../ui/settled-announcers.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import {
  importSettingsToCheck,
  questionsNotAboutColumns,
  importColumnsComingInCount,
  importDestinationSort,
  columnsLeftOutOfSheetChanges,
  betterReadingForTextColumn,
} from './settings-to-check.ts';
import { importColumnsLeftOut, NOTHING_DRAWN_ANYWAY, importRecordCount, importMergeKeyColumn } from './bring-in.ts';
import { joinImportWordsWithMiddleDots, importReviewMessages, cellsFitFormatWords, columnReadingKindLabel } from './csv-file.ts';
import { importPlacesLeft } from './import-flow.ts';
import { ImportHeadingsRow, PICTURE_ORIGIN, ImportRowNumbers } from './picture-headings.ts';
import {
  importSettingsLabels,
  NewSheetNameField,
  ImportDestinationRows,
  sheetToImportInto,
  importLineLabel,
  summaryByAgentLabel,
} from './destination.ts';
import { LeftOutLinesMenu, ImportQuestionRow } from './settings-aside.ts';
import { ColumnKindMenu } from './preview-table.ts';
import { columnsNotImportedWords } from '../messages/import.ts';
export function importSectionTurnClasses(section?: Dynamic) {
  let pointsDelay = section.points ? 1 : 0;
  return {
    sheet: importTurnClass(pointsDelay),
    columnsToCheck: importTurnClass(pointsDelay + 1),
    leftOut: importTurnClass(pointsDelay + (section.columnsToCheck ? 2 : 1)),
  };
}
export function measureHeadingTextWidth(text?: Dynamic) {
  let cachedWidth = headingTextWidthCache.get(text);
  if (cachedWidth !== undefined) return cachedWidth;
  let canvasContext = (document as Dynamic).createElement('canvas').getContext('2d');
  if (canvasContext !== null) canvasContext.font = `12px ${getComputedStyle((document as Dynamic).body).fontFamily}`;
  let width = canvasContext?.measureText(text).width ?? text.length * 7;
  headingTextWidthCache.set(text, width);
  return width;
}
export function dateOrderReadingsOfAsk(ask?: Dynamic, open?: Dynamic) {
  let question = importPlanSoFar(open).plan.questions.find(({ id: id }: Dynamic) => id === ask.questionId);
  if (question === undefined || ask.about === 'other' || ask.example === null) return null;
  let [firstColumn] = columnsQuestionDecides(question);
  if (firstColumn === undefined || !ask.columns.includes(firstColumn)) return null;
  let readingsThatDiffer2 = readingsThatDiffer(question);
  let readingsOfExamples = importQuestionExamples(open, ask.questionId).flatMap(
    (examplesOfOption?: Dynamic, optionIndex?: Dynamic) => {
      let firstBecomes = examplesOfOption[0]?.becomes ?? null;
      return firstBecomes === null || readingsThatDiffer2[optionIndex]?.kind === 'text'
        ? []
        : [
            {
              optionIndex: optionIndex,
              label: withoutYear(firstBecomes, readingsThatDiffer2[optionIndex]),
            },
          ];
    },
  );
  let [firstReading, secondReading, ...otherReadings] = readingsOfExamples.toSorted(
    (left?: Dynamic, right?: Dynamic) =>
      dateOrDecimalOrderRank(readingsThatDiffer2[left.optionIndex]) - dateOrDecimalOrderRank(readingsThatDiffer2[right.optionIndex]),
  );
  return firstReading !== undefined && secondReading !== undefined && otherReadings.length === 0 && firstReading.label !== secondReading.label
    ? [firstReading, secondReading]
    : null;
}
export function DateOrderSegmentedRow(props?: Dynamic) {
  let { asked: asked, readings: readings, inForce: inForce, isOff: isOff, onAnswered: onAnswered } = props;
  let heading = importQuestionHeading(asked.about, asked.example, asked.names);
  return jsxs(Fragment, {
    children: [
      jsx(PaneRow, {
        children: jsx('span', {
          'aria-hidden': true,
          dir: 'auto',
          className: 'min-w-0 text-footnote leading-snug [overflow-wrap:anywhere] text-secondary select-none',
          children: heading,
        }),
      }),
      jsx(PaneRow, {
        children: jsx('div', {
          role: 'presentation',
          className: 'flex min-w-0 flex-1',
          onClick: ({ target: target }: Dynamic) => {
            if (isOff) return;
            if ((target instanceof Element ? target.closest('[role=radio]') : null)?.getAttribute('aria-checked') === 'true')
              onAnswered(asked.questionId, inForce);
          },
          children: jsx(SegmentedControl, {
            'aria-label': heading,
            disabled: isOff,
            fullWidth: true,
            value: readings.some(({ optionIndex: optionIndex }: Dynamic) => optionIndex === inForce) ? String(inForce) : '',
            segments: readings.map(
              ({ optionIndex: optionIndex, label: label }: Dynamic) => ({
                value: String(optionIndex),
                label: label,
              }),
            ),
            onChange: (value?: Dynamic) => {
              if (value !== '') onAnswered(asked.questionId, Number(value));
            },
          }),
        }),
      }),
    ],
  });
}
export function ColumnSheetLacksRow(props?: Dynamic) {
  let { where: where, what: what, whyInShort: whyInShort, why: why } = props;
  return jsxs(PaneRow, {
    label: where,
    children: [
      jsx('span', {
        dir: 'auto',
        title: why,
        className: 'min-w-[40%] flex-1 truncate ps-md text-body text-secondary',
        children: what,
      }),
      jsx('span', {
        dir: 'auto',
        title: why,
        className: 'min-w-0 truncate text-footnote text-secondary',
        children: whyInShort,
      }),
    ],
  });
}
export function LeftOutAddBackRow({ where: where, what: what, addBack: addBack, isOff: isOff, onAddedBack: onAddedBack }: Dynamic) {
  return jsx(PaneRow, {
    label: where,
    trailing: jsx('span', {
      className: 'flex translate-x-[7px]',
      children: jsx(Button, {
        variant: 'ghost',
        iconOnly: true,
        icon: 'Add',
        'aria-label': addBack,
        title: addBack,
        className: 'text-secondary',
        disabled: isOff,
        ...{
          [ADDS_BACK_ATTRIBUTE]: where,
        },
        onClick: ({ currentTarget: currentTarget }: Dynamic) => {
          let ancestor = currentTarget.closest('[role=dialog]');
          let addBackButtons = [...(ancestor?.querySelectorAll(`[${ADDS_BACK_ATTRIBUTE}]`) ?? [])];
          let buttonIndex = addBackButtons.indexOf(currentTarget);
          let pictureBoxButton = ancestor?.querySelector(PICTURE_BOX_ENABLED_BUTTONS_SELECTOR);
          (addBackButtons[buttonIndex + 1] ?? addBackButtons[buttonIndex - 1] ?? pictureBoxButton)?.focus();
          onAddedBack();
        },
      }),
    }),
    children: jsx('span', {
      dir: 'auto',
      className: 'min-w-0 flex-1 truncate ps-md text-body text-secondary',
      children: what,
    }),
  });
}
export function useMinHeightSince(heardCount?: Dynamic) {
  let childRef = React.useRef(null);
  let [minHeight, setMinHeight] = React.useState({
    since: heardCount,
    height: 0,
  });
  if (minHeight.since !== heardCount)
    setMinHeight({
      since: heardCount,
      height: 0,
    });
  React.useLayoutEffect(() => {
    let [child, ownerWindow] = [childRef.current, childRef.current?.ownerDocument.defaultView];
    if (child === null || ownerWindow === null || ownerWindow === undefined || heardCount === null) return;
    let measure = () => {
      let { height: childHeight } = child.getBoundingClientRect();
      setMinHeight(
        (minHeightNow?: Dynamic) =>
          childHeight > minHeightNow.height
            ? {
                since: heardCount,
                height: childHeight,
              }
            : minHeightNow,
      );
    };
    measure();
    let resizeObserver = new (ownerWindow.ResizeObserver as Dynamic)(measure);
    resizeObserver.observe(child);
    return () => resizeObserver.disconnect();
  }, [heardCount]);
  return {
    child: childRef,
    box: {
      minHeight: minHeight.since === heardCount ? minHeight.height : 0,
    },
  };
}
export function useSettledAnnouncement({ words: words, timesSaid: timesSaid, inPageOf: inPageOf, isFocusYetToMove = false }: Dynamic) {
  let [announcement, setAnnouncement] = React.useState(NOTHING_TO_ANNOUNCE);
  let hasWords = typeof words === 'string' && words !== '';
  if (!hasWords && announcement !== NOTHING_TO_ANNOUNCE) setAnnouncement(NOTHING_TO_ANNOUNCE);
  React.useEffect(() => {
    if (!hasWords || isFocusYetToMove) return;
    let timer: Dynamic;
    let announce = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          setAnnouncement({
            words: words,
            timesSaid: timesSaid,
          }),
        LAST_DONE_SETTLE_MS,
      );
    };
    let stopWaiting = subscribeToFocusIn(inPageOf)(announce);
    announce();
    return () => {
      stopWaiting();
      clearTimeout(timer);
    };
  }, [hasWords, words, timesSaid, inPageOf, isFocusYetToMove]);
  return hasWords ? announcement : NOTHING_TO_ANNOUNCE;
}
export function SettledAnnouncer(props?: Dynamic) {
  return jsx(LiveAnnouncer, {
    ...useSettledAnnouncement(props),
  });
}
export function useTrueAfterDelay(isOn?: Dynamic, delayMs?: Dynamic) {
  let [isTrue, setTrue] = React.useState(false);
  React.useEffect(() => {
    if (!isOn) return;
    let timer = setTimeout(() => setTrue(true), delayMs);
    return () => {
      clearTimeout(timer);
      setTrue(false);
    };
  }, [isOn, delayMs]);
  return isTrue;
}
export function ImportReviewInDialog({
  open: open,
  isInTabs: isInTabs,
  picture: picture,
  zoom: zoom,
  proposal: proposal,
  errorForPicture: errorForPicture,
  shimmer: shimmer,
  columnsRevealed: columnsRevealed,
  lastRow: lastRow,
  isPlanDrawn: isPlanDrawn,
  hasPictureLinesUnfolded: hasPictureLinesUnfolded,
  onRoomMeasured: onRoomMeasured,
  keepButton: keepButton,
  outcome: outcome,
  agentAtWork: agentAtWork,
  agentAtWorkInWords: agentAtWorkInWords,
  wishToAgent: wishToAgent,
  underBothTabs: underBothTabs,
  onDiscarded: onDiscarded,
  wordOfAgent: wordOfAgent,
  onAskedAgain: onAskedAgain,
  onAnswered: onAnswered,
  onChangedByHand: onChangedByHand,
  onKindsWanted: onKindsWanted,
  onDestinationPicked: onDestinationPicked,
  onColumnsPointedAt: onColumnsPointedAt,
  onNoRowPointedAt: onNoRowPointedAt,
  onColumnWanted: onColumnWanted,
  firstTextCells: firstTextCells,
  columnsUnfolded: columnsUnfolded,
  onLeftOutShown: onLeftOutShown,
}: Dynamic) {
  let isRead = isImportPlanComing(open) || columnsRevealed !== null;
  let reviewRows = React.useMemo(() => (isRead ? NO_IMPORT_REVIEW_ROWS : importSettingsToCheck(open)), [open, isRead]);
  let { questions: questions, columnsLeftOut: columnsLeftOut, linesLeftOut: linesLeftOut } = reviewRows;
  let { plan: plan, preview: preview } = importPlanSoFar(open);
  let columnsLeftOutOfImport = importColumnsLeftOut(open, plan);
  let openQuestionIds = openImportQuestionIds(open);
  let questionOfColumn = (columnIndex?: Dynamic) =>
    questions.find(({ columns: columns }: Dynamic) => columns.includes(columnIndex));
  let isColumnQuestionOpen = (columnIndex?: Dynamic) => questionOfColumn(columnIndex)?.isOpen === true;
  let [keptColumns, setKeptColumns] = React.useState({
    of: open.plan,
    columns: reviewRows.columns,
  });
  let columnsKept = keptColumns.of === open.plan ? keptColumns.columns : [];
  let [planLookedInto, setPlanLookedInto] = React.useState(null);
  let textColumnsToLookInto = (
    planLookedInto === open.plan
      ? reviewRows.textColumnsYetToLookInto.filter((input?: Dynamic) => columnsKept.includes(input))
      : reviewRows.textColumnsYetToLookInto
  ).join();
  if (!isRead && planLookedInto !== open.plan && textColumnsToLookInto === '') setPlanLookedInto(open.plan);
  let askKindsWanted = React.useEffectEvent(onKindsWanted);
  let { kinds: kinds } = open;
  React.useEffect(() => {
    for (let columnIndex of (textColumnsToLookInto === '' ? [] : textColumnsToLookInto.split(',')) as Dynamic)
      if (kinds[Number(columnIndex)] === undefined) askKindsWanted(Number(columnIndex));
  }, [textColumnsToLookInto, kinds]);
  let columnsShown = [...new (Set as Dynamic)([...columnsKept, ...reviewRows.columns])].toSorted(
    (input?: Dynamic, options?: Dynamic) => input - options,
  );
  if (keptColumns.of !== open.plan || columnsShown.length !== keptColumns.columns.length)
    setKeptColumns({
      of: open.plan,
      columns: columnsShown,
    });
  let columnsToCheck = columnsShown
    .filter((input?: Dynamic) => !columnsLeftOutOfImport.includes(input))
    .flatMap((columnIndex?: Dynamic) => preview.columns.find((input?: Dynamic) => input.columnIndex === columnIndex) ?? []);
  let questionsWithoutColumn = questionsNotAboutColumns(
    questions,
    columnsToCheck.map(({ columnIndex: columnIndex }: Dynamic) => columnIndex),
  );
  let hasColumnsToCheck = columnsToCheck.length + questionsWithoutColumn.length > 0;
  let isAgentAtWorkSaid = useTrueAfterDelay(isRead, AGENT_AT_WORK_ANNOUNCE_DELAY_MS);
  let [hasBeenRead, setHasBeenRead] = React.useState(isRead);
  if (isRead && !hasBeenRead) setHasBeenRead(true);
  let isTurnSettled = useTrueAfterDelay(!isRead, SETTINGS_TURN_DELAY_MS);
  let [tabChosen, setTabChosen] = React.useState(null);
  let tab = tabChosen ?? 'settings';
  let [shownWordOfAgent, setShownWordOfAgent] = React.useState(wordOfAgent);
  if (shownWordOfAgent !== wordOfAgent) {
    setShownWordOfAgent(wordOfAgent);
    if (wordOfAgent !== null) setTabChosen('settings');
  }
  let tabsId = React.useId();
  let focusPropsOfTab = (focusTab?: Dynamic) => ({
    onFocus: () => setTabChosen(focusTab),
  });
  let tabPanelPropsOf = (panelTab?: Dynamic) =>
    isInTabs
      ? {
          ...focusPropsOfTab(panelTab),
          role: 'tabpanel',
          id: `${tabsId}-panel-${panelTab}`,
          'aria-labelledby': `${tabsId}-${panelTab}`,
          inert: tab !== panelTab,
          [BEHIND_OTHER_TAB_ATTRIBUTE]: tab !== panelTab || undefined,
        }
      : {
          role: 'presentation',
          ...focusPropsOfTab(panelTab),
        };
  let countDigits = String(
    (Math.max as Dynamic)(0, ...columnsToCheck.map(({ keptAsTextCount: keptAsTextCount }: Dynamic) => keptAsTextCount)),
  ).length;
  let [rowPointedAt, setRowPointedAt] = React.useState(null);
  let pointTimerRef = React.useRef(undefined);
  let lastPointedIdRef = React.useRef(null);
  let pointAtRow = React.useCallback(
    (rowId?: Dynamic, how?: Dynamic) => {
      if (how === 'pointer' && rowId === lastPointedIdRef.current) return;
      clearTimeout(pointTimerRef.current);
      lastPointedIdRef.current = rowId;
      let point = () => {
        setRowPointedAt(rowId);
        if (rowId === null) onNoRowPointedAt();
      };
      if (how === 'atOnce' || (how === 'caret' && rowId !== null)) point();
      else pointTimerRef.current = setTimeout(point, ROW_POINTING_DELAY_MS);
    },
    [onNoRowPointedAt],
  );
  React.useEffect(() => () => clearTimeout(pointTimerRef.current), []);
  let pointableRows = new (Map as Dynamic)([
    ...columnsToCheck.map(
      ({ columnIndex: columnIndex }: Dynamic) => [
        `column ${columnIndex}`,
        {
          columns: [columnIndex],
          unfolded: NOTHING_DRAWN_ANYWAY,
        },
      ],
    ),
    ...columnsLeftOut.map(
      (columnIndex?: Dynamic) => [
        `out ${columnIndex}`,
        {
          columns: [columnIndex],
          unfolded: columnsLeftOutOfImport.includes(columnIndex)
            ? {
                lines: [],
                columns: [columnIndex],
              }
            : NOTHING_DRAWN_ANYWAY,
        },
      ],
    ),
    ...linesLeftOut.map(
      (lineNumber?: Dynamic) => [
        `line ${lineNumber}`,
        {
          columns: NO_COLUMNS_POINTED_AT,
          unfolded: plan.linesLeftOut.includes(lineNumber)
            ? {
                lines: [lineNumber],
                columns: [],
              }
            : NOTHING_DRAWN_ANYWAY,
        },
      ],
    ),
  ]);
  let pointedRow = rowPointedAt === null ? undefined : pointableRows.get(rowPointedAt);
  let hasLinesUnfolded = (pointedRow?.unfolded.lines.length ?? 0) > 0 || hasPictureLinesUnfolded;
  let tellRowPointed = React.useEffectEvent((pointedRowKey?: Dynamic) => {
    onColumnsPointedAt(pointedRowKey === null ? NO_COLUMNS_POINTED_AT : (pointedRow?.columns ?? NO_COLUMNS_POINTED_AT));
    onLeftOutShown(pointedRow?.unfolded ?? NOTHING_DRAWN_ANYWAY);
  });
  let pointedKey = rowPointedAt === null ? null : `${rowPointedAt} ${pointedRow?.unfolded === NOTHING_DRAWN_ANYWAY}`;
  React.useEffect(() => tellRowPointed(pointedKey), [pointedKey]);
  let isOff = isRead || open.agent.kind === 'isAsked';
  let paneRef = React.useRef(null);
  let previewRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let previewElement = previewRef.current;
    if (previewElement === null) return;
    let measure = () =>
      onRoomMeasured({
        gridWidth: previewElement.clientWidth,
        gridHeight: previewElement.clientHeight,
      });
    measure();
    let observer = new (ResizeObserver as Dynamic)(measure);
    observer.observe(previewElement);
    return () => observer.disconnect();
  }, [onRoomMeasured]);
  let notes = importNotesToShow(open);
  let { summary: summary, isSummaryWhole: isSummaryWhole } = importPlanSoFar(open);
  let hasSummary = (isRead || summary !== null || notes.length > 0) && wordOfAgent === null;
  let turnClasses = importSectionTurnClasses({
    points: hasSummary && notes.length > 0,
    columnsToCheck: hasColumnsToCheck,
  });
  let { child: summaryRef, box: summaryBox } = useMinHeightSince(isRead || !hasSummary ? null : open.plansHeardCount);
  let sheetNoteWords = rowsAndColumnsLabel(importRecordCount(open), importColumnsComingInCount(open));
  let openCount =
    columnsToCheck.filter(({ columnIndex: columnIndex }: Dynamic) => isColumnQuestionOpen(columnIndex)).length +
    questionsWithoutColumn.filter(({ isOpen: isOpen }: Dynamic) => isOpen).length;
  let outcomeHeard = outcome?.heard ?? sheetNoteWords;
  let heardNow = openCount === 0 ? outcomeHeard : joinImportWordsWithMiddleDots([outcomeHeard, columnsToCheckLabel(openCount)]);
  let [heardAtReading, setHeardAtReading] = React.useState(null);
  if (isRead !== (heardAtReading === null)) setHeardAtReading(isRead ? null : heardNow);
  let [isHeardSaid, setHeardSaid] = React.useState(false);
  let hasHeardChanged = heardAtReading !== null && heardNow !== heardAtReading;
  if (isHeardSaid ? isRead : hasHeardChanged) setHeardSaid(!isHeardSaid);
  let { destinationChosen: destinationChosen } = open;
  let [destinationPicks, setDestinationPicks] = React.useState({
    destinationChosen: destinationChosen,
    timesPicked: 0,
  });
  if (destinationPicks.destinationChosen !== destinationChosen) {
    setDestinationPicks({
      destinationChosen: destinationChosen,
      timesPicked: destinationPicks.timesPicked + (destinationChosen === null ? 0 : 1),
    });
    if (destinationChosen !== null && !isRead) setHeardSaid(true);
  }
  let { timesPicked: timesPicked } = destinationPicks;
  let [lastChange, setLastChange] = React.useState(null);
  if (isOff && lastChange !== null) setLastChange(null);
  let outcomeAnnouncement = useSettledAnnouncement({
    words: (isHeardSaid || hasHeardChanged) && heardNow,
    timesSaid: timesPicked,
    inPageOf: paneRef,
  });
  let changeAnnouncement = useSettledAnnouncement({
    words: columnsNamedWords(lastChange, preview.columns),
    timesSaid: lastChange?.times ?? 0,
    inPageOf: paneRef,
  });
  let changeByHand = (change?: Dynamic) => {
    setLastChange((input?: Dynamic) => columnsAskedAgainAfterChange(input, change));
    onChangedByHand(change);
  };
  let answerQuestion = (questionId?: Dynamic, answer?: Dynamic) => {
    let columnsOfQuestion = questions.find((input?: Dynamic) => input.questionId === questionId)?.columns ?? [];
    setLastChange((input?: Dynamic) => askedAgainColumns(input, columnsOfQuestion));
    onAnswered(questionId, answer);
  };
  let focusAfterAddBackRef = React.useRef(null);
  let changeColumn = (change?: Dynamic) => {
    if (change.kind === 'column' && change.isLeftOut === true) focusAfterAddBackRef.current = columnNthLabel(change.columnIndex + 1);
    changeByHand(change);
  };
  React.useEffect(() => {
    if (focusAfterAddBackRef.current === null) return;
    let addBackButton = paneRef.current?.querySelector(`[${ADDS_BACK_ATTRIBUTE}="${CSS.escape(focusAfterAddBackRef.current)}"]`);
    if (addBackButton === null || addBackButton === undefined) return;
    focusAfterAddBackRef.current = null;
    addBackButton.focus();
  });
  let hasPlacesLeft = importPlacesLeft(open).length > 0;
  let isChangesToASheet = importDestinationSort(open) === 'changesToASheet';
  let linesLeftOutShown = isChangesToASheet ? [] : linesLeftOut;
  let columnsLeftOutShown = [
    ...columnsLeftOut.map(
      (columnIndex?: Dynamic) => ({
        columnIndex: columnIndex,
        nameTheSheetLacks: null,
      }),
    ),
    ...(isRead ? [] : columnsLeftOutOfSheetChanges(open))
      .filter(({ columnIndexInTheFile: columnIndexInTheFile }: Dynamic) => !columnsLeftOut.includes(columnIndexInTheFile))
      .map(
        ({ columnIndexInTheFile: columnIndexInTheFile, name: name }: Dynamic) => ({
          columnIndex: columnIndexInTheFile,
          nameTheSheetLacks: name,
        }),
      ),
  ].toSorted((input?: Dynamic, options?: Dynamic) => input.columnIndex - options.columnIndex);
  let nameSheet = (sheetName?: Dynamic) =>
    changeByHand({
      kind: 'sheetName',
      name: sheetName,
    });
  let lineTextOf = (lineNumber?: Dynamic) =>
    (open.table.lines[lineNumber - 1] ?? []).filter((input?: Dynamic) => input.trim() !== '').join(', ');
  let wishArea =
    wishToAgent !== null &&
    jsxs(Fragment, {
      children: [
        isRead &&
          jsx('div', {
            className: 'flex min-h-6 items-center ps-px text-footnote',
            children: agentAtWork,
          }),
        jsx('div', {
          className: 'flex flex-col gap-sm',
          children: wishToAgent,
        }),
      ],
    });
  return jsxs(TooltipGroup, {
    children: [
      isInTabs &&
        jsx(Tabs.Root, {
          value: tab,
          onValueChange: (input?: Dynamic) => setTabChosen(input),
          onFocus: () => setTabChosen((input?: Dynamic) => input ?? tab),
          className: 'shrink-0 pb-md',
          children: jsxs(Tabs.List, {
            flush: true,
            'aria-label': importReviewMessages.settingsOrPreview(),
            children: [
              jsx(Tabs.Tab, {
                value: 'settings',
                id: `${tabsId}-settings`,
                'aria-controls': `${tabsId}-panel-settings`,
                children: importReviewMessages.settingsTab(),
              }),
              jsx(Tabs.Tab, {
                value: 'preview',
                id: `${tabsId}-preview`,
                'aria-controls': `${tabsId}-panel-preview`,
                children: importReviewMessages.previewTab(),
              }),
            ],
          }),
        }),
      jsxs('div', {
        role: 'presentation',
        className: 'sheet-import-in-dialog -mx-[var(--ui-pad-xl)]',
        'data-is-in-tabs': isInTabs || undefined,
        children: [
          jsxs('div', {
            ref: previewRef,
            ...tabPanelPropsOf('preview'),
            className: PICTURE_BOX_CLASS,
            children: [
              proposal,
              picture !== null &&
                jsx(ImportHeadingsRow, {
                  open: open,
                  picture: picture,
                  place: PICTURE_ORIGIN,
                  zoom: zoom,
                  columnsRevealed: columnsRevealed,
                  columnsUnfolded: columnsUnfolded,
                  onKindsWanted: onKindsWanted,
                  onChangedByHand: changeByHand,
                  onColumnWanted: onColumnWanted,
                }),
              picture !== null &&
                !hasLinesUnfolded &&
                jsx(ImportRowNumbers, {
                  open: open,
                  picture: picture,
                  lastRow: lastRow,
                  place: PICTURE_ORIGIN,
                  zoom: zoom,
                  onChangedByHand: isOff ? null : (input?: Dynamic) => (isPlanDrawn ? changeByHand(input) : undefined),
                }),
              shimmer,
            ],
          }),
          jsx('div', {
            ...tabPanelPropsOf('settings'),
            className: IMPORT_PANE_CLASS,
            'data-is-read': isRead || undefined,
            'data-comes-in-turn': (hasBeenRead && !isRead && !isTurnSettled) || undefined,
            children: jsxs(SidePane, {
              ref: paneRef,
              title: importDialogLabels.importTitle(),
              takesNoTyping: false,
              width: SIDE_PANE_DEFAULT_WIDTH,
              onWidthChange: () => {
                return;
              },
              onClose: () => {
                return;
              },
              onKeyDown: () => {
                return;
              },
              wasPointerPressedLast: () => false,
              ...(wishArea !== false &&
                !isInTabs && {
                  foot: wishArea,
                }),
              children: [
                jsx('div', {
                  role: 'presentation',
                  className: 'shrink-0',
                  style: summaryBox,
                  children: jsxs('div', {
                    ref: summaryRef,
                    role: 'presentation',
                    className: 'flex flex-col',
                    children: [
                      hasSummary &&
                        jsx(AgentsReadSection, {
                          summary: summary,
                          isSummaryWhole: isSummaryWhole,
                          isPlanIn: !isRead,
                          notes: notes,
                          agentAtWorkInWords: agentAtWorkInWords,
                        }),
                      wordOfAgent !== null &&
                        jsx(AgentsReadFailed, {
                          why: wordOfAgent,
                          onAskedAgain: onAskedAgain,
                        }),
                    ],
                  }),
                }),
                jsxs(PaneSection, {
                  title: importDialogLabels.sheet(),
                  className: `sheet-import-is-there-from-the-start sheet-import-waits-for-agent border-t-0! ${turnClasses.sheet}`,
                  ...(!isRead && paneSectionNoteActions(sheetNoteWords)),
                  children: [
                    !hasPlacesLeft &&
                      jsx(PaneRow, {
                        label: importSettingsLabels.name(),
                        children: jsx(NewSheetNameField, {
                          name: open.newSheet?.name ?? '',
                          isOff: isOff,
                          onNamed: nameSheet,
                        }),
                      }),
                    jsx(PaneRow, {
                      label: importSettingsLabels.headings(),
                      children: jsx(HeadingsLineSelect, {
                        table: open.table,
                        headerLine: plan.headerLine,
                        linesLeftOut: plan.linesLeftOut,
                        isOff: isOff,
                        onPicked: (destination?: Dynamic) =>
                          changeByHand({
                            kind: 'headings',
                            line: destination,
                          }),
                      }),
                    }),
                    hasPlacesLeft &&
                      jsx(ImportDestinationRows, {
                        open: open,
                        isRead: isRead,
                        onPicked: onDestinationPicked,
                        onSheetNamed: nameSheet,
                      }),
                    isChangesToASheet &&
                      importLinesLeftOut(open).lines.length > 0 &&
                      jsx(LeftOutLinesMenu, {
                        open: open,
                        isOff: isOff,
                        onSet: (columnIndex?: Dynamic, columnKinds?: Dynamic) =>
                          changeByHand({
                            kind: 'line',
                            line: columnIndex,
                            isLeftOut: columnKinds,
                          }),
                      }),
                  ],
                }),
                !isRead &&
                  hasColumnsToCheck &&
                  jsxs(PaneSection, {
                    title: importDialogLabels.columnsToCheck(),
                    className: turnClasses.columnsToCheck,
                    children: [
                      columnsToCheck.map((column?: Dynamic) => {
                        let { columnIndex: columnIndex, name: columnName } = column;
                        let questionOfThisColumn = questionOfColumn(columnIndex);
                        let questionFirstHere =
                          reviewRows.columns.find(
                            (questionColumn?: Dynamic) => questionOfThisColumn?.columns.includes(questionColumn) === true,
                          ) === columnIndex
                            ? questionOfThisColumn
                            : undefined;
                        let question =
                          questionFirstHere === undefined
                            ? undefined
                            : plan.questions.find(({ id: id }: Dynamic) => id === questionFirstHere.questionId);
                        let dateOrderReadings = questionFirstHere === undefined ? null : dateOrderReadingsOfAsk(questionFirstHere, open);
                        let textCellsNote = column.reading.kind === 'text' ? betterReadingForTextColumn(open.kinds[columnIndex]) : null;
                        return jsx(
                          PointableImportRow,
                          {
                            id: `column ${columnIndex}`,
                            onPointedAt: pointAtRow,
                            children:
                              question !== undefined && dateOrderReadings === null
                                ? jsx(ImportQuestionRow, {
                                    open: open,
                                    plan: plan,
                                    question: question,
                                    examples: importQuestionExamples(open, question.id),
                                    isOpen: openQuestionIds.includes(question.id),
                                    isOff: isOff,
                                    isShortInBox: true,
                                    cellsThatStayText: {
                                      columnIndex: columnIndex,
                                      count: column.keptAsTextCount,
                                      first: firstTextCells.get(columnIndex) ?? NO_FIRST_TEXT_CELLS_IN_REVIEW,
                                      digits: countDigits,
                                    },
                                    onAnswered: (answer?: Dynamic) => answerQuestion(question.id, answer),
                                  })
                                : jsxs(Fragment, {
                                    children: [
                                      jsx(PaneRow, {
                                        label: columnName,
                                        labelInFull: columnName,
                                        hasDot: isColumnQuestionOpen(columnIndex),
                                        children: jsx(ColumnKindMenu, {
                                          column: column,
                                          kinds: open.kinds[columnIndex],
                                          isLeftOut: columnsLeftOutOfImport.includes(columnIndex),
                                          mustComeIn:
                                            columnIndex === importMergeKeyColumn(open) ||
                                            columnsLeftOutOfImport.length === open.table.columnCount - 1,
                                          isTabStop: null,
                                          isLeftOpen: isColumnQuestionOpen(columnIndex),
                                          onKindsWanted: onKindsWanted,
                                          onChanged: isOff ? null : changeColumn,
                                          nameField: null,
                                          noteUnderText:
                                            textCellsNote === null
                                              ? null
                                              : cellsFitFormatWords(
                                                  textCellsNote.fitting,
                                                  textCellsNote.fitting + textCellsNote.notFitting,
                                                  columnReadingKindLabel(textCellsNote.reading.kind),
                                                ),
                                          digitsOfCountInBox: countDigits,
                                          firstTextCells: firstTextCells.get(columnIndex) ?? NO_FIRST_TEXT_CELLS_IN_REVIEW,
                                        }),
                                      }),
                                      questionFirstHere !== undefined &&
                                        question !== undefined &&
                                        dateOrderReadings !== null &&
                                        jsx(DateOrderSegmentedRow, {
                                          asked: questionFirstHere,
                                          readings: dateOrderReadings,
                                          inForce: open.answers[question.id] ?? question.recommendedIndex,
                                          isOff: isOff,
                                          onAnswered: answerQuestion,
                                        }),
                                    ],
                                  }),
                          },
                          columnIndex,
                        );
                      }),
                      questionsWithoutColumn.map(({ questionId: questionId }: Dynamic) => {
                        let question = plan.questions.find(({ id: id }: Dynamic) => id === questionId);
                        return question === undefined
                          ? null
                          : jsx(
                              ImportQuestionRow,
                              {
                                open: open,
                                plan: plan,
                                question: question,
                                examples: importQuestionExamples(open, questionId),
                                isOpen: openQuestionIds.includes(questionId),
                                isOff: isOff,
                                isShortInBox: true,
                                onAnswered: (answer?: Dynamic) => answerQuestion(questionId, answer),
                              },
                              questionId,
                            );
                      }),
                    ],
                  }),
                columnsLeftOutShown.length + linesLeftOutShown.length > 0 &&
                  jsxs(PaneSection, {
                    title: importSettingsLabels.leftOut(),
                    className: turnClasses.leftOut,
                    children: [
                      columnsLeftOutShown.map(
                        ({ columnIndex: columnIndex, nameTheSheetLacks: nameTheSheetLacks }: Dynamic) =>
                          nameTheSheetLacks === null
                            ? jsx(
                                PointableImportRow,
                                {
                                  id: `out ${columnIndex}`,
                                  onPointedAt: pointAtRow,
                                  children: jsx(LeftOutAddBackRow, {
                                    where: columnNthLabel(columnIndex + 1),
                                    what: reviewRows.columnsThatAreEmpty.includes(columnIndex)
                                      ? importDialogLabels.empty()
                                      : (plan.columns[columnIndex]?.name ?? ''),
                                    addBack: addBackColumnLabel(columnIndex + 1),
                                    isOff: isOff,
                                    onAddedBack: () =>
                                      changeByHand({
                                        kind: 'column',
                                        columnIndex: columnIndex,
                                        isLeftOut: false,
                                      }),
                                  }),
                                },
                                columnIndex,
                              )
                            : jsx(
                                ColumnSheetLacksRow,
                                {
                                  where: columnNthLabel(columnIndex + 1),
                                  what: nameTheSheetLacks,
                                  whyInShort: notInSheetLabel(sheetToImportInto(open)?.table.name ?? ''),
                                  why: columnsNotImportedWords([nameTheSheetLacks], sheetToImportInto(open)?.table.name ?? ''),
                                },
                                columnIndex,
                              ),
                      ),
                      linesLeftOutShown.map(
                        (lineNumber?: Dynamic) =>
                          jsx(
                            PointableImportRow,
                            {
                              id: `line ${lineNumber}`,
                              onPointedAt: pointAtRow,
                              children: jsx(LeftOutAddBackRow, {
                                where: importLineLabel(lineNumber),
                                what: lineTextOf(lineNumber),
                                addBack: addBackLineLabel(lineNumber),
                                isOff: isOff,
                                onAddedBack: () =>
                                  changeByHand({
                                    kind: 'line',
                                    line: lineNumber,
                                    isLeftOut: false,
                                  }),
                              }),
                            },
                            lineNumber,
                          ),
                      ),
                    ],
                  }),
              ],
            }),
          }),
        ],
      }),
      jsx(LiveAnnouncer, {
        words: isAgentAtWorkSaid && agentAtWorkInWords,
      }),
      jsx(LiveAnnouncer, {
        words: isRead && isSummaryWhole && summary !== null && summaryByAgentLabel(summary),
      }),
      jsx(LiveAnnouncer, {
        ...outcomeAnnouncement,
      }),
      jsx(LiveAnnouncer, {
        ...changeAnnouncement,
      }),
      isInTabs &&
        underBothTabs !== null &&
        jsx('div', {
          className: '-mx-[var(--ui-pad-xl)] shrink-0 border-t border-alpha-2 px-xl py-md',
          children: underBothTabs,
        }),
      isInTabs &&
        wishArea !== false &&
        jsx('div', {
          className: '-mx-[var(--ui-pad-xl)] flex shrink-0 flex-col gap-sm border-t border-alpha-2 bg-surface-panel px-xl py-md',
          children: wishArea,
        }),
      jsx('div', {
        className: '-mx-[var(--ui-pad-xl)] -mb-[var(--ui-pad-xl)] shrink-0 border-t border-alpha-2 px-xl py-md',
        children: jsx(Dialog.Footer, {
          align: 'end',
          className: 'mt-0',
          children: jsxs('div', {
            role: 'presentation',
            className: 'flex flex-1 items-center justify-between gap-lg max-sm:flex-col max-sm:items-stretch max-sm:gap-sm',
            onPointerEnter: () => pointAtRow(null, 'atOnce'),
            onFocus: () => pointAtRow(null, 'atOnce'),
            children: [
              jsx(Dialog.Description, {
                className: 'mt-0 min-w-0 text-balance',
                children: jsx(ImportFooterSentence, {
                  sentence: importFooterSentence(isInTabs ? tab : null, errorForPicture, outcome),
                  isHeldBack: isImportFooterSentenceHeldBack(isInTabs ? tab : null, errorForPicture, isRead),
                }),
              }),
              jsxs('div', {
                className: 'flex shrink-0 items-center justify-end gap-sm',
                children: [
                  jsx(Button, {
                    variant: 'secondary',
                    onClick: onDiscarded,
                    children: importDialogLabels.discard(),
                  }),
                  keepButton,
                ],
              }),
            ],
          }),
        }),
      }),
    ],
  });
}
export const NO_COLUMNS_POINTED_AT: Dynamic = [];
export const ROW_POINTING_DELAY_MS = 200;
export const SETTINGS_TURN_DELAY_MS = 1200;
export const importTurnClass = (turn?: Dynamic) => (turn === 0 ? '' : `sheet-import-turn-${turn}`);
export const HEADING_FORMAT_ROOM_PX = 48;
export const headingTextWidthCache = new (Map as Dynamic)();
export const NO_IMPORT_REVIEW_ROWS = {
  questions: [],
  columns: [],
  textColumnsYetToLookInto: [],
  columnsLeftOut: [],
  columnsThatAreEmpty: [],
  linesLeftOut: [],
};
export const NO_FIRST_TEXT_CELLS_IN_REVIEW: Dynamic = [];
export const paneSectionNoteActions = (note?: Dynamic) => ({
  actions: jsx('span', {
    className: 'text-footnote text-secondary',
    children: note,
  }),
});
export const PointableImportRow = ({ id: id, onPointedAt: onPointedAt, children: children }: Dynamic) =>
  jsx('div', {
    role: 'presentation',
    onPointerMove: () => onPointedAt(id, 'pointer'),
    onPointerLeave: () => onPointedAt(null, 'pointer'),
    onFocus: () => onPointedAt(id, 'caret'),
    onBlur: () => onPointedAt(null, 'caret'),
    children: children,
  });
export const DATE_AND_DECIMAL_ORDERS = ['yearMonthDay', 'monthDayYear', 'dayMonthYear', 'comma', 'point'];
export const dateOrDecimalOrderRank = (reading?: Dynamic) =>
  reading === undefined
    ? -1
    : DATE_AND_DECIMAL_ORDERS.indexOf('order' in reading ? reading.order : 'decimalSign' in reading ? reading.decimalSign : '');
export const ADDS_BACK_ATTRIBUTE = 'data-adds-back';
export const IMPORT_PANE_CLASS = 'sheet-import-pane';
export const BEHIND_OTHER_TAB_ATTRIBUTE = 'data-is-behind-the-other-tab';
export const PICTURE_BOX_ENABLED_BUTTONS_SELECTOR = `.${PICTURE_BOX_CLASS}:not([${BEHIND_OTHER_TAB_ATTRIBUTE}]) button:enabled`;
export const IMPORT_PANE_ENABLED_BUTTONS_SELECTOR = `.${IMPORT_PANE_CLASS}:not([${BEHIND_OTHER_TAB_ATTRIBUTE}]) button:enabled`;
export const importFooterSentence = (tab?: Dynamic, errorForPicture?: Dynamic, outcome?: Dynamic) =>
  tab !== null && errorForPicture !== null
    ? errorForPicture
    : (outcome?.atTheFoot ?? (errorForPicture !== null ? '' : importDialogLabels.whatToDo()));
export const isImportFooterSentenceHeldBack = (tab?: Dynamic, errorForPicture?: Dynamic, isRead?: Dynamic) =>
  tab !== null && errorForPicture !== null ? tab === 'preview' : isRead;
export const ImportFooterSentence = ({ sentence: sentence, isHeldBack: isHeldBack }: Dynamic) =>
  isHeldBack
    ? jsx('span', {
        'aria-hidden': true,
        className: 'invisible',
        children: sentence,
      })
    : jsx('span', {
        className: 'sheet-import-comes block',
        children: sentence,
      });
export const AGENT_AT_WORK_ANNOUNCE_DELAY_MS = 1500;
export const NOTHING_TO_ANNOUNCE = {
  words: false,
  timesSaid: 0,
};
