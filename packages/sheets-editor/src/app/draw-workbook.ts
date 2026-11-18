import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import { createZoomStore } from '../grid/zoom.ts';
import { forgetKeptPlace, takePlaceToOpenOn, keepPlaceAcrossReloads } from '../store/kept-place.ts';
import { clearKeptOwnFilters, keepOwnFiltersAcrossReloads } from '../tables/kept-own-filters.ts';
import {
  forgetStoredCaretPlace,
  takeStoredCaretPlace,
  doCellsTakeCaretAtStart,
  shouldFocusEntryAtStart,
  isKeyForCellsAtStart,
  keepCaretPlaceStored,
} from '../state/caret-memory.ts';
import { forgetKeptEntry, takeKeptEntry, bringBackKeptEntry, keepEntryWhilePageIsLeft } from '../editor/kept-entry.ts';
import { renderInSheetsRoot } from '../shell/ui-root.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { createDomTextMeasurer } from '../grid/dom-text-measurer.ts';
import { readsWithTextMeasurer, createSheetController } from '../state/controller.ts';
import { createInitialPageState } from '../state/initial-state.ts';
import { hasStoredStepsToUndo, keepStepsToUndoFlag } from '../history/kept-steps-to-undo.ts';
import { readStoredDensity } from './density-preference.ts';
import { readTablesNotFormatted } from '../tables/tables-not-formatted.ts';
import { importFileChoices } from '../import/csv-file.ts';
import { createSheetClipboard } from '../clipboard/page-clipboard.ts';
import { sha256Hex } from '../utils/sha256.ts';
import { afterNextFrameOrTimeout } from '../utils/next-frame.ts';
import { createPressTracker } from './press-tracker.ts';
import { createSheetCommentActions, previewCommentCardOnItsPoint, commentCardPlaces } from '../comments/card-places.ts';
import { createCommentCardOnTap, createMouseAroundComments } from '../comments/mouse-around.ts';
import { atMenuOffers } from '../i18n/menu-labels.ts';
import { isChatBesidePage } from '../agent/chat-or-comment.ts';
import { agentActivityChangedEvent } from '../agent/turn-of-agent.ts';
import { AnnounceActiveCellContext } from '../grid/cell-drawing.ts';
import { IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
import { SheetsPage } from './sheet-page.ts';
import { dropdownOptionsLabel } from '../export/export-ready-dialog.ts';
import { syncShownSheetWithLinks, listenForCopySheetLinkShortcut } from '../links/sheet-link-sync.ts';
import { isGridOrGridPopupTrigger } from '../dom/grid-role.ts';
import { watchAgentActivity } from '../agent/activity.ts';
export function drawWorkbook(
  workbook?: Dynamic,
  mountElement?: Dynamic,
  onFailed?: Dynamic,
  shell?: Dynamic,
  people?: Dynamic,
  otherViewers?: Dynamic,
) {
  let zoom = createZoomStore(findTabStorage);
  let forgetKeptState = () => {
    forgetKeptPlace(storagesForViewer(shell.viewer));
    clearKeptOwnFilters(storagesForViewer(shell.viewer));
    forgetStoredCaretPlace(findTabStorage);
    forgetKeptEntry(findTabStorage);
    zoom.set(1);
  };
  let failAndForget = (error?: Dynamic) => {
    forgetKeptState();
    onFailed(error);
  };
  let hasDrawn: Dynamic = false;
  let errorWhileDrawing: Dynamic;
  let reactRoot = ReactDOMClient.createRoot(mountElement, {
    onUncaughtError(error?: Dynamic) {
      if (hasDrawn) failAndForget(error);
      else errorWhileDrawing = error;
    },
  });
  try {
    let stopOrError = mountSheetsApp(reactRoot, zoom, workbook, mountElement, shell, people, otherViewers);
    hasDrawn = true;
    return stopOrError;
  } catch (stopOrError: Dynamic) {
    reactRoot.unmount();
    mountElement.classList.remove('sheets-root');
    if (errorWhileDrawing !== undefined) forgetKeptState();
    throw errorWhileDrawing ?? stopOrError;
  }
}
export function mountSheetsApp(
  reactRoot?: Dynamic,
  zoom?: Dynamic,
  workbook?: Dynamic,
  mountElement?: Dynamic,
  shell?: Dynamic,
  people?: Dynamic,
  otherViewers?: Dynamic,
) {
  let counterRef = React.createRef();
  let renderPage = (content?: Dynamic) =>
    reactRoot.render(
      renderInSheetsRoot(
        jsxs(Fragment, {
          children: [
            jsx('div', {
              ref: counterRef,
              className: 'sheet-wrapped-text-counter',
              'aria-hidden': 'true',
            }),
            content,
          ],
        }),
      ),
    );
  ReactDOM.flushSync(() => renderPage(null));
  if (counterRef.current === null) throw Error('nothing can be drawn');
  let textMeasurer = createDomTextMeasurer(counterRef.current);
  let reads = readsWithTextMeasurer(workbook.reads(), textMeasurer);
  let storedCaretPlace = takeStoredCaretPlace(findTabStorage, performance.timeOrigin, wallClockAtTimeOrigin);
  let isEarlierVersionShown = workbook.refusalOfEveryEdit() === 'earlierVersionShown';
  let placeToOpenOn = takePlaceToOpenOn(storagesForViewer(shell.viewer), reads, shell.links.takeSheetOfNewLink(), isEarlierVersionShown);
  let initialState = createInitialPageState(
    reads,
    placeToOpenOn.toOpenOn,
    hasStoredStepsToUndo(findTabStorage),
    readStoredDensity(),
    readTablesNotFormatted() ?? [],
    importFileChoices.length > 0,
  );
  if (initialState === null) throw Error('the workbook has no cell to start on');
  let paneAtFirst = shell.versionLooks.takePaneAtFirst();
  let caretAtFirst = paneAtFirst?.doCellsTakeCaret === true ? 'inSpreadsheetTakenOff' : storedCaretPlace;
  mountElement.classList.add('sheets-root');
  let clipboard = createSheetClipboard(mountElement.ownerDocument, sha256Hex(mountElement.ownerDocument.location.host));
  let pageWindow = mountElement.ownerDocument.defaultView;
  let afterNextPaint = (callback?: Dynamic) =>
    pageWindow === null ? void setTimeout(callback) : afterNextFrameOrTimeout(pageWindow, callback);
  let pressTracker = pageWindow === null ? null : createPressTracker(pageWindow);
  let reducedMotion = pageWindow?.matchMedia('(prefers-reduced-motion:reduce)');
  let commentActions = createSheetCommentActions(shell.comments, () => readGridPlace());
  let commentCardOnTap = createCommentCardOnTap({
    cardAskedFor: () => shell.comments.cardAskedFor(),
    mayCome: () => controller.getView().grid.mayCommentBePreviewed,
    hasPageKeyboard: () => mountElement.ownerDocument.hasFocus(),
    open: (handle?: Dynamic) => commentActions.open(handle, true),
    shut: () => shell.comments.shut(),
  });
  let browser = {
    ...clipboard,
    ...textMeasurer,
    afterMs: (ms?: Dynamic, callback?: Dynamic) => void setTimeout(callback, ms),
    nowMs: () => performance.now(),
    framesToGlideOn: () => (mountElement.ownerDocument.hidden || reducedMotion?.matches !== false ? null : pageWindow),
    keyboard: {
      timesLeft: () => pressTracker?.timesFocusLeft() ?? 0,
      timesPressed: () => pressTracker?.timesBegun() ?? 0,
      isHere: () => mountElement.ownerDocument.hasFocus() || pressTracker?.hasPersonActedSinceFocusLeft('pressesOnly') === true,
    },
    keepKeysOffCells: shell.keepKeysOffCells,
    people: people,
    offersUnderAt: () =>
      atMenuOffers(
        new (Date as Dynamic)(),
        isChatBesidePage(() => controller.viewOnceEntryUnderAtIsDropped(), shell),
      ),
    otherViewers: otherViewers,
    agentForImport: shell.agentForImport,
    agentForConditionalFormats: shell.agentForConditionalFormats,
    agentForRowsAskedFor: shell.agentForRowsAskedFor,
    agentForFormulas: shell.agentForFormulas,
    agentForFixes: shell.agentForFixes,
    agentForCommands: shell.agentForCommands,
    chartsAreDescribedBy: shell.chartsAreDescribedBy,
    versionHistory: shell.versionHistory,
    versionLooks: shell.versionLooks,
    chartNodes: shell.chartNodes,
    copyLinkToSheet(sheetId?: Dynamic) {
      if (!mountElement.ownerDocument.hasFocus()) pageWindow?.focus();
      clipboard.forgetLastPutHere();
      return shell.links.copyLinkTo(sheetId);
    },
    comments: {
      ...commentActions,
      open(handle?: Dynamic, focusInPage?: Dynamic) {
        commentCardOnTap.forget();
        commentActions.open(handle, focusInPage);
      },
    },
  };
  let controller = createSheetController(workbook, browser, initialState);
  let readGridPlace = () => {
    let gridElement = mountElement.querySelector('.sheet-grid');
    return gridElement === null
      ? null
      : {
          grid: controller.getView().grid,
          gridElement: gridElement,
          zoom: zoom.now(),
        };
  };
  let mouseAroundComments = createMouseAroundComments({
    shown() {
      let cardOnItsPoint = shell.comments.cardOnItsPoint();
      return cardOnItsPoint?.isAtRest === true ? cardOnItsPoint.handle : commentCardOnTap.of();
    },
    isCardShown: () => commentCardOnTap.of() !== null,
    isMouseOnShown: () => shell.comments.cardOnItsPoint()?.isUnderMouse === true,
    show(handle?: Dynamic) {
      let gridPlace = readGridPlace();
      if (gridPlace !== null && controller.getView().grid.mayCommentBePreviewed) previewCommentCardOnItsPoint(shell.comments, handle, gridPlace);
    },
    showCard: (handle?: Dynamic) => commentCardOnTap.show(handle),
    hide() {
      if (!commentCardOnTap.hide()) shell.comments.endPreview();
    },
    after(ms?: Dynamic, callback?: Dynamic) {
      let timer = setTimeout(callback, ms);
      return {
        cancel: () => clearTimeout(timer),
      };
    },
  });
  let stopHearingPreviewMouse = shell.comments.onMouseOnPreviewChanged(
    (isOnPreview?: Dynamic) => mouseAroundComments.hostSaysItIsOnPreview(isOnPreview),
  );
  let stopTellingPlaces = shell.comments.onPlacesWanted(() => {
    let gridPlace = readGridPlace();
    if (gridPlace !== null)
      shell.comments.tellPlaces(
        commentCardPlaces(gridPlace, {
          asked: shell.comments.cardAskedFor(),
          onItsPoint: shell.comments.cardOnItsPoint()?.handle ?? null,
          heightOfCard: (handle?: Dynamic) => shell.comments.heightOfCard(handle),
          heightOfPreview: (handle?: Dynamic) => shell.comments.heightOfPreview(handle),
        }),
      );
  });
  let keptEntry = takeKeptEntry(findTabStorage, wallClockAtTimeOrigin, false);
  bringBackKeptEntry(controller, storedCaretPlace, keptEntry);
  if (paneAtFirst !== null)
    controller.dispatch({
      kind: 'versionHistoryCarriedOn',
      pane: paneAtFirst.pane,
      kept: paneAtFirst.kept,
    });
  if (paneAtFirst !== null && paneAtFirst.thenRestore !== null)
    controller.dispatch({
      kind: 'versionHistoryActedIn',
      act: {
        kind: 'restore',
        revision: paneAtFirst.thenRestore,
      },
    });
  let wasEntryOpenAtFirst = controller.isEntryOpen();
  let isFirstEntryStillOpen = () => wasEntryOpenAtFirst && controller.isEntryOpen();
  let hasPersonActed = () => shell.actsHeard.hasAnyCome() || storedCaretPlace === 'inCells' || storedCaretPlace === 'inEntry';
  let personAtWorkInPage = () =>
    mountElement.ownerDocument.hasFocus() && hasPersonActed()
      ? {
          isPersonAtWorkInPage: true,
        }
      : undefined;
  let hearAgentActivity = (isWorking?: Dynamic, isFirstWord?: Dynamic, hasShellAnswered?: Dynamic) => {
    controller.dispatch({
      ...agentActivityChangedEvent({
        isWorking: isWorking,
        isFirstWord: isFirstWord,
        hasShellAnswered: hasShellAnswered,
        isSheetJustMade: shell.isSheetJustMade(),
        hasPersonActedInSheet: hasPersonActed(),
        changedInTurn: isWorking ? null : shell.changedInTurnOfAgent(),
      }),
      ...personAtWorkInPage(),
    });
  };
  let pageTree: Dynamic;
  try {
    pageTree = jsxs(Fragment, {
      children: [
        jsx(AnnounceActiveCellContext, {
          value: IS_APPLE_PLATFORM,
          children: jsx(SheetsPage, {
            store: controller,
            clipboard: clipboard,
            reloadPage: null,
            shell: shell,
            oncePlaceholderIsOff: shell.oncePlaceholderIsOff,
            connectionNews: shell.connectionNews,
            wordsOfLoad: shell.wordsOfLoad,
            caretAtFirst: {
              mayCellsTake: () => pageWindow !== null && doCellsTakeCaretAtStart(caretAtFirst, false),
              mustCellsWait: () => shouldFocusEntryAtStart(caretAtFirst, shell.actsHeard.hasAnyCome(), isFirstEntryStillOpen()),
              doCellsTakeOncePainted: () => caretAtFirst === 'inSpreadsheetTakenOff',
              wasPointerPressedLast: paneAtFirst !== null && shell.actsHeard.wasPointerPressedLast(),
              mayKeyEndWait: (key?: Dynamic) => isKeyForCellsAtStart(caretAtFirst, key, isFirstEntryStillOpen()),
              actsHeard: shell.actsHeard,
            },
            isEarlierVersionLeft: paneAtFirst !== null && (paneAtFirst.pane?.look ?? null) === null && paneAtFirst.thenRestore === null,
            chatWithAgent: shell.chatWithAgent,
            ...(shell.chartsMadeByPage !== undefined && {
              chartsMadeByPage: shell.chartsMadeByPage,
            }),
            commentsOfHost: shell.comments,
            commentsLayer: shell.commentsLayer ?? null,
            mouseAroundComments: mouseAroundComments,
            ...(shell.sortsByOthers !== undefined && {
              sortsByOthers: shell.sortsByOthers,
            }),
            chartsRunOn: shell.chartsRunOn,
            ...(shell.changesOfCharts !== undefined && {
              changesOfCharts: shell.changesOfCharts,
            }),
            ...(shell.chartsWrittenByAgent !== undefined && {
              chartsWrittenByAgent: shell.chartsWrittenByAgent,
            }),
            ...(shell.filesForAgent !== undefined && {
              filesForAgent: shell.filesForAgent,
            }),
            gridZoom: zoom,
            isAgentWorkingNow: () => shell.agentActivity.isWorking(),
          }),
        }),
        jsx(AgentActivityListener, {
          activity: shell.agentActivity,
          afterNextPaint: afterNextPaint,
          hear: hearAgentActivity,
        }),
      ],
    });
    if (paneAtFirst === null) renderPage(pageTree);
  } catch (reloadOrError: Dynamic) {
    throw (controller.stop(), pressTracker?.stop(), reloadOrError);
  }
  let tellShellOfEntry = () => {
    shell.entryIsChanged(controller.doesLeaveLoseWork());
    shell.entryIsOpen(controller.isEntryOpen());
  };
  let stopTellingShellOfEntry = controller.subscribe(tellShellOfEntry);
  tellShellOfEntry();
  let stopFollowingChangesByAgent = shell.changesByAgent.onChanged(
    (changes?: Dynamic) =>
      controller.dispatch({
        kind: 'changesByAgentChanged',
        changes: changes,
        ...personAtWorkInPage(),
      }),
  );
  shell.xlsxFileCanBeWritten(
    (withCharts?: Dynamic, fileTitle?: Dynamic) => controller.writeXlsxFile(dropdownOptionsLabel(), withCharts, fileTitle),
  );
  shell.csvFileCanBeWritten(controller.writeCsvFile);
  shell.offerFollow((tabKey?: Dynamic) => {
    let userId = tabKey === null ? null : otherViewers.personWithTab(tabKey);
    controller.dispatch({
      kind: 'followAsked',
      tabKey: tabKey,
      userId: userId,
    });
  });
  let stopViewShownByAgent = shell.viewShownByAgent.start(
    (shown?: Dynamic) =>
      controller.dispatch({
        kind: 'viewShownByAgentChanged',
        shown: shown,
        ...personAtWorkInPage(),
      }),
  );
  let stopComments = shell.comments.start({
    told: (told?: Dynamic) =>
      controller.dispatch({
        kind: 'commentsTold',
        ...told,
      }),
    pointedAt: (handles?: Dynamic) =>
      controller.dispatch({
        kind: 'commentsPointedAt',
        handles: handles,
      }),
    picked: (handle?: Dynamic, how?: Dynamic) =>
      controller.dispatch({
        kind: 'commentPicked',
        handle: handle,
        ...(how === 'preview' && {
          isByPreview: true,
        }),
      }),
  });
  let stopKeepingPlace = keepPlaceAcrossReloads(
    storagesForViewer(shell.viewer),
    controller,
    afterNextPaint,
    placeToOpenOn.isTabsOwn,
    isEarlierVersionShown
      ? {
          cellOpenedFor: placeToOpenOn.toOpenOn?.activeCell ?? null,
          has: (cell?: Dynamic) => workbook.reads().positionOfCell(cell) !== null,
        }
      : null,
  );
  let stopKeepingOwnFilters = isEarlierVersionShown
    ? null
    : keepOwnFiltersAcrossReloads(storagesForViewer(shell.viewer), controller, afterNextPaint);
  let stopKeepingEntry = keepEntryWhilePageIsLeft(findTabStorage, controller, afterNextPaint, {
    hasCaret: () => mountElement.ownerDocument.hasFocus(),
    onLeftPage(listener?: Dynamic) {
      pageWindow?.addEventListener('blur', listener);
      return () => pageWindow?.removeEventListener('blur', listener);
    },
    onCameBackToPage(listener?: Dynamic) {
      pageWindow?.addEventListener('focus', listener);
      return () => pageWindow?.removeEventListener('focus', listener);
    },
    wallNowMs: () => Date.now(),
  });
  let stopSyncingSheetLinks = syncShownSheetWithLinks(shell.links, controller);
  let stopKeepingStepsToUndo = isEarlierVersionShown ? null : keepStepsToUndoFlag(findTabStorage, controller);
  let stopCopyLinkShortcut =
    pageWindow === null
      ? null
      : listenForCopySheetLinkShortcut(
          pageWindow,
          () =>
            controller.dispatch({
              kind: 'sheetLinkCopyChosen',
              sheetId: null,
            }),
        );
  let { ownerDocument: ownerDocument } = mountElement;
  let stopKeepingCaretPlace = keepCaretPlaceStored(
    findTabStorage,
    (callback?: Dynamic) => (pageWindow === null ? void setTimeout(callback) : afterNextFrameOrTimeout(pageWindow, callback)),
    {
      isInCells: () =>
        ownerDocument.hasFocus() ? ownerDocument.activeElement !== null && isGridOrGridPopupTrigger(ownerDocument.activeElement) : null,
      isInEntry: () =>
        controller.getView().mode.kind === 'editing' && ownerDocument.activeElement?.matches('.sheet-cell-editor, .sheet-formula-field') === true,
      onMoved(listener?: Dynamic) {
        let onFocusIn = () => listener(true);
        let onFocusOut = () => listener(false);
        ownerDocument.addEventListener('focusin', onFocusIn);
        ownerDocument.addEventListener('focusout', onFocusOut);
        return () => {
          ownerDocument.removeEventListener('focusin', onFocusIn);
          ownerDocument.removeEventListener('focusout', onFocusOut);
        };
      },
      onCameBackToPage(listener?: Dynamic) {
        pageWindow?.addEventListener('focus', listener, true);
        pageWindow?.addEventListener('pageshow', listener);
        return () => {
          pageWindow?.removeEventListener('focus', listener, true);
          pageWindow?.removeEventListener('pageshow', listener);
        };
      },
      onPageEnds(listener?: Dynamic) {
        pageWindow?.addEventListener('pagehide', listener);
        return () => pageWindow?.removeEventListener('pagehide', listener);
      },
      onEntryOpenedOrEnded(listener?: Dynamic) {
        let wasEditing: Dynamic = null;
        return controller.subscribe(() => {
          let isEditing = controller.getView().mode.kind === 'editing';
          if (isEditing !== wasEditing) listener();
          wasEditing = isEditing;
        });
      },
      onLeftPage(listener?: Dynamic) {
        pageWindow?.addEventListener('blur', listener);
        return () => pageWindow?.removeEventListener('blur', listener);
      },
      nowMs: () => performance.timeOrigin + performance.now(),
      wallNowMs: () => Date.now(),
    },
  );
  let tellWhetherCellsHoldSomething = () => shell.cellsHoldSomething(!workbook.reads().isEveryCellBlank);
  tellWhetherCellsHoldSomething();
  let stopWatchingWorkbook = workbook.onChanged(tellWhetherCellsHoldSomething);
  let stopApp = () => {
    stopKeepingCaretPlace();
    stopKeepingEntry();
    stopCopyLinkShortcut?.();
    stopSyncingSheetLinks();
    stopKeepingPlace();
    stopKeepingOwnFilters?.();
    stopViewShownByAgent();
    stopComments();
    stopHearingPreviewMouse();
    stopTellingPlaces();
    mouseAroundComments.stop();
    stopTellingShellOfEntry();
    stopFollowingChangesByAgent();
    shell.entryIsOpen(false);
    stopWatchingWorkbook();
    pressTracker?.stop();
    shell.cellsHoldSomething(null);
    shell.csvFileCanBeWritten(null);
    shell.xlsxFileCanBeWritten(null);
    shell.offerFollow(null);
    reactRoot.unmount();
    mountElement.classList.remove('sheets-root');
    try {
      controller.stop();
    } finally {
      shell.entryIsChanged(false);
    }
    stopKeepingStepsToUndo?.();
  };
  if (paneAtFirst === null) return stopApp;
  ReactDOM.flushSync(() => renderPage(pageTree));
  if (mountElement.hasChildNodes()) return stopApp;
  throw (stopApp(), Error('nothing can be drawn'));
}
export function AgentActivityListener({ activity: activity, afterNextPaint: afterNextPaint, hear: hear }: Dynamic) {
  React.useEffect(() => watchAgentActivity(activity, afterNextPaint, hear), [activity, afterNextPaint, hear]);
  return null;
}
export const wallClockAtTimeOrigin = Date.now() - performance.now();
export const findTabStorage = () => sessionStorage;
export const storagesForViewer = (viewer?: Dynamic) => ({
  findTabs: findTabStorage,
  findBrowsers: () => localStorage,
  viewer: viewer,
  wallNowMs: () => Date.now(),
});
