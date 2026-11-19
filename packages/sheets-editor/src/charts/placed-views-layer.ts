import { Surface } from '../kit/surface.tsx';
import { SelectionFrame } from '../kit/selection-frame.tsx';
import { TooltipGroup } from '../kit/tooltip.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {
  chartProblemWords,
  chartFixAsk,
  chartProblemOfFault,
  chartChangeRefusalWords,
  askSentToChatWords,
  chartMessages,
} from '../messages/charts.ts';
import { useChartNotice, NoChartNotice, ChartNoticeScope, ChartNoticeGate, ChartNoticesProvider, CallWhenNoticeDue } from './chart-notices.ts';
import { PlacedViewFixOffer, isViewBigEnoughForFix, PlacedViewFixContext, FIX_OF_PLACED_VIEW_CLASS } from './fix-of-placed-view.ts';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { ChartCellsProblemNotice, ChartOnItsWay } from './chart-placeholders.ts';
import { canAskChartChange, chartCellsProblem, chartChangeOffers } from './change-offers.ts';
import { stripFrameTimestampParams } from '../shell/frame-token.ts';
import { ChartFrame } from './chart-frame.ts';
import { whenBlurredToNothingChecked } from '../grid/focus-left.ts';
import { useAnyCoarsePointer } from '../app/media-queries.ts';
import { useFocusFallbackToButton } from '../ui/focus-fallback.ts';
import { useShutOnWindowBlur } from '../ui/popup-given-up-on-blur.ts';
import { waitForNextTask } from '../dom/next-task.ts';
import {
  shownChartNode,
  shouldAskInChatInstead,
  chartChangeAsked,
  chartChangeAnswered,
  chartAskFaultShown,
  chartNodesToDraw,
  isShownChartNodeSettled,
  shouldHoldEnterOnChange,
  chartChangeStage,
  letGoOfChartChange,
  chartChangeKept,
  chartChangeDrawn,
  isKeptChartChangeOutdated,
  chartChangeKeptChecked,
} from './ask-to-change-chart.ts';
import { cleanAskWords, MAX_ASK_WORDS_LENGTH } from '../agent/chat-with-agent.ts';
import { cycleTabFocusForward } from '../ui/dom-events.ts';
import { ChartAskMenu } from './chart-ask-menu.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { ChartBeingMade } from './chart-being-made.ts';
import { useIsTrueForVisibleMs } from '../ui/save-status.ts';
import { makeThisChartKindPrompt } from './chart-words.ts';
import { canSwapChartKind } from './chart-kind-fit.ts';
import { STOCK_KINDS } from './stock-programs.ts';
export function ChartCantBeShownNotice({ why: why, ofCode = null }: Dynamic) {
  let { title: title, advice: advice } = chartProblemWords(why);
  useChartNotice(title, ofCode);
  let fixButton = PlacedViewFixOffer(chartFixAsk(why));
  return jsxs('div', {
    className: 'flex size-full flex-col items-center justify-center gap-xs p-md text-center',
    children: [
      jsx('p', {
        className: 'text-body font-medium text-primary',
        children: title,
      }),
      fixButton ??
        jsx('p', {
          className: 'text-footnote text-secondary',
          children: advice,
        }),
    ],
  });
}
export function ChartDrawing({
  frameDocument: frameDocument,
  artifact: artifact,
  inputs: inputs,
  sizeAtRest: sizeAtRest,
  name: name,
  takesOverFromSkeleton: takesOverFromSkeleton,
  onCameOut: onCameOut,
  tellsOfPointer: tellsOfPointer,
  onCaretTaken: onCaretTaken,
  onCodeTookCaret: onCodeTookCaret,
  onCodeTookTooLong: onCodeTookTooLong,
}: Dynamic) {
  let [{ nth: nth, stands: stands }, setDrawing] = React.useState({
    nth: 1,
    stands: 'onItsWay',
  });
  let onTold = (outcome?: Dynamic, inputsOfOutcome?: Dynamic) => {
    let size = typeof stands === 'object' && 'leftAt' in stands ? stands.leftAt : sizeAtRest;
    if (outcome.kind === 'failed' && outcome.fault === 'tookTooLong') {
      onCodeTookTooLong();
      return setDrawing({
        nth: nth + 1,
        stands: 'onItsWay',
      });
    }
    setDrawing({
      nth: nth,
      stands:
        outcome.kind === 'drawn'
          ? 'drawn'
          : {
              fault: outcome.fault,
              inputs: inputsOfOutcome,
              size: size,
            },
    });
    if (outcome.kind === 'failed' && outcome.fault === 'tookCaret') onCodeTookCaret();
    return;
  };
  let cellsProblem = React.useMemo(() => chartCellsProblem(inputs), [inputs]);
  let cameOut = cellsProblem !== null || (typeof stands === 'object' && 'fault' in stands) ? 'failed' : stands === 'drawn' ? 'drawn' : null;
  React.useEffect(() => {
    if (cameOut !== null) onCameOut?.(cameOut);
  }, [cameOut, onCameOut]);
  let hasFailed = typeof stands === 'object' && 'fault' in stands;
  let isLastingFault = hasFailed && !RETRIED_CHART_FAULTS.has(stands.fault);
  if (cellsProblem !== null && !isLastingFault) {
    if (stands === 'drawn')
      setDrawing({
        nth: nth + 1,
        stands: 'onItsWay',
      });
    return jsx(ChartCellsProblemNotice, {
      why: cellsProblem,
      name: name,
    });
  }
  if (hasFailed) {
    let hasSizeChanged = sizeAtRest !== null && stands.size !== sizeAtRest;
    if (RETRIED_CHART_FAULTS.has(stands.fault) && (stands.inputs !== inputs || hasSizeChanged))
      setDrawing({
        nth: nth + 1,
        stands: 'onItsWay',
      });
    return jsx(ChartCantBeShownNotice, {
      why: chartProblemOfFault(stands.fault),
      ofCode: artifact,
    });
  }
  if (typeof window < 'u' && !stripFrameTimestampParams())
    return jsx(ChartCantBeShownNotice, {
      why: 'notLoaded',
    });
  return jsxs(Fragment, {
    children: [
      jsx(
        ChartFrame,
        {
          frameDocument: frameDocument,
          artifact: artifact,
          inputs: inputs,
          name: name,
          isOnShow: stands === 'drawn',
          tellsOfPointer: tellsOfPointer,
          onTold: onTold,
          onLeaving: () =>
            setDrawing({
              nth: nth,
              stands: {
                leftAt: sizeAtRest,
              },
            }),
          onCaretTaken: onCaretTaken,
        },
        nth,
      ),
      stands === 'drawn'
        ? jsx(NoChartNotice, {})
        : jsx(ChartOnItsWay, {
            comesAtOnce: takesOverFromSkeleton,
          }),
    ],
  });
}
export function typeIntoAskBox(key?: Dynamic, isCharacter?: Dynamic, words?: Dynamic) {
  if (isCharacter)
    return {
      words: `${words}${key}`.slice(0, mostAskWordsTyped()),
    };
  let lastSegment = [...new (Intl.Segmenter as Dynamic)().segment(words)].at(-1);
  if (key === 'Backspace')
    return {
      words: words.slice(0, lastSegment?.index ?? 0),
    };
  return key === 'Escape' ? 'shut' : 'nothing';
}
export function PlacedView({
  placedView: {
    placementId: placementId,
    viewId: viewId,
    name: name,
    caption: caption,
    box: box,
    isInView: isInView,
    chart: chart,
    isSelected: isSelected,
    canBeChanged: canBeChanged,
    doesMouseBringTools: doesMouseBringTools,
    isHeld: isHeld,
    isHeldOnTheSpot: isHeldOnTheSpot,
    askBoxStands: askBoxStands,
  },
  isRun: isRun,
  isUnderMouse: isUnderMouse,
  onMouseIsOver: onMouseIsOver,
  body: body,
  zoom: zoom,
  runsOn: runsOn,
  tap: tap,
  hearPresses: hearPresses,
  onAct: onAct,
  onAskAgent: onAskAgent,
  doesChatTakeWords: doesChatTakeWords,
  onSendToAgent: onSendToAgent,
  onFixAsked: onFixAsked,
  onNoticeWithFixCame: onNoticeWithFixCame,
  changes: changes,
  isKeyOfMenu: isKeyOfMenu,
  ask: ask,
  onAskChanged: onAskChanged,
  actThatOpenedCard: actThatOpenedCard,
  isCardOpenedLate: isCardOpenedLate,
  onCardOpenChange: onCardOpenChange,
  onCaretOfCardSettled: onCaretOfCardSettled,
  isCaretOfCardOwed: isCaretOfCardOwed,
  onSteppedBackFromChange: onSteppedBackFromChange,
  onPageCannotAsk: onPageCannotAsk,
  canAgentWrite = false,
  onKeepPressed: onKeepPressed,
  onPreviewCameOut: onPreviewCameOut,
  lastBlurOfWindowAtMs: lastBlurOfWindowAtMs,
  onCaret: onCaret,
  onSidesPressed: onSidesPressed,
  onCaretTaken: onCaretTaken,
}: Dynamic) {
  let pointerOfShownRef = React.useRef(null);
  let pointerOfPreviewRef = React.useRef(null);
  let firstPointerAtRef = React.useRef(null);
  let onPointerMove = (event?: Dynamic) => {
    if (event.pointerType === 'touch') return;
    let { x: firstX, y: firstY } = firstPointerAtRef.current ?? {
      x: event.screenX,
      y: event.screenY,
    };
    firstPointerAtRef.current ??= {
      x: firstX,
      y: firstY,
    };
    let hasMouseMoved = event.screenX !== firstX || event.screenY !== firstY;
    if (event.pointerType === 'mouse' && hasMouseMoved && !isUnderMouse) onMouseIsOver(placementId, true);
    if (isInPlacedViewAskBox(event.target)) return pointerOfShownRef.current?.isAt(null);
    let { left: left, top: topEdge } = event.currentTarget.getBoundingClientRect();
    let pointerAt = {
      x: (event.clientX - left) / zoom,
      y: (event.clientY - topEdge) / zoom,
    };
    pointerOfShownRef.current?.isAt(isHeld ? null : pointerAt);
  };
  let tellPointerAt = React.useEffectEvent((at?: Dynamic) => pointerOfShownRef.current?.isAt(at));
  React.useEffect(
    () => hearPresses(placementId, (at?: Dynamic) => pointerOfShownRef.current?.hasPressedAt(at)),
    [hearPresses, placementId],
  );
  let lastTapRef = React.useRef(null);
  React.useEffect(() => {
    if (tap === null || tap === lastTapRef.current || !isSelected || isHeld) return;
    lastTapRef.current = tap;
    tellPointerAt({
      x: tap.x,
      y: tap.y,
    });
    return () => tellPointerAt(null);
  }, [tap, isSelected, isHeld]);
  let [isCaretInAskBox, setIsCaretInAskBox] = React.useState(false);
  if (!isSelected && isCaretInAskBox) setIsCaretInAskBox(false);
  let onViewFocus = ({ target: target, relatedTarget: relatedTarget }: Dynamic) => {
    setIsCaretInAskBox(isInPlacedViewAskBox(target));
    if (actThatOpenedCard !== null && !isInPlacedViewCardOrTools(target) && !isCaretOfCardOwed()) onCardOpenChange(placementId, false);
    onCaret(placementId, 'come', relatedTarget ?? 'onNothing');
  };
  let onViewBlur = ({ relatedTarget: relatedTarget, currentTarget: currentTarget, target: target }: Dynamic) => {
    if (currentTarget.contains(relatedTarget)) return;
    setIsCaretInAskBox(false);
    if (relatedTarget !== null) onCaret(placementId, 'left', relatedTarget);
    else
      whenBlurredToNothingChecked(
        target,
        (isWindowFocused?: Dynamic) => onCaret(placementId, 'left', isWindowFocused ? 'onNothing' : 'outOfWindow'),
      );
  };
  let selectionFrame = {
    x: 0,
    y: 0,
    w: box.width,
    h: box.height,
  };
  let cornerStyle = {
    borderRadius: `calc(var(--sheet-radius-of-chart) * ${String(zoom)})`,
  };
  let { showsIn: showsIn } = box;
  let canAskChange = React.useMemo(() => canAskChartChange(changes, chart, canAgentWrite), [changes, chart, canAgentWrite]);
  let shownNodeOfChart = chart.kind === 'none' ? null : shownChartNode(chart.nodeId, ask.change ?? null);
  let [kindOfShown, setKindOfShown] = React.useState({
    nodeId: null,
    kind: null,
  });
  React.useEffect(() => {
    if (!isSelected || changes === null || shownNodeOfChart === null || kindOfShown.nodeId === shownNodeOfChart) return;
    let isLive: Dynamic = true;
    changes
      .kindOf(shownNodeOfChart)
      .catch(() => null)
      .then((kind?: Dynamic) =>
        isLive
          ? setKindOfShown({
              nodeId: shownNodeOfChart,
              kind: kind,
            })
          : undefined,
      );
    return () => {
      isLive = false;
    };
  }, [isSelected, changes, shownNodeOfChart, kindOfShown.nodeId]);
  let changeOffers = React.useMemo(
    () => chartChangeOffers(chart, kindOfShown.nodeId === shownNodeOfChart ? kindOfShown.kind : null, canAgentWrite),
    [chart, kindOfShown, shownNodeOfChart, canAgentWrite],
  );
  let isCardOffered = (doesChatTakeWords || canAskChange) && askBoxStands?.isRoomEnough === true;
  let isCardOpen = actThatOpenedCard !== null;
  let isCardShown = askBoxStands !== null && isCardOpen;
  let showsEditButton = (onAskAgent !== null || isCardOffered || isCardOpen) && box.width >= PLACED_VIEW_TOOLS_WITH_EDIT_PX;
  let toolsCutOffRight = clampToolsCutOff(
    box.left + box.width - showsIn.left - showsIn.width,
    box.width,
    showsEditButton ? PLACED_VIEW_TOOLS_WITH_EDIT_PX : PLACED_VIEW_TOOLS_MIN_PX,
  );
  let showsTools = canBeChanged;
  let areToolsShown = (isSelected || (isUnderMouse && doesMouseBringTools)) && (!isHeld || isHeldOnTheSpot);
  let hasSmallTools = !useAnyCoarsePointer();
  let smallButtonProps = hasSmallTools
    ? {
        size: 'xs',
      }
    : {};
  let toolsTabIndex = isSelected ? 0 : -1;
  let [viewRef, toolsFocusHandlers] = useFocusFallbackToButton(showsEditButton || !showsTools, FOCUS_WITHOUT_SCROLL);
  let sendToAgent = React.useCallback((words?: Dynamic) => onSendToAgent(viewId, words), [onSendToAgent, viewId]);
  let focusChart = React.useCallback(() => {
    let ownerDocument = viewRef.current?.ownerDocument;
    if (ownerDocument !== undefined) findPlacedViewCaret(ownerDocument, placementId)?.focus(FOCUS_WITHOUT_SCROLL);
  }, [viewRef, placementId]);
  let canBeFixed = canBeChanged && isViewBigEnoughForFix(box);
  let wasNoticeHeardRef = React.useRef(false);
  let fixNoticeContext = React.useMemo(
    () => ({
      noticeCame: (hasFixButton?: Dynamic) => {
        if (canBeFixed && !wasNoticeHeardRef.current) wasNoticeHeardRef.current = hasFixButton || onNoticeWithFixCame();
      },
      ask: canBeFixed && onFixAsked !== null ? (words?: Dynamic) => onFixAsked(viewId, words) : null,
      giveChartCaret: focusChart,
    }),
    [canBeFixed, onNoticeWithFixCame, onFixAsked, viewId, focusChart],
  );
  let keyedEditButtonRef = React.useRef(null);
  let settledActRef = React.useRef(actThatOpenedCard);
  let shutCard = () => onCardOpenChange(placementId, false);
  let { isShut: isCardShut, noteFocus: noteCardFocus } = useShutOnWindowBlur(isCardShown, shutCard);
  let settleCardCaret = React.useEffectEvent(() => {
    settledActRef.current = actThatOpenedCard;
    onCaretOfCardSettled();
    let ownerDocument = viewRef.current?.ownerDocument;
    if (ownerDocument === undefined) return;
    if (isCardOpenedLate && !ownerDocument.hasFocus()) return shutCard();
    let activeElement = ownerDocument.activeElement;
    let wasEditKeyed =
      activeElement instanceof HTMLElement &&
      activeElement.closest(`.${PLACED_VIEW_TOOLS_CLASS}`) !== null &&
      activeElement.matches(':focus-visible');
    keyedEditButtonRef.current = wasEditKeyed ? activeElement : null;
    let askInput = findPlacedViewAskInput(ownerDocument, placementId);
    askInput?.focus(FOCUS_WITHOUT_SCROLL);
    if (askInput instanceof HTMLInputElement) askInput.setSelectionRange(askInput.value.length, askInput.value.length);
    return;
  });
  React.useLayoutEffect(() => {
    if (!isCardShown || !isNewCardAct(actThatOpenedCard, settledActRef.current)) return;
    if (!isCardOpenedLate) return settleCardCaret();
    let isCancelled: Dynamic = false;
    waitForNextTask().then(() => (isCancelled ? undefined : settleCardCaret()));
    return () => {
      isCancelled = true;
    };
  }, [isCardShown, actThatOpenedCard, isCardOpenedLate]);
  let closeCard = () => {
    let [view, keyedEditButton] = [viewRef.current, keyedEditButtonRef.current];
    let activeElement = view?.ownerDocument.activeElement ?? null;
    let caretGoes = whereCaretGoesAfterCard({
      hasWindowKeyboard: view?.ownerDocument.hasFocus() === true,
      isCaretAtCardOrTools: view?.contains(activeElement) === true && isInPlacedViewCardOrTools(activeElement),
      wasPencilPressedByKey: keyedEditButton !== null && view?.contains(keyedEditButton) === true,
    });
    if (caretGoes === 'toPencil') keyedEditButton?.focus(FOCUS_WITHOUT_SCROLL);
    if (caretGoes === 'toChart') focusChart();
    onCardOpenChange(placementId, false);
  };
  let change = ask.change ?? null;
  let shownNodeId = chart.kind === 'none' ? null : shownChartNode(chart.nodeId, change);
  React.useEffect(() => {
    if (shownNodeId !== null) pointerOfPreviewRef.current?.isAt(null);
  }, [shownNodeId]);
  let onEditPressed = (event?: Dynamic) => {
    let { detail: detail, currentTarget: currentTarget, nativeEvent: nativeEvent } = event;
    let nowMs2 = performance.now();
    let hasWindowFocus = currentTarget.ownerDocument.hasFocus();
    let isByKey = detail === 0;
    let isWindowLeft = isByKey
      ? !hasWindowFocus
      : !isPressFromThisWindow({
          hasWindowFocus: hasWindowFocus,
          madeAtMs: nativeEvent.timeStamp,
          nowMs: nowMs2,
          lastBlurAtMs: lastBlurOfWindowAtMs(),
        });
    if (isWindowLeft) event.stopPropagation();
    let act = editButtonAct({
      isWindowLeft: isWindowLeft,
      isKeyBeforeCardHasCaret: isByKey && isCaretOfCardOwed(),
      isCardOpen: isCardOpen,
      isCardOffered: isCardOffered,
    });
    if (act === 'shutsCard') closeCard();
    if (act === 'attachesChart') onAskAgent?.(viewId);
    if (act === 'opensCard') onCardOpenChange(placementId, true, isByKey || (hasWindowFocus && isLateEvent(nativeEvent.timeStamp, nowMs2)));
  };
  let latestAskRef = React.useRef({
    act: actThatOpenedCard,
    words: ask.words,
  });
  React.useLayoutEffect(() => {
    latestAskRef.current = {
      act: actThatOpenedCard,
      words: ask.words,
    };
  });
  let isChatToBeHad = doesChatTakeWords || onAskAgent !== null;
  let onAsked = (kind?: Dynamic, words?: Dynamic) => {
    let askWords = askWordsOfKind(kind, words);
    if (cleanAskWords(askWords) === '') return;
    let isKindSwap =
      kind !== 'any' && cleanAskWords(words) === '' && chart.kind !== 'none' && canSwapChartKind(chart.inputs, kind);
    let canChangeHere = canAskChange && (isKindSwap || canAgentWrite);
    let goesToChat = !isKindSwap && shouldAskInChatInstead(ask.whyNotChanged ?? null, isChatToBeHad);
    if (!canChangeHere && !isChatToBeHad)
      return onAskChanged(
        viewId,
        () => ({
          whyNotChanged: 'noAgent',
        }),
      );
    if (goesToChat && !doesChatTakeWords && onAskAgent !== null) {
      closeCard();
      onAskAgent(viewId);
      return;
    }
    if (canChangeHere && !goesToChat && changes !== null && chart.kind !== 'none') {
      let asked = {
        stands: 'asked',
        from: shownChartNode(chart.nodeId, change),
      };
      let isAskedByRow = kind !== 'any';
      onAskChanged(
        viewId,
        (current?: Dynamic) => ({
          ...chartChangeAsked(current, asked, askWords),
          became: null,
          wasAskedByRow: isAskedByRow,
        }),
      );
      changes
        .ask(
          {
            nodeId: asked.from,
            inputs: chart.inputs,
          },
          askWords,
          MAX_ASK_WORDS_LENGTH,
          kind !== 'any' && cleanAskWords(words) === '' ? kind : null,
        )
        .then(
          (outcome?: Dynamic) => (
            onAskChanged(viewId, (current?: Dynamic) => chartChangeAnswered(current, asked, outcome)),
            outcome === 'noAgent' ? onPageCannotAsk() : undefined
          ),
        );
      return;
    }
    onAskChanged(
      viewId,
      () => ({
        isOnItsWay: true,
        became: null,
        whyNotChanged: null,
      }),
    );
    sendToAgent(askWords).then((became?: Dynamic) => {
      let isSameAsk = latestAskRef.current.act === actThatOpenedCard && latestAskRef.current.words === words;
      onAskChanged(viewId, (current?: Dynamic) => askAfterSent(current, words, became));
      let hasCaret = isSameAsk && viewRef.current?.ownerDocument.hasFocus() === true;
      if (became !== 'taken' && !isInView && hasCaret) onCaret(placementId, 'come', 'onNothing');
      return became === 'taken' && isSameAsk ? closeCard() : undefined;
    });
  };
  let lastKeyRef = React.useRef({
    atMs: Number.NEGATIVE_INFINITY,
    wasHeld: false,
  });
  let onPreviewOutcome = React.useCallback((outcome?: Dynamic) => onPreviewCameOut(viewId, outcome), [onPreviewCameOut, viewId]);
  let onChangeKept = () => {
    if (onKeepPressed(viewId, change)) closeCard();
  };
  let refusal =
    (ask.whyNotChanged ?? null) === null
      ? null
      : chartAskFaultShown(ask.whyNotChanged ?? 'notChanged', {
          wasByRow: ask.wasAskedByRow === true,
          isChatToBeHad: isChatToBeHad,
        });
  let noteOnLastAsk =
    refusal !== null ? chartChangeRefusalWords(refusal, doesChatTakeWords) : ask.became === null ? null : askSentToChatWords(ask.became);
  let takesChartCaret = isSelected && isCaretInAskBox && askBoxStands === null;
  React.useEffect(() => {
    let ownerDocument = viewRef.current?.ownerDocument;
    if (takesChartCaret && ownerDocument?.activeElement === ownerDocument?.body && ownerDocument?.hasFocus() === true) focusChart();
  }, [takesChartCaret, viewRef, focusChart]);
  let toolsCutOffStyle = {
    '--sheet-middle-of-title': `${String(middleOfChartTitle(box))}px`,
    '--sheet-cut-off-right': `${String(toolsCutOffRight)}px`,
    '--sheet-cut-off-top': `${String(clampToolsCutOff(showsIn.top - box.top, box.height, PLACED_VIEW_TOOLS_MIN_PX))}px`,
  };
  let describedBy = [
    placedViewDrawingId(placementId),
    ...(caption === '' ? [] : [placedViewCaptionId(placementId)]),
    ...(canBeChanged ? [PLACED_VIEW_KEYS_HINT_ID] : []),
    ...(isCardOffered ? [PLACED_VIEW_TYPING_HINT_ID] : []),
  ];
  return jsx('div', {
    className: 'sheet-room-of-placed-view',
    'data-is-on-top': isSelected,
    style: {
      left: body.left + box.showsIn.left,
      top: body.top + box.showsIn.top,
      width: box.showsIn.width,
      height: box.showsIn.height,
    },
    children: jsxs('div', {
      ref: viewRef,
      ...{
        [PLACEMENT_ID_ATTRIBUTE]: placementId,
      },
      className: 'sheet-placed-view group',
      role: 'presentation',
      'data-is-in-view': isInView,
      'data-is-held': isHeld,
      style: {
        left: isInView ? box.left - box.showsIn.left : 0,
        top: isInView ? box.top - box.showsIn.top : 0,
        width: box.width,
        height: box.height,
      },
      onFocus: onViewFocus,
      onBlur: onViewBlur,
      onPointerMove: onPointerMove,
      onPointerLeave: ({ pointerType: pointerType }: Dynamic) => {
        firstPointerAtRef.current = null;
        onMouseIsOver(placementId, false);
        if (pointerType !== 'touch' || tap === null) pointerOfShownRef.current?.isAt(null);
      },
      children: [
        caption !== '' &&
          jsx('span', {
            id: placedViewCaptionId(placementId),
            hidden: true,
            children: caption,
          }),
        jsx('button', {
          type: 'button',
          id: placedViewCaretId(placementId),
          className: PLACED_VIEW_CARET_CLASS,
          tabIndex: 0,
          'aria-label': chartMessages.chartNamed(name),
          'aria-describedby': describedBy.join(' '),
          onClick: ({ currentTarget: currentTarget }: Dynamic) =>
            currentTarget.focus({
              preventScroll: true,
            }),
        }),
        jsx(Surface, {
          elevation: 'panel',
          className: 'sheet-ground-of-chart size-full',
          children: jsx('div', {
            id: placedViewDrawingId(placementId),
            className: 'sheet-chart',
            children: jsx(ChartNoticeScope, {
              id: placementId,
              children: jsx(PlacedViewFixContext, {
                value: fixNoticeContext,
                children: !isRun
                  ? null
                  : chart.kind === 'none'
                    ? jsx(ChartCantBeShownNotice, {
                        why: chart.why === 'tooMuchToRead' ? 'tooMuchData' : 'cantBeShown',
                      })
                    : chartNodesToDraw(chart.nodeId, change).map((nodeId?: Dynamic) => {
                        let isShownNode = nodeId === shownChartNode(chart.nodeId, change);
                        return jsx(
                          'div',
                          {
                            className: `absolute inset-0 ${isShownNode ? '' : 'invisible'}`,
                            children: jsx(ChartNoticeGate, {
                              isHeardOf: isShownChartNodeSettled(nodeId, chart.nodeId, change),
                              children: jsx(PlacedChart, {
                                runsOn: runsOn,
                                nodeId: nodeId,
                                ...(nodeId !== chart.nodeId && {
                                  onCameOut: onPreviewOutcome,
                                }),
                                inputs: chart.inputs,
                                sizeAtRest: isHeld ? null : `${String(box.width)} ${String(box.height)}`,
                                name: name,
                                tellsOfPointer: isShownNode ? pointerOfShownRef : pointerOfPreviewRef,
                                onCaretTaken: onCaretTaken,
                              }),
                            }),
                          },
                          nodeId,
                        );
                      }),
              }),
            }),
          }),
        }),
        isSelected
          ? jsx(SelectionFrame, {
              frame: selectionFrame,
              scale: zoom,
              style: cornerStyle,
              ...(canBeChanged
                ? {
                    onResizeStart: onSidesPressed,
                  }
                : {
                    grips: 'none',
                  }),
            })
          : canBeChanged &&
            jsx(SelectionFrame, {
              frame: selectionFrame,
              scale: zoom,
              state: 'hover',
              style: cornerStyle,
              className: 'hidden group-hover:block',
            }),
        showsTools &&
          jsx('div', {
            className: `${PLACED_VIEW_TOOLS_CLASS} flex gap-0.5 pointer-coarse:gap-2`,
            'data-are-small': hasSmallTools,
            'data-are-shown': areToolsShown,
            'data-is-under-mouse': isUnderMouse,
            'aria-hidden': !isSelected,
            style: toolsCutOffStyle,
            onClickCapture: (event?: Dynamic) => {
              if (event.detail > 1) event.stopPropagation();
            },
            children: jsxs(TooltipGroup, {
              children: [
                showsEditButton &&
                  jsx(Button, {
                    variant: 'ghost',
                    iconOnly: true,
                    icon: 'Edit',
                    ...smallButtonProps,
                    'aria-label': chartMessages.editWithAgent(),
                    ...((isCardOffered || isCardOpen) && {
                      pressed: isCardOpen,
                    }),
                    ...(isCardShown && {
                      'aria-controls': placedViewCardId(placementId),
                    }),
                    tabIndex: toolsTabIndex,
                    onClick: onEditPressed,
                    ...toolsFocusHandlers,
                  }),
                jsx(Button, {
                  variant: 'ghost',
                  iconOnly: true,
                  icon: 'Trash',
                  ...smallButtonProps,
                  tabIndex: toolsTabIndex,
                  'aria-label': chartMessages.deleteChart(),
                  onClick: ({ detail: detail }: Dynamic) =>
                    onAct(placementId, {
                      kind: 'delete',
                      isByKey: detail === 0,
                    }),
                }),
              ],
            }),
          }),
        isSelected &&
          isCardShown &&
          !isCardShut &&
          jsx('div', {
            id: placedViewCardId(placementId),
            role: 'presentation',
            className: PLACED_VIEW_ASK_BOX_CLASS,
            style: {
              left: isInView ? askBoxStands.left : 0,
              top: isInView ? askBoxStands.top : 0,
              width: askBoxStands.width * zoom,
              scale: 1 / zoom,
            },
            'data-is-hidden': isHeld,
            onKeyDownCapture: (event?: Dynamic) => {
              let isHeldKey =
                event.key === 'Enter' &&
                change?.stands === 'waits' &&
                shouldHoldEnterOnChange({
                  isChartInView: isInView,
                  pressedAtMs: event.timeStamp,
                  lastBlurOfWindowAtMs: lastBlurOfWindowAtMs(),
                  lastAct: lastKeyRef.current,
                });
              lastKeyRef.current = {
                atMs: event.timeStamp,
                wasHeld: isHeldKey,
              };
              if (!isInView && (event.key !== 'Enter' || isHeldKey)) onCaret(placementId, 'come', event.target);
              if (!isHeldKey) return;
              event.preventDefault();
              event.stopPropagation();
            },
            onKeyDown: (event?: Dynamic) => {
              if (chartChangeStage(change) !== null) cycleTabFocusForward(event);
              if (event.key !== 'Escape' || isKeyOfMenu(event)) return;
              if (change?.stands === 'waits') onSteppedBackFromChange(viewId);
              else closeCard();
            },
            onPointerDownCapture: ({ timeStamp: timeStamp }: Dynamic) => {
              lastKeyRef.current = {
                atMs: timeStamp,
                wasHeld: false,
              };
            },
            onFocus: noteCardFocus,
            onBlur: ({ relatedTarget: relatedTarget, currentTarget: currentTarget }: Dynamic) => {
              if (relatedTarget === null || currentTarget.contains(relatedTarget)) return;
              if (!isInPlacedViewCardOrTools(relatedTarget)) onCardOpenChange(placementId, false);
            },
            children: jsx(Surface, {
              elevation: 'popover',
              children: jsx('div', {
                className: 'overflow-hidden rounded-[inherit]',
                children: jsx(ChartAskMenu, {
                  changesChart: true,
                  onOffer: changeOffers,
                  whyNot: ask.isOnItsWay ? 'waiting' : !canAgentWrite && !isChatToBeHad ? 'noChat' : null,
                  canPageMakeChart: changeOffers.some(({ isSwap: isSwap }: Dynamic) => isSwap),
                  change: chartChangeStage(change),
                  askedOfAgent: ask.asked ?? '',
                  isKindAsked: ask.wasAskedByRow === true,
                  onChangeKept: onChangeKept,
                  onSteppedBackFromChange: () => onSteppedBackFromChange(viewId),
                  noteOnLastAsk: ask.became === 'taken' ? null : noteOnLastAsk,
                  mostTyped: mostAskWordsTyped(),
                  typed: ask.words,
                  onTyped: (words?: Dynamic) =>
                    onAskChanged(
                      viewId,
                      () => ({
                        words: words,
                        whyNotChanged: null,
                      }),
                    ),
                  isNoteOfFault: refusal !== 'forChat' && refusal !== 'notHere',
                  isKeyOfAnother: (event?: Dynamic) => isKeyOfMenu(event) || (change?.stands === 'waits' && event.key === 'Escape'),
                  onAsked: onAsked,
                }),
              }),
            }),
          }),
        isSelected &&
          jsx(LiveAnnouncer, {
            words: noteOnLastAsk,
          }),
      ],
    }),
  });
}
export function PlacedViewsLayer({
  placedViews: placedViews,
  chartBeingMade: chartBeingMade,
  sheetOnShow: sheetOnShow,
  onChartBeingMadeGone: onChartBeingMadeGone,
  tap: tap,
  onCardOpened: onCardOpened,
  cardUnderChart: cardUnderChart,
  saidAtRest: saidAtRest,
  ...rest
}: Dynamic) {
  let [placesToldOf, setPlacesToldOf] = React.useState(NO_PLACES_TOLD_OF);
  let notePlaceToldOf = React.useCallback(
    (placementId?: Dynamic) =>
      setPlacesToldOf((told?: Dynamic) => (told.has(placementId) ? told : new (Set as Dynamic)(told).add(placementId))),
    [],
  );
  let [runOrder, setRunOrder] = React.useState([]);
  let inViewIds = placedViews.flatMap(({ placementId: placementId, isInView: isInView }: Dynamic) => (isInView ? placementId : []));
  let placementIds = new (Set as Dynamic)(placedViews.map(({ placementId: placementId }: Dynamic) => placementId));
  let runIds = [
    ...inViewIds,
    ...runOrder.filter((placementId?: Dynamic) => placementIds.has(placementId) && !inViewIds.includes(placementId)),
  ].slice(0, Math.max(inViewIds.length, MOST_CHARTS_RUN));
  if (runIds.length !== runOrder.length || runIds.some((placementId?: Dynamic, index?: Dynamic) => placementId !== runOrder[index]))
    setRunOrder(runIds);
  let [asks, setAsks] = React.useState({});
  let changeAsk = React.useCallback(
    (viewId?: Dynamic, update?: Dynamic) =>
      setAsks((current?: Dynamic) => {
        let ask = current[viewId] ?? EMPTY_CHART_ASK;
        return {
          ...current,
          [viewId]: {
            ...ask,
            ...update(ask),
          },
        };
      }),
    [],
  );
  let [openCard, setOpenCard] = React.useState(null);
  let cardActsRef = React.useRef(0);
  let isCaretOfCardOwedRef = React.useRef(false);
  let settleCardCaret = React.useCallback(() => {
    isCaretOfCardOwedRef.current = false;
  }, []);
  let isCaretOfCardOwed = React.useCallback(() => isCaretOfCardOwedRef.current, []);
  let lastBlurAtRef = React.useRef(Number.NEGATIVE_INFINITY);
  let lastBlurOfWindowAtMs = React.useCallback(() => lastBlurAtRef.current, []);
  let [layerElement, setLayerElement] = React.useState(null);
  React.useEffect(() => {
    let view = layerElement?.ownerDocument.defaultView ?? null;
    if (view === null) return;
    let onBlur = () => {
      lastBlurAtRef.current = view.performance.now();
    };
    view.addEventListener('blur', onBlur);
    return () => view.removeEventListener('blur', onBlur);
  }, [layerElement]);
  let setCardOpen = (placementId?: Dynamic, isOpen?: Dynamic, isHeardLate: Dynamic = true) => {
    let viewId = placedViews.find((placedView?: Dynamic) => placedView.placementId === placementId)?.viewId;
    if (viewId !== undefined)
      changeAsk(
        viewId,
        ({ became: became }: Dynamic) => ({
          became: becameAfterCardChange(became, isOpen),
          ...(isOpen && {
            whyNotChanged: null,
          }),
        }),
      );
    if (isOpen || openCard?.placementId === placementId) isCaretOfCardOwedRef.current = isOpen;
    if (!isOpen) return setOpenCard((current?: Dynamic) => (current?.placementId === placementId ? null : current));
    cardActsRef.current += 1;
    setOpenCard({
      placementId: placementId,
      act: cardActsRef.current,
      isHeardLate: isHeardLate,
    });
    return onCardOpened();
  };
  let [placementUnderMouse, setPlacementUnderMouse] = React.useState(null);
  let noteMouseIsOver = React.useCallback(
    (placementId?: Dynamic, isOver?: Dynamic) =>
      setPlacementUnderMouse((current?: Dynamic) => (isOver ? placementId : current === placementId ? null : current)),
    [],
  );
  if (placementUnderMouse !== null && !placedViews.some(({ placementId: placementId }: Dynamic) => placementId === placementUnderMouse))
    setPlacementUnderMouse(null);
  let { changes: changes, pointChart: pointChart, onKeepAnswered: onKeepAnswered } = rest;
  let [canHaveChanges, setCanHaveChanges] = React.useState(false);
  let isAnySelected = placedViews.some(
    ({ isSelected: isSelected, placementId: placementId }: Dynamic) => isSelected || placementId === placementUnderMouse,
  );
  React.useEffect(() => {
    if (!isAnySelected || changes === null) return;
    let isLive: Dynamic = true;
    changes
      .isToBeHad()
      .catch(() => false)
      .then((canHave?: Dynamic) => (isLive ? setCanHaveChanges(canHave) : undefined));
    return () => {
      isLive = false;
    };
  }, [isAnySelected, changes]);
  let [canAgentChangeCharts, setCanAgentChangeCharts] = React.useState(false);
  React.useEffect(() => {
    if (!isAnySelected || changes === null) return;
    let isLive: Dynamic = true;
    changes
      .canAskAgent()
      .catch(() => false)
      .then((canAsk?: Dynamic) => (isLive ? setCanAgentChangeCharts(canAsk) : undefined));
    return () => {
      isLive = false;
    };
  }, [isAnySelected, changes]);
  let [isPageUnableToAsk, setIsPageUnableToAsk] = React.useState(false);
  let changesNow = canHaveChanges ? changes : null;
  let canAgentWrite = canAgentChangeCharts && !isPageUnableToAsk;
  let stepBackFromChange = (viewId?: Dynamic) => changeAsk(viewId, letGoOfChartChange);
  let asksRef = React.useRef(asks);
  React.useLayoutEffect(() => {
    asksRef.current = asks;
  });
  let keepChange = (viewId?: Dynamic, kept?: Dynamic) => (
    ReactDOM.flushSync(
      () =>
        changeAsk(viewId, (ask?: Dynamic) => {
          let next = chartChangeKept(ask, kept);
          return next.change === undefined
            ? next
            : {
                ...next,
                words: '',
              };
        }),
    ),
    asksRef.current[viewId]?.change?.stands === 'kept'
  );
  let onPreviewCameOut = React.useCallback(
    (viewId?: Dynamic, outcome?: Dynamic) => changeAsk(viewId, (ask?: Dynamic) => chartChangeDrawn(ask, outcome)),
    [changeAsk],
  );
  let notePageCannotAsk = () => setIsPageUnableToAsk(true);
  let isCardAskable = (placedView?: Dynamic) =>
    (rest.doesChatTakeWords || canAskChartChange(changesNow, placedView.chart, canAgentWrite)) &&
    placedView.askBoxStands?.isRoomEnough === true;
  let askableViewOf = (placementId?: Dynamic) => {
    let placedView = placedViews.find((candidate?: Dynamic) => candidate.placementId === placementId);
    return placedView?.isSelected === true && isCardAskable(placedView) ? placedView : null;
  };
  let openCardOf = React.useEffectEvent((placementId?: Dynamic) => {
    if (askableViewOf(placementId) !== null) setCardOpen(placementId, true);
  });
  let canAgentChange = React.useEffectEvent((placementId?: Dynamic) => {
    let placedView = placedViews.find((candidate?: Dynamic) => candidate.placementId === placementId);
    return placedView?.canBeChanged === true && (rest.onAskAgent !== null || isCardAskable(placedView));
  });
  let isChangeUnderWay = React.useEffectEvent((placementId?: Dynamic) => {
    let placedView = placedViews.find((candidate?: Dynamic) => candidate.placementId === placementId);
    return placedView !== undefined && chartChangeStage(asks[placedView.viewId]?.change ?? null) !== null;
  });
  let editChart = React.useEffectEvent((placementId?: Dynamic) => {
    if (askableViewOf(placementId) !== null) return setCardOpen(placementId, true);
    let placedView = placedViews.find((candidate?: Dynamic) => candidate.placementId === placementId);
    if (placedView !== undefined) rest.onAskAgent?.(placedView.viewId);
  });
  let takeKey = React.useEffectEvent((placementId?: Dynamic, keyPress?: Dynamic) => {
    let { key: key, isCharacter: isCharacter, isOnChartItself: isOnChartItself, madeAtMs: madeAtMs } = keyPress;
    let viewId = placedViews.find((candidate?: Dynamic) => candidate.placementId === placementId)?.viewId;
    if (openCard?.placementId === placementId && viewId !== undefined) {
      if (!isCaretOfCardOwedRef.current) return false;
      let typed = typeIntoAskBox(key, isCharacter, asks[viewId]?.words ?? '');
      if (typed === 'shut') ReactDOM.flushSync(() => setCardOpen(placementId, false));
      else if (typed !== 'nothing') ReactDOM.flushSync(() => changeAsk(viewId, () => typed));
      return true;
    }
    if (!isCharacter || key === ' ' || !isOnChartItself) return false;
    let askableView = askableViewOf(placementId);
    if (askableView === null) return false;
    if (layerElement?.ownerDocument.hasFocus() !== true) return true;
    ReactDOM.flushSync(() => {
      changeAsk(
        askableView.viewId,
        () => ({
          words: key,
          became: null,
        }),
      );
      setCardOpen(placementId, true, isLateEvent(madeAtMs, performance.now()));
    });
    return true;
  });
  React.useImperativeHandle(
    cardUnderChart,
    () => ({
      open: (placementId?: Dynamic) => openCardOf(placementId),
      canAgentChange: (placementId?: Dynamic) => canAgentChange(placementId),
      isChangeUnderWay: (placementId?: Dynamic) => isChangeUnderWay(placementId),
      edit: (placementId?: Dynamic) => editChart(placementId),
      takeKey: (placementId?: Dynamic, keyPress?: Dynamic) => takeKey(placementId, keyPress),
    }),
    [],
  );
  let selectedViewId = placedViews.find(({ isSelected: isSelected }: Dynamic) => isSelected)?.viewId ?? null;
  let [lastSelectedViewId, setLastSelectedViewId] = React.useState(selectedViewId);
  if (selectedViewId !== lastSelectedViewId) {
    setLastSelectedViewId(selectedViewId);
    if (lastSelectedViewId !== null && (asks[lastSelectedViewId]?.became ?? null) !== null)
      changeAsk(
        lastSelectedViewId,
        () => ({
          became: null,
        }),
      );
  }
  let openCardView = placedViews.find((placedView?: Dynamic) => placedView.placementId === openCard?.placementId);
  if (openCard !== null && !canPlacedViewShowAskBox(openCardView)) {
    setOpenCard(null);
    if (openCardView !== undefined)
      changeAsk(
        openCardView.viewId,
        ({ became: became }: Dynamic) => ({
          became: becameAfterCardChange(became, false),
        }),
      );
  }
  let openCardViewId = openCard === null ? null : (openCardView?.viewId ?? null);
  for (let [viewId, { change = null }] of Object.entries(asks) as Dynamic)
    if (chartChangeStage(change) !== null && viewId !== openCardViewId) stepBackFromChange(viewId);
  for (let { viewId: viewId, chart: change } of placedViews as Dynamic)
    if (change.kind !== 'none' && isKeptChartChangeOutdated(asks[viewId]?.change ?? null, change.nodeId))
      changeAsk(
        viewId,
        () => ({
          change: null,
        }),
      );
  let answeredKeeps = Object.entries(asks).flatMap(
    ([viewId, { change = null }]: Dynamic) =>
      change?.stands === 'kept' && change.isAnswered
        ? [
            {
              viewId: viewId,
              change: change,
            },
          ]
        : [],
  );
  let clearAnsweredKeeps = React.useEffectEvent(() => {
    for (let { viewId: viewId, change: change } of answeredKeeps as Dynamic)
      changeAsk(
        viewId,
        (ask?: Dynamic) =>
          ask.change === change
            ? {
                change: null,
              }
            : {},
      );
  });
  let answeredKeepIds = answeredKeeps.map(({ viewId: viewId }: Dynamic) => viewId).join(' ');
  React.useEffect(() => {
    if (answeredKeepIds === '') return;
    let timer = (window as Dynamic).setTimeout(clearAnsweredKeeps, KEPT_CHANGE_SHOWN_MS);
    return () => (window as Dynamic).clearTimeout(timer);
  }, [answeredKeepIds]);
  let settledRef = React.useRef(new (Set as Dynamic)());
  let settleChanges = React.useEffectEvent((allAsks?: Dynamic) => {
    if (changes === null) return;
    let isFirstTime = (item?: Dynamic) => {
      if (settledRef.current.has(item)) return false;
      settledRef.current.add(item);
      return true;
    };
    for (let [viewId, { change = null, toDiscard = [] }] of Object.entries(allAsks) as Dynamic) {
      if (change?.stands === 'givenUp' && isFirstTime(change)) changes.giveUp();
      for (let previewToDiscard of toDiscard as Dynamic) if (isFirstTime(previewToDiscard)) changes.discard(previewToDiscard);
      if (change?.stands !== 'kept' || change.isAnswered || !isFirstTime(change)) continue;
      let pointing = {
        from: change.from,
        to: change.preview,
        pubOfFrom: change.pubOfFrom,
      };
      changes
        .pointAt(viewId, pointing, pointChart)
        .catch(() => 'unsure')
        .then(
          (pointed?: Dynamic) => (
            changeAsk(viewId, (ask?: Dynamic) => chartChangeKeptChecked(ask, change, pointed)),
            onKeepAnswered(pointing, pointed)
          ),
        );
    }
  });
  React.useEffect(() => settleChanges(asks), [asks]);
  React.useEffect(
    () => () =>
      settleChanges(
        Object.fromEntries(
          Object.entries(asksRef.current).map(
            ([viewId, ask]: Dynamic) => [
              viewId,
              {
                ...ask,
                ...letGoOfChartChange(ask),
              },
            ],
          ),
        ),
      ),
    [],
  );
  let previewsLetGo = Object.values(asks).reduce((sum?: Dynamic, ask?: Dynamic) => sum + (ask.previewsLetGo ?? 0), 0);
  let [previewsLetGoSaid, setPreviewsLetGoSaid] = React.useState(0);
  if (Object.values(asks).some(({ change = null }: Dynamic) => chartChangeStage(change) !== null) && previewsLetGoSaid !== previewsLetGo)
    setPreviewsLetGoSaid(previewsLetGo);
  return jsxs(ChartNoticesProvider, {
    onToldOf: notePlaceToldOf,
    children: [
      saidAtRest(previewsLetGo > previewsLetGoSaid ? chartMessages.previewDiscarded() : null, String(previewsLetGo)),
      previewsLetGo > previewsLetGoSaid &&
        jsx(
          CallWhenNoticeDue,
          {
            onDue: () => setPreviewsLetGoSaid(previewsLetGo),
          },
          previewsLetGo,
        ),
      placedViews.length > 0 &&
        jsxs('div', {
          ref: setLayerElement,
          className: 'sheet-placed-views',
          children: [
            jsx('span', {
              id: PLACED_VIEW_KEYS_HINT_ID,
              hidden: true,
              children: chartMessages.keys(),
            }),
            jsx('span', {
              id: PLACED_VIEW_TYPING_HINT_ID,
              hidden: true,
              children: chartMessages.typeToAskAgent(),
            }),
            placedViews.map(
              (placedView?: Dynamic) =>
                jsx(
                  PlacedView,
                  {
                    placedView: placedView,
                    isRun: runIds.includes(placedView.placementId),
                    isUnderMouse: placementUnderMouse === placedView.placementId,
                    onMouseIsOver: noteMouseIsOver,
                    tap: tap?.placementId === placedView.placementId ? tap : null,
                    ask: asks[placedView.viewId] ?? EMPTY_CHART_ASK,
                    onAskChanged: changeAsk,
                    actThatOpenedCard: openCard?.placementId === placedView.placementId ? openCard.act : null,
                    isCardOpenedLate: openCard?.isHeardLate ?? false,
                    onCardOpenChange: setCardOpen,
                    onCaretOfCardSettled: settleCardCaret,
                    isCaretOfCardOwed: isCaretOfCardOwed,
                    onSteppedBackFromChange: stepBackFromChange,
                    onPageCannotAsk: notePageCannotAsk,
                    onKeepPressed: keepChange,
                    onPreviewCameOut: onPreviewCameOut,
                    lastBlurOfWindowAtMs: lastBlurOfWindowAtMs,
                    ...rest,
                    changes: changesNow,
                    canAgentWrite: canAgentWrite,
                  },
                  placedView.placementId,
                ),
            ),
          ],
        }),
      jsx('div', {
        className: 'sheet-placed-views',
        children: jsx(
          ChartBeingMade,
          {
            beingMade: chartBeingMade,
            body: rest.body,
            placesToldOf: placesToldOf,
            onGone: onChartBeingMadeGone,
          },
          sheetOnShow,
        ),
      }),
    ],
  });
}
export const AWAITED_CHART_CODE = {
  kind: 'awaited',
};
export const CHARTS_RUN_ON_NOTHING = {
  code: {
    of: () => AWAITED_CHART_CODE,
    follow: () => () => {
      return;
    },
    tookCaret: () => {
      return;
    },
    tookTooLong: () => {
      return;
    },
  },
  frameDocument: {
    now: () => null,
    follow: () => () => {
      return;
    },
    askAgainIfItDidNotCome: () => {
      return;
    },
  },
};
export const PLACED_VIEW_KEYS_HINT_ID = 'keys-of-floating-chart';
export const PLACED_VIEW_TYPING_HINT_ID = 'typing-on-floating-chart';
export const PLACEMENT_ID_ATTRIBUTE = 'data-placement-id';
export const PLACEMENT_ID_SELECTOR = `[${PLACEMENT_ID_ATTRIBUTE}]`;
export const PLACED_VIEW_CARET_CLASS = 'sheet-caret-of-placed-view';
export const PLACED_VIEW_CARET_SELECTOR = `.${PLACED_VIEW_CARET_CLASS}`;
export const PLACED_VIEW_TOOLS_CLASS = 'sheet-tools-of-placed-view';
export const PLACED_VIEW_ASK_BOX_CLASS = 'sheet-ask-box-of-placed-view';
export const placedViewCaretId = (placementId?: Dynamic) => `placed-view-${placementId}`;
export const placedViewCaptionId = (placementId?: Dynamic) => `caption-of-${placedViewCaretId(placementId)}`;
export const placedViewDrawingId = (placementId?: Dynamic) => `drawing-of-${placedViewCaretId(placementId)}`;
export const placedViewCardId = (placementId?: Dynamic) => `card-of-${placedViewCaretId(placementId)}`;
export const findPlacedViewCaret = (root?: Dynamic, placementId?: Dynamic) => root.getElementById(placedViewCaretId(placementId));
export const getPlacedViewRect = (root?: Dynamic, placementId?: Dynamic) =>
  findPlacedViewCaret(root, placementId)?.closest(PLACEMENT_ID_SELECTOR)?.getBoundingClientRect() ?? null;
