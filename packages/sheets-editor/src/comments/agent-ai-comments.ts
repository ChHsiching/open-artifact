import type { Dynamic } from '../dynamic.ts';
import { isNonNullObject } from '../utils/objects.ts';
import type { PageState } from '../state/initial-state.ts';
export function createHostComments(getAgent?: Dynamic, reportFault?: Dynamic, keepKeysOffCells: Dynamic = () => () => {}) {
  let listener: Dynamic = NO_COMMENTS_LISTENER;
  let hasStarted: Dynamic = false;
  let setUi: Dynamic = null;
  let uiState: Dynamic = {
    comments: {},
    composer: null,
  };
  let toldPlaces: Dynamic = {
    ofComments: {},
    ofBox: null,
  };
  let askedCard: Dynamic = null;
  let openedFromPage: Dynamic = null;
  let boxAnchor: Dynamic = null;
  let sentBox: Dynamic = null;
  let collapsedHandle: Dynamic = null;
  let commentsCapability: Dynamic = null;
  let couldSendToAgent: Dynamic = false;
  let asksWhenReady: Dynamic = false;
  let canSendAskNumber: Dynamic = 0;
  let boxShutsPending: Dynamic = 0;
  let boxShutSettled: Dynamic = Promise.resolve();
  let uiTurn: Dynamic = 0;
  let openTurn: Dynamic = 0;
  let exitMode: Dynamic = null;
  let modeEndsPending: Dynamic = 0;
  let modeEndSettled: Dynamic = Promise.resolve();
  let focusCard: Dynamic = null;
  let previewHandle: Dynamic = null;
  let closingCards = new (Map as Dynamic)();
  let cardHeights = new (Map as Dynamic)();
  let previewHeight: Dynamic = null;
  let pickedCardHeight: Dynamic = 0;
  let placesWantedListeners = new (Set as Dynamic)();
  let isAskingPlaces: Dynamic = false;
  let previewUnderMouse: Dynamic = null;
  let mouseOnPreviewListeners = new (Set as Dynamic)();
  let collapsedCards: Dynamic = [];
  let collapseCard = (handle?: Dynamic) => (
    (collapsedHandle = handle),
    {
      [handle]: {
        display: null,
      },
    }
  );
  let hoveredHandlesOf = ({ comments: comments }: Dynamic) =>
    Object.keys(comments).filter((handle?: Dynamic) => comments[handle]?.hovered === true);
  let toldStateOf = (state?: Dynamic) => ({
    listed: Object.entries(state.comments).map(
      ([handle, { anchor: anchor, resolved: resolved }]: Dynamic) => ({
        handle: handle,
        anchor: anchor,
        isResolved: resolved,
        isOpen: handle === expandedCommentHandle(state),
      }),
    ),
    boxAnchor: state.composer?.anchor ?? null,
  });
  let sentToAgentHandle = (state?: Dynamic) => {
    let composer = uiState.composer;
    if (state.composer !== null) sentBox = null;
    else if (composer?.sendToAgent === true && composer.anchor === boxAnchor && boxShutsPending === 0)
      sentBox = {
        anchor: composer.anchor,
        listed: Object.keys(uiState.comments),
        turn: uiTurn,
        sinceMs: Date.now(),
      };
    if (sentBox === null) return null;
    let { anchor: anchor, listed: listed, turn: turn, sinceMs: sinceMs } = sentBox;
    let newHandle = Object.entries(state.comments).find(
      ([handle, comment]: Dynamic) => !listed.includes(handle) && comment.anchor === anchor && !comment.resolved,
    )?.[0];
    if (newHandle === undefined) return null;
    sentBox = null;
    let isRecent = Date.now() - sinceMs <= SENT_COMMENT_MATCH_MS;
    return turn === uiTurn && isRecent ? newHandle : null;
  };
  let repliedHandlesOf = ({ comments: comments }: Dynamic) =>
    Object.keys(comments).filter((handle?: Dynamic) => {
      let [messageCount, messageCountBefore] = [comments[handle]?.messageCount, uiState.comments[handle]?.messageCount];
      return messageCount !== undefined && messageCountBefore !== undefined && messageCount > messageCountBefore;
    });
  let takeUiState = (state: PageState) => {
    if (!isCommentsUiState(state)) return null;
    let [expanded, wasExpanded] = [expandedCommentHandle(state), expandedCommentHandle(uiState)];
    let previewWasCollapsed = collapsedCardHandles(uiState).includes(previewHandle ?? '');
    let repliedTo = repliedHandlesOf(state);
    let listChanged = repliedTo.length > 0 || JSON.stringify(toldStateOf(state)) !== JSON.stringify(toldStateOf(uiState));
    let [hovered, wasHovered] = [hoveredHandlesOf(state), hoveredHandlesOf(uiState)];
    let sentHandle = sentToAgentHandle(state);
    uiState = state;
    if (listChanged)
      listener.told({
        ...toldStateOf(state),
        ...(sentHandle !== null && {
          sentToAgent: sentHandle,
        }),
        ...(repliedTo.length > 0 && {
          repliedTo: repliedTo,
        }),
      });
    if (JSON.stringify(hovered) !== JSON.stringify(wasHovered)) listener.pointedAt(hovered);
    if (expanded !== null && expanded !== wasExpanded && expanded !== askedCard) {
      uiTurn += 1;
      listener.picked(expanded, expanded === previewHandle ? 'preview' : 'list');
    }
    if (wasExpanded === askedCard && expanded !== askedCard) askedCard = null;
    if (wasExpanded === previewHandle && expanded !== previewHandle) previewHandle = null;
    if (
      previewWasCollapsed &&
      previewHandle !== null &&
      !closingCards.has(previewHandle) &&
      (state.comments[previewHandle]?.display ?? null) === null
    ) {
      let value = previewHandle;
      previewHandle = null;
      rePlaceCard(value);
    }
    let collapsedNow = collapsedCardHandles(state).filter((handle?: Dynamic) => handle !== previewHandle && handle !== askedCard);
    let newlyCollapsed = collapsedNow.filter((handle?: Dynamic) => !collapsedCards.includes(handle));
    if (setUi !== null) collapsedCards = collapsedNow;
    if (newlyCollapsed.length > 0 && setUi !== null) {
      let value = setUi({
        comments: Object.fromEntries(
          newlyCollapsed.map(
            (handle?: Dynamic) => [
              handle,
              {
                display: null,
              },
            ],
          ),
        ),
      });
      for (let handle of newlyCollapsed as Dynamic) waitCardClose(handle, value);
    }
    if (expanded !== wasExpanded) pickedCardHeight = 0;
    let cardHeight = state.comments[expanded ?? '']?.size?.height;
    if (expanded !== null && typeof cardHeight === 'number' && cardHeight > pickedCardHeight) {
      pickedCardHeight = cardHeight;
      cardHeights.set(expanded, cardHeight);
      askForPlaces();
    }
    let previewCardHeight = expanded === previewHandle ? undefined : state.comments[previewHandle ?? '']?.size?.height;
    let isNewPreviewHeight = previewHeight?.of !== previewHandle || previewHeight.px !== previewCardHeight;
    if (previewHandle !== null && typeof previewCardHeight === 'number' && isNewPreviewHeight) {
      previewHeight = {
        of: previewHandle,
        px: previewCardHeight,
      };
      askForPlaces();
    }
    let isPreviewHovered = expanded !== previewHandle && state.comments[previewHandle ?? '']?.hovered === true;
    let [lastMouseOnPreview, mouseOnPreview] = [previewUnderMouse, isPreviewHovered ? previewHandle : null];
    previewUnderMouse = mouseOnPreview;
    if (mouseOnPreview !== lastMouseOnPreview && (mouseOnPreview !== null || lastMouseOnPreview === previewHandle))
      for (let value of mouseOnPreviewListeners as Dynamic) value(mouseOnPreview !== null);
    return state;
  };
  let forgetPlace = (handle?: Dynamic) => {
    let { [handle]: dropped, ...otherPlaces } = toldPlaces.ofComments;
    toldPlaces = {
      ...toldPlaces,
      ofComments: otherPlaces,
    };
  };
  let askForPlaces = () => {
    isAskingPlaces = true;
    try {
      for (let listener2 of placesWantedListeners as Dynamic) listener2();
    } finally {
      isAskingPlaces = false;
    }
  };
  let rePlaceCard = (handle?: Dynamic) => {
    forgetPlace(handle);
    askForPlaces();
  };
  let waitCardClose = (handle?: Dynamic, closing?: Dynamic) => {
    let timeout = new (Promise as Dynamic)((resolve?: Dynamic) => void setTimeout(resolve, CARD_CLOSE_WAIT_MS));
    let closedOrTimedOut = Promise.race([closing, timeout]);
    closingCards.set(handle, closedOrTimedOut);
    closedOrTimedOut.finally(() => {
      if (closingCards.get(handle) !== closedOrTimedOut) return;
      closingCards.delete(handle);
      rePlaceCard(handle);
    });
  };
  let endCardPreview = () => {
    if (previewHandle === null || expandedCommentHandle(uiState) === previewHandle || askedCard === previewHandle) return;
    if (setUi === null) return;
    let handle = previewHandle;
    previewHandle = null;
    waitCardClose(
      handle,
      setUi({
        comments: {
          [handle]: {
            display: null,
          },
        },
      }),
    );
  };
  let closeCardNoLongerAsked = (handle?: Dynamic) => {
    askedCard = null;
    if (setUi === null || handle === previewHandle || !collapsedCardHandles(uiState).includes(handle)) return;
    waitCardClose(
      handle,
      setUi({
        comments: {
          [handle]: {
            display: null,
          },
        },
      }),
    );
  };
  let askCanSendToAgent = () => {
    canSendAskNumber += 1;
    let thisAsk = canSendAskNumber;
    asksWhenReady = commentsCapability === null;
    if (!hasMethod(commentsCapability, 'canSendToAgent')) return;
    let takeAnswer = (answer?: Dynamic) => {
      if (thisAsk === canSendAskNumber) couldSendToAgent = answer === 'available';
    };
    try {
      Promise.resolve(commentsCapability.canSendToAgent()).then(takeAnswer, () => takeAnswer(null));
    } catch {
      takeAnswer(null);
    }
  };
  let connectCommentsUi = async (): Promise<Dynamic> => {
    let agent = getAgent();
    let comments = hasMethod(agent, 'use') ? await agent.use('comments') : null;
    if (!hasMethod(comments, 'ui') || ('available' in comments && comments.available === false)) return;
    let ui = await comments.ui({
      change(state: PageState) {
        collapsedHandle = null;
        collapsedCards = [];
        takeUiState(state);
      },
    });
    if (!hasMethod(ui, 'set')) return;
    commentsCapability = comments;
    if (asksWhenReady) askCanSendToAgent();
    setUi = (changes?: Dynamic) =>
      Promise.resolve(ui.set(changes))
        .then(takeUiState, () => null)
        .then((state?: Dynamic) => {
          if (state === null || expandedCommentHandle(state) !== collapsedHandle) collapsedHandle = null;
          return state;
        });
    if (hasMethod(ui, 'exitMode'))
      exitMode = () =>
        Promise.race([
          new (Promise as Dynamic)((resolve?: Dynamic) => {
            resolve(ui.exitMode());
          }),
          new (Promise as Dynamic)((resolve?: Dynamic) => void setTimeout(resolve, EXIT_MODE_TIMEOUT_MS)),
        ]);
    if (hasMethod(ui, 'focus'))
      focusCard = (handle?: Dynamic, how?: Dynamic) =>
        void Promise.resolve(ui.focus(handle, how))
          .then((focused?: Dynamic) => (focused === true || how === 'card' ? null : ui.focus(handle, 'card')))
          .catch(() => null);
    listener.told(toldStateOf(uiState));
  };
  return {
    start(newListener?: Dynamic) {
      listener = newListener;
      if (setUi !== null) {
        newListener.told(toldStateOf(uiState));
        newListener.pointedAt(hoveredHandlesOf(uiState));
      }
      if (!hasStarted) connectCommentsUi().catch(() => reportFault(Error('agent.use fault: comments')));
      hasStarted = true;
      return () => {
        if (listener === newListener) listener = NO_COMMENTS_LISTENER;
      };
    },
    askWhetherAgentCanBeSent: askCanSendToAgent,
    couldSendToAgentWhenLastAnswered: () => couldSendToAgent,
    openBox({ isForAgent: isForAgent, sheetNumber: sheetNumber, ...box }: Dynamic) {
      let composer = {
        ...box,
        ...(sheetNumber !== undefined && {
          detail: commentSheetNumberDetail(sheetNumber),
        }),
      };
      endCardPreview();
      uiTurn += 1;
      let thisTurn = uiTurn;
      let releaseKeys = setUi === null ? null : keepKeysOffCells();
      let tryOpen = () => {
        if (thisTurn !== uiTurn) {
          releaseKeys?.();
          return;
        }
        if (modeEndsPending > 0) return void modeEndSettled.then(tryOpen, tryOpen);
        let lastAnchor = boxAnchor;
        boxAnchor = composer.anchor;
        setUi?.({
          composer: {
            ...composer,
            sendToAgent: isForAgent,
          },
        }).then((state?: Dynamic) => {
          if (state?.composer?.anchor === composer.anchor) return state;
          releaseKeys?.();
          if (boxAnchor === composer.anchor) boxAnchor = lastAnchor;
          return state;
        });
      };
      tryOpen();
    },
    open(handle?: Dynamic, at?: Dynamic, how?: Dynamic) {
      if (setUi === null) return;
      let isTaken = (uiState.comments[handle]?.resolved ?? true) || uiState.composer !== null || expandedCommentHandle(uiState) !== null;
      if (how === 'page' && isTaken) return;
      askedCard = handle;
      if (previewHandle === handle && previewHeight?.of !== handle) previewHandle = null;
      collapsedHandle = null;
      uiTurn += 1;
      let thisTurn = uiTurn;
      openTurn = thisTurn;
      let releaseKeys = focusCard === null || how === 'page' ? null : keepKeysOffCells();
      let tryOpen = () => {
        if (thisTurn !== uiTurn) {
          releaseKeys?.();
          if (askedCard === handle && thisTurn === openTurn) closeCardNoLongerAsked(handle);
          return;
        }
        if (boxShutsPending > 0) return void boxShutSettled.then(tryOpen, tryOpen);
        if (modeEndsPending > 0) return void modeEndSettled.then(tryOpen, tryOpen);
        let previewToClose = previewHandle !== null && previewHandle !== handle ? previewHandle : null;
        if (previewToClose !== null) previewHandle = null;
        let setting = setUi?.({
          comments: {
            [handle]: {
              at: at,
              display: {
                type: 'card',
                expanded: true,
              },
            },
            ...(previewToClose !== null && {
              [previewToClose]: {
                display: null,
              },
            }),
          },
        });
        if (previewToClose !== null && setting !== undefined) waitCardClose(previewToClose, setting);
        if (how === 'page')
          openedFromPage = {
            handle: handle,
            turn: thisTurn,
          };
        setting?.then((state?: Dynamic) => {
          if (openedFromPage?.turn === thisTurn) openedFromPage = null;
          let isOpen = state !== null && expandedCommentHandle(state) === handle;
          if (!isOpen) releaseKeys?.();
          if (!isOpen && askedCard === handle && thisTurn === openTurn) closeCardNoLongerAsked(handle);
          if (!isOpen) rePlaceCard(handle);
          if (isOpen) listener.told(toldStateOf(state));
          return state;
        });
        if (how !== 'page') focusCard?.(handle, how);
      };
      tryOpen();
    },
    cardAskedFor: () => askedCard,
    preview(handle?: Dynamic, at?: Dynamic) {
      let isBusy = expandedCommentHandle(uiState) !== null || askedCard !== null || uiState.composer !== null;
      if (setUi === null || isBusy || previewHandle === handle) return;
      [previewHandle, previewHeight] = [handle, null];
      setUi({
        comments: {
          [handle]: {
            at: at,
            display: {
              type: 'card',
            },
          },
        },
      }).then((state?: PageState) => {
        if ((state?.comments[handle]?.display ?? null) !== null) return state;
        if (previewHandle === handle) previewHandle = null;
        rePlaceCard(handle);
        return state;
      });
    },
    endPreview: endCardPreview,
    cardOnItsPoint() {
      if (previewHandle === null) return null;
      return {
        handle: previewHandle,
        isAtRest: expandedCommentHandle(uiState) !== previewHandle,
        isUnderMouse: uiState.comments[previewHandle]?.hovered === true,
      };
    },
    heightOfCard: (handle?: Dynamic) => cardHeights.get(handle) ?? null,
    heightOfPreview: (handle?: Dynamic) => (handle === previewHandle && previewHeight?.of === handle ? previewHeight.px : null),
    onPlacesWanted(listener2?: Dynamic) {
      placesWantedListeners.add(listener2);
      return () => void placesWantedListeners.delete(listener2);
    },
    onMouseOnPreviewChanged(listener2?: Dynamic) {
      mouseOnPreviewListeners.add(listener2);
      return () => void mouseOnPreviewListeners.delete(listener2);
    },
    shut() {
      uiTurn += 1;
      let handle = expandedCommentHandle(uiState) ?? openedFromPage?.handle ?? null;
      if (handle !== null && handle !== collapsedHandle)
        setUi?.({
          comments: collapseCard(handle),
        });
    },
    shutBox() {
      if (setUi === null || uiState.composer === null) return;
      let setting = setUi({
        composer: null,
      });
      boxShutsPending += 1;
      let settled = setting.finally(() => {
        boxShutsPending -= 1;
      });
      boxShutSettled = Promise.allSettled([boxShutSettled, settled]);
    },
    canEndMode: () => exitMode !== null,
    endMode(bumpsTurn?: Dynamic) {
      if (exitMode === null) return;
      let exiting = exitMode();
      let expectedTurn = bumpsTurn ? uiTurn + 1 : null;
      modeEndsPending += 1;
      let ended = exiting
        .then(
          (exited?: Dynamic) => exited === true,
          () => false,
        )
        .then((exited?: Dynamic) => {
          modeEndsPending -= 1;
          if (!exited && uiTurn === expectedTurn) uiTurn += 1;
          return exited;
        });
      modeEndSettled = Promise.allSettled([modeEndSettled, ended]);
    },
    tellPlaces(places?: Dynamic) {
      if (setUi === null || JSON.stringify(places) === JSON.stringify(toldPlaces)) return;
      if (previewHandle !== null && !(previewHandle in places.ofComments)) endCardPreview();
      let moves: Dynamic = {};
      for (let [handle, at] of Object.entries(places.ofComments) as Dynamic)
        if (!closingCards.has(handle))
          moves[handle] = {
            at: at,
          };
      if (!isAskingPlaces) collapsedCards = [];
      let expanded = expandedCommentHandle(uiState);
      let collapsesExpanded =
        expanded !== null && expanded !== collapsedHandle && expanded in toldPlaces.ofComments && !(expanded in places.ofComments);
      let movesBox =
        boxShutsPending === 0 && uiState.composer?.anchor === boxAnchor && JSON.stringify(places.ofBox) !== JSON.stringify(toldPlaces.ofBox);
      let { anchor: anchor, label: label, detail: detail, area: area, sendToAgent: sendToAgent } = uiState.composer ?? {};
      toldPlaces =
        boxShutsPending === 0
          ? places
          : {
              ...places,
              ofBox: toldPlaces.ofBox,
            };
      setUi({
        comments: {
          ...moves,
          ...(collapsesExpanded && collapseCard(expanded)),
        },
        ...(movesBox && {
          composer: {
            anchor: anchor,
            label: label,
            detail: detail,
            area: area,
            sendToAgent: sendToAgent,
            at: places.ofBox ?? undefined,
          },
        }),
      }).then((state?: Dynamic) => {
        if (state === null)
          toldPlaces = {
            ofComments: {},
            ofBox: null,
          };
        return state;
      });
    },
  };
}
export const expandedCommentHandle = ({ comments: comments }: Dynamic) =>
  Object.keys(comments).find((handle?: Dynamic) => comments[handle]?.display?.expanded === true) ?? null;
