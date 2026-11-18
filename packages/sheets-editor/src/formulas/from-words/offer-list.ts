import { AgentMark } from '../../kit/agent-mark.tsx';
import { ShimmerText } from '../../kit/shimmer-text.tsx';
import { useUiWindow } from '../../kit/theme.tsx';
import { Tooltip } from '../../kit/tooltip.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { isOfferLitOnItsOwn, formulaReadForOffer, isReadingHighlighted, isOfferEmptyWithoutAgent } from './offer.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import {
  reportTimeAfterNextPaint,
  isWithinClickAfterUp,
  getLastPointerPoint,
  isPointerStillAt,
  listAnswerSettlesAtMs,
  LIST_ANSWER_SETTLE_MS,
  useLastNonNull,
  ListRow,
  ListRowQuietText,
  ListUnderCell,
  ListSeparator,
  ListHeading,
} from '../../ui/list-under-cell.ts';
import { useSpentInputGuard } from '../../ui/ask-list/spent-input-guard.ts';
import {
  writeThisFormulaLabel,
  keepTypingLabel,
  writingFormulaWords,
  keepFormulaLabel,
  formulaResultPreview,
  discardFormulaLabel,
  escapeKeyHint,
  writingFormulaForWords,
  formulaReadingHint,
  twoFormulaReadingsHint,
  formulaNotWrittenWords,
  notAFormulaHint,
  agentWritingFormulaWords,
  agentWroteFormulaWords,
  agentWroteOneFormulaWords,
  formulaNotWrittenReason,
  formulaOfferGoneWords,
  stopWritingFormulaLabel,
  formulaOptionsLabel,
} from '../../messages/formula-writing.ts';
import { tabKeyLabel } from '../../i18n/menu-labels.ts';
import { FUNCTION_POINT_DELAY_MS, functionRowAnchor, useCaretAnchor } from '../function-list.ts';
import { proposedFixesOf } from './actions.ts';
import { useCoveredUnderCells, popupCollisionPadding } from '../../shell/bottom-insets.ts';
import { cellEntryBoxStyle, entryGridlineOverlap } from '../../grid/grid-drawing.ts';
import { paintDataAttributes, entryFontStyle, fillPaintStyle, textPaintStyle } from '../../grid/cell-drawing.ts';
import { LiveAnnouncer } from '../../ui/live-announcer.ts';
import { StopKeyHint } from '../../agent/agent-rows.ts';
import { isPressTaken } from '../../ui/ask-agent-to-fix-button.ts';
import { describeFunction } from '../function-help.ts';
import { entryEditorOf } from '../../dom/entry-editor.ts';
export function highlightedOfferRowId(offer?: Dynamic) {
  if (isOfferLitOnItsOwn(offer)) return null;
  if (offer?.kind === 'offered' && offer.isDrawn) return FORMULA_OFFER_ROW_IDS[offer.highlighted];
  if (offer?.kind !== 'proposed') return null;
  if (offer.isDiscardHighlighted) return FORMULA_KEEP_TYPING_ROW_ID;
  if (offer.isArriving) return null;
  return fixRowId(
    Math.max(
      0,
      (offer.fixes ?? []).findIndex(({ formula: formula }: Dynamic) => formula === offer.formula),
    ),
  );
}
export function OfferWand({ kind: kind }: Dynamic) {
  let [wand, setWand] = React.useState({
    of: kind,
    isOver: false,
  });
  if (wand.of !== kind)
    setWand({
      of: kind,
      isOver: false,
    });
  let [startState, endState] = OFFER_WAND_STATES[kind];
  return jsx('span', {
    'aria-hidden': true,
    className: 'flex shrink-0 items-center text-agent',
    children: jsx(AgentMark, {
      size: 14,
      state: wand.of === kind && wand.isOver ? endState : startState,
      onEnd: () =>
        setWand({
          of: kind,
          isOver: true,
        }),
    }),
  });
}
export function WordsInTurn({ words: words, isShimmering: isShimmering, takeAPlace: takeAPlace, doWordsWrap = false }: Dynamic) {
  let [turn, setTurn] = React.useState({
    now: words,
    before: null,
  });
  if (turn.now !== words)
    setTurn({
      now: words,
      before: takeAPlace ? turn.now : null,
    });
  let wordsBefore = turn.now === words ? turn.before : null;
  let wordsRef = React.useRef(null);
  let leftBeforeRef = React.useRef(null);
  React.useLayoutEffect(() => {
    leftBeforeRef.current = wordsRef.current?.offsetLeft ?? null;
  });
  return jsxs('span', {
    ref: wordsRef,
    className: doWordsWrap ? 'relative wrap-anywhere whitespace-normal' : 'relative shrink-0 grow whitespace-nowrap',
    children: [
      wordsBefore !== null &&
        jsx(
          'span',
          {
            ref: (element?: Dynamic) => {
              if (prefersReducedMotionAt(element))
                setTurn({
                  now: words,
                  before: null,
                });
              let shift = (leftBeforeRef.current ?? 0) - (wordsRef.current?.offsetLeft ?? leftBeforeRef.current ?? 0);
              if (element !== null && shift !== 0) element.style.translate = `${String(shift)}px`;
            },
            'aria-hidden': true,
            className: 'sheet-words-that-go',
            onAnimationEnd: () =>
              setTurn({
                now: words,
                before: null,
              }),
            children: wordsBefore,
          },
          wordsBefore,
        ),
      jsx(
        'span',
        {
          className: wordsBefore === null ? undefined : 'sheet-words-in-turn',
          children: isShimmering
            ? jsx(ShimmerText, {
                children: words,
              })
            : words,
        },
        words,
      ),
    ],
  });
}
export function formulaArgumentChunks(formula?: Dynamic) {
  let chunks: Dynamic = [];
  let chunkStart: Dynamic = 0;
  let isInQuotes: Dynamic = false;
  for (let at: Dynamic = 0; at < formula.length; at += 1) {
    let char = formula[at];
    if (char === '"') isInQuotes = !isInQuotes;
    else if (!isInQuotes && (char === '(' || char === ',' || char === ';')) {
      chunks.push({
        text: formula.slice(chunkStart, at + 1),
        start: chunkStart,
      });
      chunkStart = at + 1;
    }
  }
  if (chunkStart < formula.length)
    chunks.push({
      text: formula.slice(chunkStart),
      start: chunkStart,
    });
  return chunks;
}
export function formulaTermChunks(formula?: Dynamic) {
  let chunks: Dynamic = [];
  let chunkStart: Dynamic = 0;
  let depth: Dynamic = 0;
  let isInQuotes: Dynamic = false;
  for (let at: Dynamic = 0; at < formula.length; at += 1) {
    let char = formula[at];
    if (char === '"') isInQuotes = !isInQuotes;
    else if (isInQuotes) continue;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === '+' && depth === 0 && at > chunkStart) {
      chunks.push({
        text: formula.slice(chunkStart, at),
        start: chunkStart,
      });
      chunkStart = at;
    }
  }
  chunks.push({
    text: formula.slice(chunkStart),
    start: chunkStart,
  });
  return chunks;
}
export function FormulaAndResult({ formula: formula, result: result, isResultHidden = false }: Dynamic) {
  return jsxs('span', {
    className: 'flex min-w-0 flex-1 flex-wrap items-center gap-x-2',
    children: [
      jsx('span', {
        className: 'min-w-0',
        children: formulaTermChunks(formula).map(
          (term?: Dynamic) =>
            jsx(
              'span',
              {
                className: 'inline-block max-w-full',
                children: formulaArgumentChunks(term.text).map(
                  ({ text: chunkText, start: start }: Dynamic) =>
                    jsx(
                      'span',
                      {
                        className: 'inline-block max-w-full [overflow-wrap:anywhere] whitespace-pre-wrap',
                        children: chunkText,
                      },
                      start,
                    ),
                ),
              },
              term.start,
            ),
        ),
      }),
      jsx('span', {
        className: isResultHidden
          ? 'sheet-quiet-text-in-row invisible ms-auto min-w-0 truncate text-secondary tabular-nums'
          : 'sheet-quiet-text-in-row ms-auto min-w-0 truncate text-secondary tabular-nums',
        children: result,
      }),
    ],
  });
}
export function useOfferPressGuard(stands?: Dynamic, boxRef?: Dynamic, onHeld?: Dynamic) {
  let ownWindow = useUiWindow();
  let nowMs = () => (ownWindow ?? globalThis).performance.now();
  let shownRef = React.useRef({
    stand: null,
    atMs: Number.NEGATIVE_INFINITY,
  });
  React.useLayoutEffect(() => {
    if (shownRef.current.stand === stands) return;
    return reportTimeAfterNextPaint(ownWindow, (atMs?: Dynamic) => {
      shownRef.current = {
        stand: stands,
        atMs: atMs,
      };
    });
  }, [stands, ownWindow]);
  let fieldRef = React.useRef(null);
  let { onButtonsMoved: onButtonsMoved, ...guard } = useSpentInputGuard({
    box: boxRef,
    field: fieldRef,
    stands: stands ?? 'otherwise',
  });
  let isAgentWriting = stands === 'whileAgentWrites';
  React.useEffect(() => {
    let boxWindow = boxRef.current?.ownerDocument.defaultView ?? null;
    if (!isAgentWriting || boxWindow === null) return;
    return afterTwoFrames(boxWindow, onButtonsMoved);
  });
  let isGuarding = stands !== null;
  let { forget: forget } = guard;
  React.useLayoutEffect(() => {
    if (!isGuarding) forget();
  }, [isGuarding, forget]);
  let isPressSpent = (event?: Dynamic, isByMouse?: Dynamic) =>
    guard.isPressSpent({
      clientX: event.clientX,
      clientY: event.clientY,
      isByMouse: isByMouse,
      wentDownAtMs: nowMs(),
      shownAtMs: shownRef.current.atMs,
    });
  let pressRef = React.useRef(null);
  let isRunFromAskRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (isAgentWriting) isRunFromAskRef.current = true;
  }, [isAgentWriting]);
  return {
    onPointerDownCapture: (event?: Dynamic) => {
      if (!event.isPrimary || event.button !== 0) return;
      pressRef.current = {
        wentDownAtMs: nowMs(),
        isMeantForStop: isPressSpent(event, event.pointerType === 'mouse'),
      };
    },
    onPointerMoveCapture: (event?: Dynamic) => {
      onButtonsMoved();
      guard.onPointerMoved(event);
    },
    onPointerCancelCapture: () => {
      pressRef.current = null;
      forget();
    },
    onTransitionEndCapture: onButtonsMoved,
    onClickCapture: (event?: Dynamic) => {
      let atMs = nowMs();
      let press = pressRef.current !== null && isWithinClickAfterUp(pressRef.current.wentDownAtMs, atMs) ? pressRef.current : null;
      pressRef.current = null;
      if (event.detail <= 1) isRunFromAskRef.current = !isAgentWriting;
      if (
        !isClickToHold({
          isMeantForStop: press?.isMeantForStop ?? isPressSpent(event, false),
          isAgentWriting: isAgentWriting,
          isOfRunThatAsked: event.detail > 1 && isRunFromAskRef.current,
          rowsShownAtMs: shownRef.current.atMs,
          wentDownAtMs: press?.wentDownAtMs ?? null,
          atMs: atMs,
        })
      )
        return;
      event.stopPropagation();
      onHeld();
    },
  };
}
export function fixRowsClickWatch() {
  let pointWhenRowsCame: Dynamic = null;
  let isNextClickDropped: Dynamic = false;
  return {
    rowsCame: (haveCome?: Dynamic) => {
      pointWhenRowsCame = haveCome ? getLastPointerPoint() : null;
    },
    pointerMoved: () => {
      if (!isPointerStillAt(pointWhenRowsCame)) pointWhenRowsCame = null;
    },
    pressWentDown: ({ pointerType: pointerType, buttons: buttons }: Dynamic, isOnFirstRow?: Dynamic) => {
      isNextClickDropped = !isOnFirstRow && pointerType === 'mouse' && buttons !== 0 && isPointerStillAt(pointWhenRowsCame);
    },
    isClickDropped: () => {
      let isDropped = isNextClickDropped;
      isNextClickDropped = false;
      return isDropped;
    },
  };
}
export function offerRowsOf(stage?: Dynamic, dispatch?: Dynamic) {
  switch (stage.kind) {
    case 'offered':
      return [
        {
          words: writeThisFormulaLabel(),
          onChosen: () =>
            dispatch({
              kind: 'formulaOfferRowChosen',
              row: 'write',
            }),
        },
        {
          words: keepTypingLabel(),
          ...(stage.isDrawn &&
            stage.hasRested === true && {
              hint: tabKeyLabel(),
            }),
          onChosen: () =>
            dispatch({
              kind: 'formulaOfferRowChosen',
              row: 'keepTyping',
            }),
        },
      ];
    case 'asked':
      return [
        {
          words: writingFormulaWords(),
          isShimmering: true,
          isStopAtEnd: true,
          onChosen: () =>
            dispatch({
              kind: 'formulaAskStopped',
            }),
        },
        {
          words: keepTypingLabel(),
          onChosen: null,
        },
      ];
    case 'proposed':
      return [
        fixRowsOf(stage, dispatch)[0] ??
          (stage.isArriving
            ? {
                words: keepFormulaLabel(),
                onChosen: null,
              }
            : {
                words: keepFormulaLabel(),
                detail: formulaResultPreview(stage.value.shown) ?? undefined,
                onChosen: () =>
                  dispatch({
                    kind: 'formulaOfAgentKept',
                  }),
              }),
        {
          words: discardFormulaLabel(),
          hint: escapeKeyHint(),
          onChosen: () =>
            dispatch({
              kind: 'wordsOfFormulaAskedBack',
            }),
        },
      ];
  }
}
export function afterTwoFrames(ownWindow?: Dynamic, callback?: Dynamic) {
  let cancel = () => {
    ownWindow.cancelAnimationFrame(frame);
    ownWindow.clearTimeout(timer);
  };
  let callOnce = () => {
    cancel();
    callback();
  };
  let frame: Dynamic = ownWindow.requestAnimationFrame(() => {
    frame = ownWindow.requestAnimationFrame(callOnce);
  });
  let timer = ownWindow.setTimeout(callOnce, TWO_FRAMES_FALLBACK_MS);
  return cancel;
}
export function FixDescriptionTip({ stage: stage, pointed: pointed, isRoomBeside: isRoomBeside, inPage: inPage }: Dynamic) {
  let pointedRow = pointed !== null && pointed.in === stage ? pointed.atRow : null;
  let [settledRow, setSettledRow] = React.useState(null);
  React.useEffect(() => {
    let timer = setTimeout(() => setSettledRow(pointedRow), pointedRow === null ? 0 : FUNCTION_POINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pointedRow]);
  let fixes = proposedFixesOf({
    stage: stage,
  });
  let highlightedIndex = fixes.findIndex((fix?: Dynamic, index?: Dynamic) => fixRowId(index) === highlightedOfferRowId(stage));
  let shownIndex = pointedRow !== null && settledRow === pointedRow ? pointedRow : highlightedIndex;
  let description = setApartDescription(fixes[shownIndex]?.setApartBy);
  let coveredUnderCells = useCoveredUnderCells();
  let anchor = React.useMemo(
    () => (description === null ? null : functionRowAnchor(fixRowId(shownIndex), inPage)),
    [description, shownIndex, inPage],
  );
  if (anchor === null || description === null) return null;
  return jsx(Tooltip, {
    anchor: anchor,
    open: isRoomBeside,
    side: 'right',
    align: 'start',
    sideOffset: 8,
    collisionPadding: popupCollisionPadding(coveredUnderCells),
    collisionAvoidance: {
      fallbackAxisSide: 'none',
    },
    className: 'max-w-[194px]',
    content: jsx('span', {
      'aria-hidden': true,
      children: description,
    }),
  });
}
export function WaitForFormula({ stage: stage }: Dynamic) {
  if (stage?.kind !== 'asked') return null;
  return jsx('span', {
    'aria-hidden': true,
    className: 'sheet-wait-for-formula',
    children: jsx(ShimmerText, {
      children: stage.isFix === true ? writingFormulaWords() : writingFormulaForWords(stage.words.slice(1).trim()),
    }),
  });
}
export function msUntilFormulaArrives({ sinceMs: sinceMs, isDrawnIn: isDrawnIn, lastActAtMs: lastActAtMs }: Dynamic, nowMs2?: Dynamic) {
  let arrivesAtMs = isDrawnIn
    ? listAnswerSettlesAtMs({
        answerShownAtMs: sinceMs,
        lastActAtMs: lastActAtMs,
      })
    : sinceMs + LIST_ANSWER_SETTLE_MS;
  return arrivesAtMs === Number.POSITIVE_INFINITY ? null : arrivesAtMs - nowMs2;
}
export function FormulaArriving({
  grid: {
    body: body,
    editorKeepsClear: editorKeepsClear,
    editorBox: editorBox,
    editorLineCount: editorLineCount,
    editorFoldsAt: editorFoldsAt,
    editorScale: editorScale,
    editorFormat: editorFormat,
    editorPaints: editorPaints,
  },
  stage: stage,
  actsHeld: actsHeld,
  text: text,
  isInFontOfFormulas: isInFontOfFormulas,
  dispatch: dispatch,
}: Dynamic) {
  let isArriving = stage?.kind === 'proposed' && stage.isArriving;
  let hasEditorBox = editorBox !== null;
  let wordsRef = React.useRef(null);
  let arrivalRef = React.useRef({
    sinceMs: 0,
    isDrawnIn: false,
    lastActAtMs: Number.NEGATIVE_INFINITY,
  });
  let ownWindow = useUiWindow();
  let clock = ownWindow?.performance ?? performance;
  let scheduleArrival = React.useCallback(() => {
    clearTimeout(arrivalRef.current.timer);
    let msLeft = msUntilFormulaArrives(arrivalRef.current, clock.now());
    if (msLeft !== null)
      arrivalRef.current.timer = setTimeout(
        () =>
          dispatch({
            kind: 'formulaOfAgentArrived',
          }),
        msLeft,
      );
  }, [dispatch, clock]);
  React.useLayoutEffect(() => {
    if (!isArriving) return;
    let arrival = arrivalRef.current;
    arrival.isDrawnIn = !hasEditorBox || prefersReducedMotionAt(wordsRef.current);
    let stopWatching = reportTimeAfterNextPaint(ownWindow, (sinceMs?: Dynamic) => {
      arrival.sinceMs = sinceMs;
      scheduleArrival();
    });
    return () => {
      stopWatching();
      clearTimeout(arrival.timer);
    };
  }, [isArriving, hasEditorBox, ownWindow, scheduleArrival]);
  let actsHeldRef = React.useRef(actsHeld);
  React.useEffect(() => {
    if (actsHeldRef.current === actsHeld) return;
    actsHeldRef.current = actsHeld;
    arrivalRef.current.lastActAtMs = clock.now();
    if (isArriving) scheduleArrival();
  }, [actsHeld, isArriving, clock, scheduleArrival]);
  if (editorBox === null || (stage?.kind !== 'asked' && !isArriving)) return null;
  let tokens2 = formulaTokens(text);
  let { lineHeightInPixels: lineHeightInPixels, ...boxStyle } = cellEntryBoxStyle(editorBox, body, editorFormat, editorKeepsClear, {
    lineCount: editorLineCount,
    foldsAt: editorFoldsAt,
    scale: editorScale,
  });
  return jsx('span', {
    ref: wordsRef,
    'aria-hidden': true,
    className: 'sheet-words-for-agent',
    'data-is-arriving': isArriving || undefined,
    'data-starts-on-line-at-left': entryGridlineOverlap(editorBox, editorScale).x > 0 || undefined,
    ...paintDataAttributes(editorPaints),
    style: {
      ...boxStyle,
      ...entryFontStyle(editorFormat.font, isInFontOfFormulas),
      ...(lineHeightInPixels !== undefined && {
        lineHeight: `${lineHeightInPixels}px`,
      }),
      ...fillPaintStyle(editorPaints.fill),
      ...textPaintStyle(editorPaints.text),
    },
    children: isArriving
      ? tokens2.map(
          ({ text: pieceText, start: start }: Dynamic, index?: Dynamic) =>
            jsx(
              'span',
              {
                className: 'sheet-piece-of-formula',
                style: formulaArrivalStyle(start / text.length),
                onAnimationEnd:
                  index === tokens2.length - 1
                    ? () => {
                        arrivalRef.current.isDrawnIn = true;
                        scheduleArrival();
                      }
                    : undefined,
                children: pieceText,
              },
              start,
            ),
        )
      : editorPaints.fill === null && editorPaints.text === null
        ? jsx(ShimmerText, {
            variant: 'secondary',
            children: text,
          })
        : jsx('span', {
            'data-shimmers': true,
            children: text,
          }),
  });
}
export function readFormulaAndValue(stage?: Dynamic) {
  let formula = formulaReadForOffer(stage) ?? '';
  let isReadOfFormula = stage?.kind === 'offered' && stage.read?.formula === formula;
  return [formula, isReadOfFormula ? stage.read.value.shown : ''];
}
export function readingRowsOf(stage?: Dynamic) {
  if (formulaReadForOffer(stage) === null || stage?.kind !== 'offered') return [];
  let [formula, comesTo] = readFormulaAndValue(stage);
  let { readOtherwise: readOtherwise } = stage;
  return [
    {
      row: 'read',
      formula: formula,
      comesTo: comesTo,
    },
    ...(readOtherwise === undefined
      ? []
      : [
          {
            row: 'readOtherwise',
            formula: readOtherwise.formula,
            comesTo: readOtherwise.value.shown,
          },
        ]),
  ];
}
export function offerAnnouncement(stage?: Dynamic, wasOfferSaid?: Dynamic) {
  switch (stage?.kind) {
    case 'offered':
      if (stage.toWorkOut?.isLitIfAlone === true && stage.isLightMovedByPerson !== true) return null;
      if (isReadingHighlighted(stage.highlighted)) {
        let row = readingRowsOf(stage).find(({ row: row2 }: Dynamic) => row2 === stage.highlighted);
        return row === undefined ? null : formulaReadingHint(row.formula, row.comesTo);
      }
      if (stage.readOtherwise !== undefined && stage.isLightMovedByPerson !== true && !stage.hasCallFailed)
        return twoFormulaReadingsHint(
          readFormulaAndValue(stage),
          [stage.readOtherwise.formula, stage.readOtherwise.value.shown],
          stage.highlighted === 'write',
        );
      if (stage.isAgentLeftOut === true) return null;
      if (stage.highlighted === 'keepTyping' && !stage.hasCallFailed) return null;
      return stage.hasCallFailed ? formulaNotWrittenWords() : notAFormulaHint();
    case 'asked':
      return agentWritingFormulaWords();
    case 'proposed':
      if (stage.isArriving) return agentWritingFormulaWords();
      if (stage.fixes?.[0] !== undefined) return agentWroteFormulaWords(stage.fixes.length, stage.fixes[0].formula, stage.fixes[0].value.shown);
      return agentWroteOneFormulaWords(stage.formula, stage.value.shown);
    case 'cameToNothing':
      return formulaNotWrittenReason(stage.why);
    case undefined:
      return wasOfferSaid ? formulaOfferGoneWords() : null;
  }
}
export function announcedOfferKind(stage?: Dynamic) {
  if (stage?.kind === 'offered' && !stage.isDrawn) return null;
  return stage?.kind === 'proposed' && stage.isArriving ? 'asked' : (stage?.kind ?? null);
}
export function isOfferSaidAtOnce(stage?: Dynamic, isWavedOff?: Dynamic) {
  let kind = announcedOfferKind(stage);
  let isRestedOnNoReading =
    kind === 'offered' &&
    stage?.kind === 'offered' &&
    stage.hasRested === true &&
    !isReadingHighlighted(stage.highlighted) &&
    (stage.readOtherwise === undefined || stage.hasCallFailed);
  return (kind !== null && kind !== 'offered') || isRestedOnNoReading || isWavedOff;
}
export function FormulaOfferAnnouncer({ formulaFromWords: { stage: stage, isWavedOff: isWavedOff }, isEntryOpen: isEntryOpen }: Dynamic) {
  let kind = announcedOfferKind(stage);
  let readKey =
    kind === 'offered' && stage?.kind === 'offered' && (isReadingHighlighted(stage.highlighted) || stage.readOtherwise !== undefined)
      ? [stage.highlighted, ...readingRowsOf(stage).flatMap(({ formula: formula, comesTo: comesTo }: Dynamic) => [formula, comesTo])].join(
          ' ',
        )
      : null;
  let isAgentOffered = kind === 'offered' && stage?.kind === 'offered' && stage.isAgentLeftOut !== true;
  let [said, setSaid] = React.useState({
    words: null,
    ofKind: null,
    ofRead: null,
    wasAgentOffered: false,
  });
  React.useEffect(() => {
    let sayNow = () =>
      setSaid(
        (said2?: Dynamic) =>
          said2.ofKind === kind && said2.ofRead === readKey && said2.wasAgentOffered === isAgentOffered
            ? said2
            : {
                words: isEntryOpen
                  ? offerAnnouncement(kind === null ? null : stage, said2.ofKind === 'offered' && said2.words !== null && !isWavedOff)
                  : null,
                ofKind: kind,
                ofRead: readKey,
                wasAgentOffered: isAgentOffered,
              },
      );
    if (isOfferSaidAtOnce(stage, isWavedOff)) return sayNow();
    let timer = setTimeout(sayNow, OFFER_ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [kind, readKey, isAgentOffered, stage, isWavedOff, isEntryOpen]);
  return jsx(LiveAnnouncer, {
    words: said.words,
  });
}
export function useIsComposing({ formulaBar: formulaBar }: Dynamic) {
  let [isComposing, setIsComposing] = React.useState(false);
  React.useEffect(() => {
    let ownerDocument = formulaBar.current?.ownerDocument;
    let onStart = () => setIsComposing(true);
    let onEnd = () => setIsComposing(false);
    ownerDocument?.addEventListener('compositionstart', onStart, true);
    ownerDocument?.addEventListener('compositionend', onEnd, true);
    return () => {
      ownerDocument?.removeEventListener('compositionstart', onStart, true);
      ownerDocument?.removeEventListener('compositionend', onEnd, true);
    };
  }, [formulaBar]);
  return isComposing;
}
export function FormulaFromWordsHelp({ typingIn: typingIn, isFormulaTyped: isFormulaTyped, cellAnchor: cellAnchor, ...props }: Dynamic) {
  let isInFormulaBar = useLastNonNull(typingIn) === 'formulaBar';
  let barAnchor = useCaretAnchor(props.boxes.formulaBar, 1);
  let { stage: stage } = props.formulaFromWords;
  let [pointed, setPointed] = React.useState(null);
  let onFixPointedAt = React.useCallback(
    (atRow?: Dynamic) =>
      setPointed((pointedBefore?: Dynamic) => {
        if (atRow === null) return null;
        return pointedBefore?.atRow === atRow && pointedBefore.in === stage
          ? pointedBefore
          : {
              atRow: atRow,
              in: stage,
            };
      }),
    [stage],
  );
  let [isRoomBeside, setIsRoomBeside] = React.useState(true);
  return jsxs(Fragment, {
    children: [
      jsx(FormulaOfferList, {
        ...props,
        anchor: isInFormulaBar ? barAnchor : cellAnchor,
        onFixPointedAt: onFixPointedAt,
        onRoomBesideMeasured: setIsRoomBeside,
      }),
      jsx(FixDescriptionTip, {
        stage: stage,
        pointed: pointed,
        isRoomBeside: isRoomBeside,
        inPage: props.boxes.formulaBar,
      }),
      jsx(FormulaOfferAnnouncer, {
        formulaFromWords: props.formulaFromWords,
        isEntryOpen: typingIn !== null,
      }),
    ],
  });
}
export const FORMULA_FROM_WORDS_LIST_ID = 'formula-from-words';
export const FORMULA_READ_ROW_ID = `${FORMULA_FROM_WORDS_LIST_ID}-read`;
export const FORMULA_WRITE_ROW_ID = `${FORMULA_FROM_WORDS_LIST_ID}-first`;
export const FORMULA_KEEP_TYPING_ROW_ID = `${FORMULA_FROM_WORDS_LIST_ID}-second`;
export const fixRowId = (index?: Dynamic) =>
  index === 0 ? FORMULA_WRITE_ROW_ID : `${FORMULA_FROM_WORDS_LIST_ID}-fix-${String(index + 1)}`;
export const FORMULA_OFFER_ROW_IDS = {
  read: FORMULA_READ_ROW_ID,
  readOtherwise: `${FORMULA_FROM_WORDS_LIST_ID}-read-otherwise`,
  write: FORMULA_WRITE_ROW_ID,
  keepTyping: FORMULA_KEEP_TYPING_ROW_ID,
};
export const formulaOfferActiveDescendant = ({ stage: stage }: Dynamic) =>
  stage === null || stage.kind === 'cameToNothing' || isOfferEmptyWithoutAgent(stage)
    ? null
    : {
        id: FORMULA_FROM_WORDS_LIST_ID,
        highlightedRowId: stage.kind === 'offered' && stage.hasRested !== true ? null : highlightedOfferRowId(stage),
      };
export const prefersReducedMotionAt = (element?: Dynamic) =>
  element?.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion:reduce)').matches === true;
export const wandKindOf = (kind?: Dynamic) => (kind === 'offered' || kind === 'asked' ? kind : null);
export const OFFER_WAND_STATES = {
  offered: ['entrance', 'idle'],
  asked: ['tickle', 'thinking'],
};
export const OfferRow = ({
  row: row,
  id: id,
  placeInList: placeInList,
  rowsInList = 2,
  isHighlighted: isHighlighted,
  isEveryClickHeard: isEveryClickHeard,
  isListNew: isListNew,
  onPointedAt: onPointedAt,
  onPointerLeave: onPointerLeave,
  children: children,
}: Dynamic) =>
  jsxs(ListRow, {
    id: id,
    placeInList: placeInList,
    rowsInList: rowsInList,
    isHighlighted: isHighlighted,
    onChosen: row.onChosen,
    isEveryClickHeard: isEveryClickHeard,
    ...(onPointedAt !== undefined && {
      onPointedAt: onPointedAt,
      tellsOfEveryMove: true,
    }),
    isOnlyTintedByPointer: true,
    ...(onPointerLeave !== undefined && {
      onPointerLeave: onPointerLeave,
    }),
    children: [
      children,
      row.isFormula === true
        ? jsx(FormulaAndResult, {
            formula: row.words,
            result: row.detail ?? null,
            isResultHidden: row.isDetailHidden === true,
          })
        : jsx(WordsInTurn, {
            words: row.words,
            isShimmering: row.isShimmering === true,
            takeAPlace: !isListNew,
          }),
      row.isFormula !== true &&
        row.detail !== undefined &&
        jsx('span', {
          className: 'sheet-words-in-turn sheet-quiet-text-in-row min-w-0 truncate text-secondary tabular-nums',
          children: row.detail,
        }),
      row.saidToo !== undefined &&
        jsx('span', {
          className: 'sr-only',
          children: row.saidToo,
        }),
      row.hint !== undefined &&
        jsx(ListRowQuietText, {
          isKey: true,
          children: row.hint,
        }),
      jsx(StopKeyHint, {
        word: stopWritingFormulaLabel(),
        keyInWords: escapeKeyHint(),
        isKeyUnheard: row.isKeyOfStopUnheard === true,
        isShown: row.isStopAtEnd === true,
      }),
    ],
  });
export const RowsThatFold = ({ isFolded: isFolded, doesEase: doesEase, children: children }: Dynamic) =>
  jsx('div', {
    className: 'sheet-rows-that-fold',
    'data-folded': isFolded || undefined,
    'data-eases': doesEase || undefined,
    'aria-hidden': isFolded || undefined,
    inert: isFolded,
    children: jsx('div', {
      children: children,
    }),
  });
export const offerKeptWhileAsked = (stage?: Dynamic, keptOffer?: Dynamic) => {
  if (stage?.kind === 'offered') return stage;
  return stage?.kind === 'asked' ? keptOffer : null;
};
export const isClickToHold = (click?: Dynamic) =>
  click.isMeantForStop || (click.isAgentWriting && (click.isOfRunThatAsked || !isPressTaken(click.rowsShownAtMs, click.wentDownAtMs, click.atMs)));
export const pressGuardStandOf = (kind?: Dynamic) => {
  if (kind === null || kind === 'cameToNothing') return null;
  if (kind === 'asked') return 'whileAgentWrites';
  return kind === 'proposed' ? 'withAnswer' : 'otherwise';
};
export const setApartDescription = (functionName?: Dynamic) =>
  functionName === undefined ? null : (describeFunction(functionName)?.description ?? null);
export const fixRowsOf = (stage?: Dynamic, dispatch?: Dynamic) =>
  proposedFixesOf({
    stage: stage,
  }).map(({ formula: formula, value: value, setApartBy: setApartBy }: Dynamic) => {
    let isArriving = stage?.kind === 'proposed' && stage.isArriving;
    return {
      words: formula,
      isFormula: true,
      detail: formulaResultPreview(value.shown) ?? undefined,
      isDetailHidden: isArriving,
      saidToo: setApartDescription(setApartBy) ?? undefined,
      onChosen: isArriving
        ? null
        : () =>
            dispatch({
              kind: 'formulaOfAgentKept',
              fix: formula,
            }),
    };
  });
export const TWO_FRAMES_FALLBACK_MS = 50;
export const OFFER_REST_DELAY_MS = 300;
export const FormulaOfferList = React.memo(function ({
  formulaFromWords: formulaFromWords,
  anchor: anchor,
  cellElementId: cellElementId,
  boxes: boxes,
  dispatch: dispatch,
  onFixPointedAt: onFixPointedAt,
  onRoomBesideMeasured: onRoomBesideMeasured,
}: Dynamic) {
  let stage = isOfferEmptyWithoutAgent(formulaFromWords.stage) ? null : formulaFromWords.stage;
  let shownStage = useLastNonNull(stage);
  let isWaitingToDraw = stage?.kind === 'offered' && !stage.isDrawn;
  React.useEffect(() => {
    let ownWindow = boxes.formulaBar.current?.ownerDocument.defaultView ?? null;
    if (!isWaitingToDraw || ownWindow === null) return;
    return afterTwoFrames(
      ownWindow,
      () =>
        dispatch({
          kind: 'formulaOfferDrawn',
          isDrawn: true,
        }),
    );
  }, [isWaitingToDraw, boxes, dispatch]);
  let isWaitingToRest = stage?.kind === 'offered' && stage.hasRested !== true;
  React.useEffect(() => {
    let ownWindow = boxes.formulaBar.current?.ownerDocument.defaultView ?? null;
    if (!isWaitingToRest || ownWindow === null) return;
    let timer = ownWindow.setTimeout(
      () =>
        dispatch({
          kind: 'formulaOfferDrawn',
          isDrawn: true,
          hasRested: true,
        }),
      OFFER_REST_DELAY_MS,
    );
    return () => ownWindow.clearTimeout(timer);
  }, [isWaitingToRest, boxes, dispatch]);
  let [opening, setOpening] = React.useState({
    wasOpen: false,
    kind: null,
  });
  let kind = stage?.kind ?? null;
  if (opening.wasOpen !== (stage !== null) || (opening.kind !== null && opening.kind !== kind))
    setOpening({
      wasOpen: stage !== null,
      kind: opening.wasOpen ? null : kind,
    });
  let isListNew = opening.kind !== null && opening.kind === kind;
  let offerRows = shownStage === null || shownStage.kind === 'cameToNothing' ? null : offerRowsOf(shownStage, dispatch);
  let isAsked = shownStage?.kind === 'asked';
  let [keptOffer, setKeptOffer] = React.useState(null);
  let offerWhileAsked = offerKeptWhileAsked(stage, keptOffer);
  if (offerWhileAsked !== keptOffer) setKeptOffer(offerWhileAsked);
  let readingRows = readingRowsOf(isAsked ? offerWhileAsked : shownStage);
  let readingCount = isAsked ? 0 : readingRows.length;
  let isAgentLeftOut = shownStage?.kind === 'offered' && shownStage.isAgentLeftOut === true;
  let doesFoldEase = (isAsked ? offerWhileAsked : shownStage?.kind === 'offered' ? shownStage : null)?.hasCallFailed !== true;
  let rowsRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let list = rowsRef.current?.closest('[data-list-under-cell]');
    let isOverCell = kind === 'asked' && list?.getAttribute('data-side') === 'top';
    list?.toggleAttribute('data-offer-was-over-cell', isOverCell);
  }, [kind]);
  let pressGuard = useOfferPressGuard(
    pressGuardStandOf(kind),
    rowsRef,
    () =>
      dispatch({
        kind: 'pressInListOfFormulaHeld',
      }),
  );
  let moreFixRows = fixRowsOf(shownStage, dispatch).slice(1);
  let rowCount = isAsked ? 1 : readingCount + moreFixRows.length + (isAgentLeftOut && readingCount > 0 ? 1 : 2);
  let highlightedRowId = highlightedOfferRowId(shownStage);
  let hasFixes =
    proposedFixesOf({
      stage: stage,
    }).length > 0;
  let [clickWatch] = React.useState(fixRowsClickWatch);
  let fixCount = proposedFixesOf({
    stage: stage,
  }).length;
  React.useLayoutEffect(() => clickWatch.rowsCame(fixCount > 0), [clickWatch, fixCount]);
  let ownWindow = useUiWindow();
  React.useEffect(() => {
    if (fixCount === 0) return;
    ownWindow?.addEventListener('pointermove', clickWatch.pointerMoved, true);
    return () => ownWindow?.removeEventListener('pointermove', clickWatch.pointerMoved, true);
  }, [clickWatch, fixCount, ownWindow]);
  let pointingAt = (atRow?: Dynamic) =>
    hasFixes
      ? {
          onPointedAt: () => onFixPointedAt(atRow),
          onPointerLeave: () => onFixPointedAt(null),
        }
      : {};
  let wandKind = isAgentLeftOut ? null : wandKindOf(shownStage?.kind ?? null);
  let isProposed = kind === 'proposed';
  return jsxs(ListUnderCell, {
    id: FORMULA_FROM_WORDS_LIST_ID,
    isOpen: stage !== null,
    anchor: anchor,
    cellElementId: cellElementId,
    label: formulaOptionsLabel(),
    className: 'w-[304px]',
    rowsAre: kind === null || kind === 'asked' ? undefined : `${kind}${readingCount}${rowCount}`,
    doesQuietEnd: isProposed,
    areRowsComing: stage?.kind === 'proposed' && stage.isArriving,
    onClickDropped: () =>
      dispatch({
        kind: 'pressInListOfFormulaHeld',
      }),
    onPressLetGo:
      kind === 'asked'
        ? () =>
            dispatch({
              kind: 'pressInListOfFormulaHeld',
            })
        : undefined,
    canBeShut: stage?.kind === 'offered',
    onRoomBesideMeasured: hasFixes ? onRoomBesideMeasured : undefined,
    onShut: (event?: Dynamic) => {
      let isInBox = entryEditorOf(event.target) === boxes.cell.current || event.target === boxes.formulaBar.current;
      if (event.type !== 'keydown' && !isInBox && stage?.kind === 'offered')
        dispatch({
          kind: 'formulaOfferShut',
        });
    },
    children: [
      offerRows !== null &&
        shownStage !== null &&
        jsxs('div', {
          ref: rowsRef,
          className: 'contents',
          ...pressGuard,
          onPointerDownCapture: (event?: Dynamic) => {
            pressGuard.onPointerDownCapture?.(event);
            let option = event.target instanceof Element ? event.target.closest('[role=option]') : null;
            clickWatch.pressWentDown(event, option?.id === FORMULA_WRITE_ROW_ID);
          },
          onClickCapture: (event?: Dynamic) => {
            let isDropped = clickWatch.isClickDropped();
            pressGuard.onClickCapture?.(event);
            if (event.isPropagationStopped() || !isDropped) return;
            event.stopPropagation();
            dispatch({
              kind: 'pressInListOfFormulaHeld',
            });
          },
          children: [
            readingRows.length > 0 &&
              jsxs(RowsThatFold, {
                isFolded: isAsked,
                doesEase: doesFoldEase,
                children: [
                  readingRows.map(
                    ({ row: row, formula: formula, comesTo: comesTo }: Dynamic, index?: Dynamic) =>
                      jsxs(
                        ListRow,
                        {
                          id: FORMULA_OFFER_ROW_IDS[row],
                          placeInList: index + 1,
                          rowsInList: rowCount,
                          isHighlighted: highlightedRowId === FORMULA_OFFER_ROW_IDS[row],
                          onChosen: () =>
                            dispatch({
                              kind: 'formulaOfferRowChosen',
                              row: row,
                            }),
                          children: [
                            wandKind !== null &&
                              jsx('span', {
                                'aria-hidden': true,
                                className: 'w-[14px] shrink-0',
                              }),
                            jsx(FormulaAndResult, {
                              formula: formula,
                              result: formulaResultPreview(comesTo),
                            }),
                          ],
                        },
                        row,
                      ),
                  ),
                  jsx(ListSeparator, {}),
                ],
              }),
            !isAgentLeftOut &&
              jsx(OfferRow, {
                row: offerRows[0],
                id: FORMULA_WRITE_ROW_ID,
                placeInList: readingCount + 1,
                rowsInList: rowCount,
                isHighlighted: highlightedRowId === FORMULA_WRITE_ROW_ID,
                isEveryClickHeard: isProposed || kind === 'asked',
                isListNew: isListNew,
                ...pointingAt(0),
                children:
                  wandKind !== null &&
                  jsx(OfferWand, {
                    kind: wandKind,
                  }),
              }),
            jsxs(RowsThatFold, {
              isFolded: isAsked,
              doesEase: doesFoldEase,
              children: [
                moreFixRows.map(
                  (fixRow?: Dynamic, index?: Dynamic) =>
                    jsx(
                      OfferRow,
                      {
                        row: fixRow,
                        id: fixRowId(index + 1),
                        placeInList: readingCount + index + 2,
                        rowsInList: rowCount,
                        isHighlighted: highlightedRowId === fixRowId(index + 1),
                        isEveryClickHeard: true,
                        isListNew: true,
                        ...pointingAt(index + 1),
                      },
                      fixRow.words,
                    ),
                ),
                moreFixRows.length > 0 && jsx(ListSeparator, {}),
                jsx(
                  OfferRow,
                  {
                    row:
                      isAsked && offerWhileAsked !== null
                        ? {
                            ...offerRowsOf(offerWhileAsked, dispatch)[1],
                            onChosen: null,
                          }
                        : offerRows[1],
                    id: FORMULA_KEEP_TYPING_ROW_ID,
                    placeInList: rowCount,
                    rowsInList: rowCount,
                    isHighlighted: highlightedRowId === FORMULA_KEEP_TYPING_ROW_ID,
                    isEveryClickHeard: isProposed,
                    isListNew: isListNew,
                    children:
                      wandKind !== null &&
                      jsx('span', {
                        'aria-hidden': true,
                        className: 'w-[14px] shrink-0',
                      }),
                  },
                  isAsked ? 'folded' : 'shown',
                ),
              ],
            }),
          ],
        }),
      shownStage?.kind === 'offered' &&
        shownStage.hasCallFailed &&
        jsx(ListHeading, {
          children: formulaNotWrittenWords(),
        }),
      shownStage?.kind === 'cameToNothing' &&
        jsx(ListHeading, {
          children: formulaNotWrittenReason(shownStage.why),
        }),
    ],
  });
});
export const FORMULA_TOKEN_PATTERN =
  /"(?:[^"]|"")*"|\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|[\p{L}_][\p{L}\p{N}_.]*|\d[\d.]*|\s+|./gsu;
export const formulaTokens = (formula?: Dynamic) =>
  [...formula.matchAll(FORMULA_TOKEN_PATTERN)].map(
    ({ 0: tokenText, index: index }: Dynamic) => ({
      text: tokenText,
      start: index,
    }),
  );
export const formulaArrivalStyle = (part?: Dynamic) => ({
  '--sheet-part-of-arrival': String(part),
});
export const OFFER_ANNOUNCE_DELAY_MS = 500;
export const withoutOfferWhenComposing = (formulaFromWords?: Dynamic, isComposing?: Dynamic) =>
  isComposing && formulaFromWords.stage?.kind === 'offered'
    ? {
        ...formulaFromWords,
        stage: null,
      }
    : formulaFromWords;