export const placementIdAttributes = (placementId?: Dynamic) => ({
  [PLACEMENT_ID_ATTRIBUTE]: placementId,
});
export const placementIdOfElement = (target?: Dynamic) =>
  target instanceof Element ? (target.closest(PLACEMENT_ID_SELECTOR)?.getAttribute(PLACEMENT_ID_ATTRIBUTE) ?? null) : null;
export const doesCaretStayWithPlacement = (placementId?: Dynamic, caretTarget?: Dynamic) =>
  caretTarget === 'outOfWindow' || (caretTarget !== 'onNothing' && caretTarget.partOf === placementId);
export const howCaretComesToPlacedView = ({
  isCaretOfPressOnItsWay: isCaretOfPressOnItsWay,
  hasPageCaret: hasPageCaret,
  isCaretFreeToGo: isCaretFreeToGo,
}: Dynamic) => (isCaretOfPressOnItsWay ? 'comesByItself' : hasPageCaret && isCaretFreeToGo ? 'isBrought' : 'stays');
export const isInPlacedViewAskBox = (target?: Dynamic) =>
  target instanceof Element && target.closest(`.${PLACED_VIEW_ASK_BOX_CLASS}`) !== null;
export const isInPlacedViewCardOrTools = (target?: Dynamic) =>
  isInPlacedViewAskBox(target) || (target instanceof Element && target.closest(`.${PLACED_VIEW_TOOLS_CLASS}`) !== null);