export const collapsedCardHandles = ({ comments: comments }: Dynamic) =>
  Object.keys(comments).filter((handle?: Dynamic) => {
    let display = comments[handle]?.display;
    return display?.type === 'card' && display.expanded !== true;
  });
export const isCommentsUiState = (state: PageState) => isNonNullObject(state) && isNonNullObject(state.comments);
export const hasMethod = (value?: Dynamic, methodName?: Dynamic) =>
  isNonNullObject(value) && typeof value[methodName] === 'function';
export const commentSheetNumberDetail = (sheetNumber?: Dynamic) =>
  `The cells are on sheetNumber ${sheetNumber}, where 1 is the first of the sheets that readSheets lists, as the sheets stood when the comment was begun. The numbers in the ids of the path are not positions.`;
export const NO_COMMENTS_LISTENER = {
  told() {},
  picked() {},
  pointedAt() {},
};
export const EXIT_MODE_TIMEOUT_MS = 2000;
export const CARD_CLOSE_WAIT_MS = 1000;
export const SENT_COMMENT_MATCH_MS = 1e4;
export const NO_AGENT_AI_COMMENTS = {
  start: () => () => {},
  askWhetherAgentCanBeSent() {},
  couldSendToAgentWhenLastAnswered: () => false,
  openBox() {},
  open() {},
  cardAskedFor: () => null,
  preview() {},
  endPreview() {},
  cardOnItsPoint: () => null,
  heightOfCard: () => null,
  heightOfPreview: () => null,
  onPlacesWanted: () => () => {},
  onMouseOnPreviewChanged: () => () => {},
  shut() {},
  shutBox() {},
  endMode() {},
  tellPlaces() {},
  canEndMode: () => false,
};
export const commentsForOtherSheet = (comments?: Dynamic) => ({
  ...NO_AGENT_AI_COMMENTS,
  start() {
    comments.tellPlaces({
      ofComments: {},
      ofBox: null,
    });
    return comments.start({
      told({ listed: listed }: Dynamic) {
        if (listed.some(({ isOpen: isOpen }: Dynamic) => isOpen)) comments.shut();
      },
      pointedAt() {},
      picked() {},
    });
  },
});