export const isInPlacedViewControls = (target?: Dynamic) =>
  isInPlacedViewCardOrTools(target) || (target instanceof Element && target.closest(`.${FIX_OF_PLACED_VIEW_CLASS}`) !== null);
export const isPlacedViewAskInput = (target?: Dynamic) => target instanceof HTMLInputElement && isInPlacedViewAskBox(target);
export const findPlacedViewAskInput = (root?: Dynamic, placementId?: Dynamic) =>
  findPlacedViewCaret(root, placementId)?.closest(PLACEMENT_ID_SELECTOR)?.querySelector(`.${PLACED_VIEW_ASK_BOX_CLASS} input`) ?? null;
/** Every kind a chart can be changed to, in the order "Change chart type" lists them, with the sketch each row shows. */
export const PLACED_VIEW_TOOLS_MIN_PX = 64;
export const PLACED_VIEW_TOOLS_WITH_EDIT_PX = 104;
export const clampToolsCutOff = (cutOff?: Dynamic, size?: Dynamic, keptShown?: Dynamic) =>
  Math.max(0, Math.min(cutOff, size - keptShown));
export const FOCUS_WITHOUT_SCROLL = {
  preventScroll: true,
};
export const middleOfChartTitle = ({ width: width, height: height }: Dynamic) => 22 / Math.max(1, 320 / width, 200 / height);
export const CHART_NOTICE_OF_MISSING_CODE = {
  notPublished: 'cantBeShown',
  notCompiled: 'cantBeShown',
  notFetched: 'notLoaded',
  tookCaret: 'cantBeShownBeforeReload',
  anotherTookCaret: 'paused',
  tookTooLong: 'cantBeShown',
};
export const RETRIED_CHART_FAULTS = new (Set as Dynamic)(['threw', 'inputMissing', 'tooManyRows']);
export const nextTakesOverFromSkeleton = (takesOver: Dynamic, { isNoticeShown: isNoticeShown, isAwaited: isAwaited }: Dynamic) =>
  !isNoticeShown && (isAwaited || takesOver);
export const LAST_DRAWN_CHART_KEPT_MS = 1e4;
export const chartArtifactsToDraw = (artifact?: Dynamic, lastDrawn?: Dynamic) =>
  lastDrawn === null || lastDrawn === artifact ? [artifact] : [lastDrawn, artifact];
export const PlacedChart = React.memo(function ({
  runsOn: { code: codeSource, frameDocument: frameDocumentSource },
  nodeId: nodeId,
  ...rest
}: Dynamic) {
  let followCode = React.useCallback((onChange?: Dynamic) => codeSource.follow(nodeId, onChange), [codeSource, nodeId]);
  let codeNow = () => codeSource.of(nodeId);
  let code = React.useSyncExternalStore(followCode, codeNow, codeNow);
  let { onCameOut: onCameOut } = rest;
  let missingNodeId = code.kind === 'none' ? nodeId : null;
  React.useEffect(() => {
    if (missingNodeId !== null) onCameOut?.('failed');
  }, [missingNodeId, onCameOut]);
  let frameDocument = React.useSyncExternalStore(frameDocumentSource.follow, frameDocumentSource.now, frameDocumentSource.now);
  let isNoticeShown = code.kind === 'none' || frameDocument === 'notFetched';
  let isAwaited = code.kind === 'awaited' || frameDocument === null;
  let [takesOverFromSkeleton, setTakesOverFromSkeleton] = React.useState(isAwaited);
  let nextTakesOver = nextTakesOverFromSkeleton(takesOverFromSkeleton, {
    isNoticeShown: isNoticeShown,
    isAwaited: isAwaited,
  });
  if (nextTakesOver !== takesOverFromSkeleton) setTakesOverFromSkeleton(nextTakesOver);
  let artifactNow = isNoticeShown || isAwaited ? null : code.artifact;
  let [lastDrawn, setLastDrawn] = React.useState(null);
  let hasLastDrawnStayedLong = useIsTrueForVisibleMs(
    artifactNow !== null && lastDrawn !== null && lastDrawn !== artifactNow,
    LAST_DRAWN_CHART_KEPT_MS,
  );
  if (lastDrawn !== null && (artifactNow === null || hasLastDrawnStayedLong)) setLastDrawn(null);
  let handleCameOut = React.useCallback(
    (outcome?: Dynamic) => {
      setTakesOverFromSkeleton(false);
      setLastDrawn(outcome === 'drawn' ? artifactNow : null);
      onCameOut?.(outcome);
    },
    [artifactNow, onCameOut],
  );
  let handleLastDrawnCameOut = React.useCallback((outcome?: Dynamic) => {
    if (outcome === 'failed') setLastDrawn(null);
  }, []);
  let pointerNotTold = React.useRef(null);
  if (code.kind === 'none')
    return jsx(ChartCantBeShownNotice, {
      why: CHART_NOTICE_OF_MISSING_CODE[code.why],
    });
  if (frameDocument === 'notFetched')
    return jsx(ChartCantBeShownNotice, {
      why: 'notLoaded',
    });
  if (isAwaited)
    return jsx(ChartOnItsWay, {
      comesAtOnce: true,
    });
  let artifacts = chartArtifactsToDraw(code.artifact, lastDrawn);
  return jsx(Fragment, {
    children: artifacts.map((artifact?: Dynamic) => {
      let isNow = artifact === code.artifact;
      let isShown = artifacts.length === 1 || !isNow;
      return jsx(
        'div',
        {
          className: `absolute inset-0 ${isShown ? '' : 'invisible'}`,
          children: jsx(ChartNoticeGate, {
            isHeardOf: isShown,
            children: jsx(ChartDrawing, {
              frameDocument: frameDocument.text,
              artifact: artifact,
              takesOverFromSkeleton: nextTakesOver,
              onCodeTookCaret: () => codeSource.tookCaret(nodeId),
              onCodeTookTooLong: isNow ? () => codeSource.tookTooLong(nodeId) : () => setLastDrawn(null),
              ...rest,
              tellsOfPointer: isShown ? rest.tellsOfPointer : pointerNotTold,
              onCameOut: isNow ? handleCameOut : handleLastDrawnCameOut,
            }),
          }),
        },
        artifact,
      );
    }),
  });
});
export const EMPTY_CHART_ASK = {
  words: '',
  isOnItsWay: false,
  became: null,
};
export const canPlacedViewShowAskBox = (placedView?: Dynamic) =>
  placedView?.isSelected === true && placedView.askBoxStands !== null;
export const isNewCardAct = (act?: Dynamic, settledAct?: Dynamic) => act !== null && act !== settledAct;
export const whereCaretGoesAfterCard = (state?: Dynamic) =>
  !state.hasWindowKeyboard || !state.isCaretAtCardOrTools ? 'stays' : state.wasPencilPressedByKey ? 'toPencil' : 'toChart';
export const becameAfterCardChange = (became?: Dynamic, isOpening?: Dynamic) =>
  (became === 'taken') === isOpening ? null : became;
export const askAfterSent = ({ words: words }: Dynamic, sentWords?: Dynamic, became?: Dynamic) => ({
  words: became === 'taken' && words === sentWords ? '' : words,
  isOnItsWay: false,
  became: became,
});
export const LATE_EVENT_MS = 50;
export const isLateEvent = (madeAtMs?: Dynamic, nowMs2?: Dynamic) => !(nowMs2 - madeAtMs >= 0 && nowMs2 - madeAtMs < LATE_EVENT_MS);
export const RECENT_PRESS_MS = 300;
export const isPressFromThisWindow = (state?: Dynamic) =>
  state.hasWindowFocus ||
  (state.nowMs - state.madeAtMs >= 0 && state.nowMs - state.madeAtMs < RECENT_PRESS_MS && state.madeAtMs > state.lastBlurAtMs);
export const editButtonAct = (state?: Dynamic) => {
  if (state.isCardOpen) return state.isKeyBeforeCardHasCaret ? 'nothing' : 'shutsCard';
  if (!state.isCardOffered) return 'attachesChart';
  return state.isWindowLeft ? 'nothing' : 'opensCard';
};
export const mostAskWordsTyped = () =>
  MAX_ASK_WORDS_LENGTH -
  1 -
  (Math.max as Dynamic)(...STOCK_KINDS.map((kind?: Dynamic) => makeThisChartKindPrompt(kind).length));
export const askWordsOfKind = (kind?: Dynamic, words?: Dynamic) =>
  kind === 'any' ? words : [makeThisChartKindPrompt(kind), words.trim()].join(' ').trim();
export const MOST_CHARTS_RUN = 12;
export const KEPT_CHANGE_SHOWN_MS = 3000;
export const NO_PLACES_TOLD_OF = new (Set as Dynamic)();
