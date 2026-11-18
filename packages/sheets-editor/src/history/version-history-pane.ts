import { Menu } from '../kit/menu.tsx';
import { Avatar } from '../kit/avatar.tsx';
import { Skeleton, SkeletonGroup } from '../kit/skeleton.tsx';
import { likelyHasKeyboard } from '../kit/platform.ts';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { versionAuthorName, versionTimeText, versionHistoryMessages, versionAuthorsText, versionHistoryFailureText } from './version-text.ts';
import { showTitleIfTextOverflows } from '../ui/card-rows.ts';
import { blockRepeatedEnterOrSpace } from '../ui/repeated-key-guards.ts';
import { swallowRestOfPress } from '../ui/press-swallow.ts';
import { wasFocusDroppedWith } from '../ui/focus-rescue.ts';
import { revealInSidePane, useSidePaneCaret, focusPaneStart, useKeepCaretInView, SidePane, PaneEmptyState } from '../ui/side-pane/side-pane.ts';
import { LOOK_AGAIN_MAX_DELAY_MS, useStartOfToday, blankWhileAwaited } from './cell-history-popover.ts';
export function VersionAuthorAvatars({ authors: authors }: Dynamic) {
  let agentAuthors = authors.filter(({ kind: kind }: Dynamic) => kind === 'agent');
  let otherAuthors = authors.filter(({ kind: kind }: Dynamic) => kind !== 'agent');
  return jsx('span', {
    'aria-hidden': true,
    className: 'flex shrink-0 items-center gap-0.5 [--ui-avatar-xs:1rem]',
    children: [...otherAuthors.slice(0, VERSION_AUTHOR_AVATAR_LIMIT - agentAuthors.length), ...agentAuthors].map(
      (author?: Dynamic) =>
        author.kind === 'agent'
          ? jsx(
              Avatar,
              {
                size: 'xs',
                variant: 'agent',
                name: versionAuthorName(author),
              },
              'agent',
            )
          : jsx(
              Avatar,
              {
                size: 'xs',
                name: versionAuthorName(author),
                src: author.avatarUrl,
              },
              author.userId,
            ),
    ),
  });
}
export function restoreOfVersion({
  version: { revision: revision, isCurrent: isCurrent, isBeingRestored: isBeingRestored },
  isTakingBack: isTakingBack,
  wasPointerPressedLast: wasPointerPressedLast,
  onAct: onAct,
}: Dynamic) {
  if (isCurrent) return null;
  return {
    isBusy: isBeingRestored,
    isOff: isTakingBack && !isBeingRestored,
    go: () =>
      onAct({
        kind: 'restore',
        revision: revision,
        ...(wasPointerUsedWithKeyboard(wasPointerPressedLast) && {
          isByPointer: true,
        }),
      }),
  };
}
export function VersionRow(props?: Dynamic) {
  let { version: version, nowMs: nowMs2, isFirst: isFirst, onPicked: onPicked, onMenuOpenChange: onMenuOpenChange } = props;
  let { atMs: atMs, authors: authors, firstRevision: firstRevision, isCurrent: isCurrent } = version;
  let restore = restoreOfVersion(props);
  let isExpanded = props.isPicked && restore !== null;
  let menuTriggerId = React.useId();
  let isRestoreInRow = isExpanded && !props.isRestoreInBar;
  let [isMenuOpen, setMenuOpen] = React.useState(false);
  let changeMenuOpen = (isOpen?: Dynamic) => {
    setMenuOpen(isOpen);
    onMenuOpenChange(firstRevision, isOpen);
  };
  let unpickIfCurrent = React.useEffectEvent(() => {
    if (props.isPicked)
      props.onAct({
        kind: 'endLook',
      });
  });
  React.useEffect(() => {
    if (isCurrent) unpickIfCurrent();
  }, [isCurrent]);
  let rowContents = jsxs(Fragment, {
    children: [
      jsxs('span', {
        className: 'relative block text-body text-primary tabular-nums',
        children: [
          versionTimeText(atMs, nowMs2),
          isCurrent && ' ',
          isCurrent &&
            jsx('span', {
              className: 'ms-xs text-caption text-secondary',
              children: versionHistoryMessages.currentVersion(),
            }),
        ],
      }),
      jsxs('span', {
        className: 'relative mt-1 flex min-h-4 min-w-0 items-start gap-1.5 text-caption leading-4 text-secondary',
        children: [
          jsx(VersionAuthorAvatars, {
            authors: authors,
          }),
          jsx('span', {
            className: isExpanded || isCurrent ? 'min-w-0 wrap-anywhere' : 'truncate',
            onPointerEnter: showTitleIfTextOverflows,
            children: versionAuthorsText(authors),
          }),
        ],
      }),
    ],
  });
  return jsx('li', {
    ...{
      [VERSION_ROW_ATTRIBUTE]: firstRevision,
    },
    className: `group/version relative px-sm py-0.5 focus-visible:outline-hidden ${isFirst || isExpanded ? '' : 'before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-alpha-1 hover:before:hidden has-focus-visible:before:hidden'}`,
    children: jsxs('div', {
      className: isExpanded ? 'rounded-lg bg-fill-ghost-hover outline-1 -outline-offset-1 outline-transparent' : undefined,
      children: [
        jsxs('div', {
          className: `relative flex rounded-lg py-2.5 ps-sm pe-sm -outline-offset-2 outline-transparent group-focus-visible/version:shadow-focus group-focus-visible/version:outline-2 has-[>[data-picks-version]:focus-visible]:shadow-focus has-[>[data-picks-version]:focus-visible]:outline-2 ${isExpanded || isCurrent ? '' : 'group-hover/version:bg-fill-ghost-hover'}`,
          children: [
            restore === null && props.isAnotherPicked
              ? jsx('button', {
                  type: 'button',
                  ...{
                    [PICKS_VERSION_ATTRIBUTE]: true,
                  },
                  className: 'min-w-0 flex-1 cursor-(--ui-cursor-interactive) text-start outline-none before:absolute before:inset-0',
                  onKeyDown: blockRepeatedEnterOrSpace,
                  onClick: () => onPicked(false),
                  children: rowContents,
                })
              : restore === null
                ? jsx('div', {
                    className: 'min-w-0 flex-1',
                    children: rowContents,
                  })
                : jsx('button', {
                    type: 'button',
                    ...{
                      [PICKS_VERSION_ATTRIBUTE]: true,
                    },
                    'aria-expanded': isExpanded,
                    'aria-controls': isExpanded ? menuTriggerId : undefined,
                    className: 'min-w-0 flex-1 cursor-(--ui-cursor-interactive) text-start outline-none before:absolute before:inset-0',
                    onContextMenu: (event?: Dynamic) => {
                      if (isRestoreInRow) return;
                      event.preventDefault();
                      changeMenuOpen(true);
                    },
                    onKeyDown: blockRepeatedEnterOrSpace,
                    onClick: (event?: Dynamic) => {
                      swallowRestOfPress(event);
                      onPicked(!isExpanded);
                    },
                    children: rowContents,
                  }),
            restore !== null &&
              !isRestoreInRow &&
              jsx(VersionRowMenu, {
                id: menuTriggerId,
                restore: restore,
                isRowPicked: isExpanded,
                isOpen: isMenuOpen,
                onOpenChange: changeMenuOpen,
                whatHasCaretAfter: props.whatHasCaretAfter,
                wasPointerPressedLast: props.wasPointerPressedLast,
              }),
          ],
        }),
        isRestoreInRow &&
          jsx('div', {
            id: menuTriggerId,
            className: 'flex px-sm pb-2',
            children: jsx(Button, {
              variant: 'secondary',
              size: 'xs',
              busy: restore.isBusy,
              disabled: restore.isOff,
              onClick: restore.go,
              children: versionHistoryMessages.restore(),
            }),
          }),
      ],
    }),
  });
}
export function VersionRowMenu({
  id: id,
  restore: restore,
  isRowPicked: isRowPicked,
  isOpen: isOpen,
  onOpenChange: onOpenChange,
  whatHasCaretAfter: whatHasCaretAfter,
  wasPointerPressedLast: wasPointerPressedLast,
}: Dynamic) {
  let triggerRef = React.useRef(null);
  let isOpenRef = React.useRef(isOpen);
  let [isTriggerShown, setTriggerShown] = React.useState(false);
  if (isOpen && !isTriggerShown) setTriggerShown(true);
  let closeOnUnmount = React.useEffectEvent(() => onOpenChange(false));
  React.useEffect(() => () => closeOnUnmount(), []);
  return jsxs(Menu.Root, {
    modal: false,
    open: isOpen,
    onOpenChange: (nextOpen?: Dynamic) => {
      isOpenRef.current = nextOpen;
      onOpenChange(nextOpen);
    },
    onOpenChangeComplete: (nextOpen?: Dynamic) => {
      if (nextOpen) return;
      setTimeout(() => {
        if (triggerRef.current?.ownerDocument.activeElement !== triggerRef.current) setTriggerShown(false);
      });
    },
    children: [
      jsx(Menu.Trigger, {
        render: jsx(Button, {
          ref: triggerRef,
          id: id,
          variant: 'ghost',
          size: 'xs',
          iconOnly: true,
          icon: jsx(Icon, {
            name: 'DotsHorizontal',
            size: 'sm',
          }),
          'aria-label': versionHistoryMessages.moreActions(),
          busy: restore.isBusy,
          className: `absolute end-2 top-2 text-secondary ${isTriggerShown || isRowPicked || restore.isBusy ? '' : 'invisible group-hover/version:visible'}`,
          onFocus: () => setTriggerShown(true),
          onBlur: () => {
            if (!isOpenRef.current) setTriggerShown(false);
          },
        }),
      }),
      jsx(Menu.Popup, {
        align: 'end',
        finalFocus: () => (wasPointerPressedLast() ? whatHasCaretAfter() : true),
        onKeyDownCapture: blockRepeatedEnterOrSpace,
        children: jsx(Menu.Item, {
          disabled: restore.isOff || restore.isBusy,
          onClick: (event?: Dynamic) => {
            swallowRestOfPress(event);
            restore.go();
          },
          children: versionHistoryMessages.restore(),
        }),
      }),
    ],
  });
}
export function VersionListSkeleton() {
  return jsx(SkeletonGroup, {
    label: versionHistoryMessages.loading(),
    className: 'flex flex-col gap-5 py-5 ps-lg pe-md',
    children: VERSION_SKELETON_ROWS.map(
      (rowIndex?: Dynamic) =>
        jsxs(
          'div',
          {
            className: 'flex flex-col gap-1',
            children: [
              jsx(Skeleton, {
                width: '45%',
                className: 'text-body',
              }),
              jsxs('div', {
                className: 'flex items-center gap-1.5',
                children: [
                  jsx(Skeleton, {
                    className: 'size-4 shrink-0 rounded-full',
                  }),
                  jsx(Skeleton, {
                    width: '40%',
                    className: 'text-caption',
                  }),
                ],
              }),
            ],
          },
          rowIndex,
        ),
    ),
  });
}
export function useVersionListFocusKeeping({
  history: versionHistory,
  paneRef: paneRef,
  wasPointerPressedLast: wasPointerPressedLast,
}: Dynamic) {
  let focusedRowRef = React.useRef(null);
  let awaited = versionHistory?.awaited ?? null;
  let lastAwaitedRef = React.useRef(awaited);
  let lastRevisionBeforeOlderRef = React.useRef(undefined);
  React.useLayoutEffect(() => {
    let lastAwaited = lastAwaitedRef.current;
    if (lastAwaited === awaited) return;
    lastAwaitedRef.current = awaited;
    let versions = versionHistory?.versions ?? [];
    if (awaited !== null) {
      lastRevisionBeforeOlderRef.current = versions.at(-1)?.firstRevision;
      return;
    }
    let focusedRow = focusedRowRef.current;
    if (focusedRow === null) return;
    if (!focusedRow.isConnected) focusedRowRef.current = null;
    let ownerDocument = focusedRow.ownerDocument;
    let lastRowIndex = versions.findIndex((version?: Dynamic) => version.firstRevision === lastRevisionBeforeOlderRef.current);
    let movesToNextRow =
      lastAwaited === 'older' &&
      !wasPointerPressedLast() &&
      ownerDocument.activeElement === focusedRow &&
      lastRowIndex !== -1 &&
      versions[lastRowIndex + 1] !== undefined;
    if ((!wasFocusDroppedWith(focusedRow, ownerDocument) && !movesToNextRow) || !ownerDocument.hasFocus()) return;
    let rowToFocus =
      paneRef.current?.querySelector(`[${VERSION_ROW_ATTRIBUTE}="${(versions[lastRowIndex + 1] ?? versions[lastRowIndex])?.firstRevision}"]`) ?? null;
    if (rowToFocus === null) return;
    rowToFocus.tabIndex = -1;
    rowToFocus.addEventListener('blur', function dropTabIndex() {
      if (rowToFocus.ownerDocument.activeElement === rowToFocus) return;
      rowToFocus.removeAttribute('tabindex');
      rowToFocus.removeEventListener('blur', dropTabIndex);
    });
    rowToFocus.focus({
      preventScroll: true,
      focusVisible: !wasPointerPressedLast(),
    });
    revealInSidePane(paneRef.current, rowToFocus);
  });
  return React.useMemo(
    () => ({
      onFocus: ({ currentTarget: currentTarget }: Dynamic) => void (focusedRowRef.current = currentTarget),
      onBlur: () => void (focusedRowRef.current = null),
    }),
    [],
  );
}
export const VERSION_AUTHOR_AVATAR_LIMIT = 3;
export const VERSION_SKELETON_ROWS = [0, 1, 2, 3];
export const VERSION_ROW_ATTRIBUTE = 'data-row-of-version';
export const PICKS_VERSION_ATTRIBUTE = 'data-picks-version';
export const wasPointerUsedWithKeyboard = (wasPointerPressedLast?: Dynamic) =>
  wasPointerPressedLast?.() === true && likelyHasKeyboard();
export const isHoveredByMouse = (element?: Dynamic) =>
  element?.matches(':hover') === true && element.ownerDocument.defaultView?.matchMedia('(hover:hover)').matches === true;
export const VersionHistoryPane = React.memo(function (props?: Dynamic) {
  let {
    history: versionHistory,
    timesAsked: timesAsked,
    paneRef: paneRef,
    whatHasCaretAfter: whatHasCaretAfter,
    wasPointerPressedLast: wasPointerPressedLast,
  } = props;
  let { onAct: onAct, onLookAgain: onLookAgain } = props;
  useSidePaneCaret({
    isOpen: versionHistory !== null,
    isCaretLeftAsItOpens: versionHistory?.isCaretForCells === true,
    timesAsked: timesAsked,
    paneRef: paneRef,
    putCaretWhereToStart() {
      let pickedButton = paneRef.current?.querySelector(
        `[${VERSION_ROW_ATTRIBUTE}="${versionHistory?.picked ?? versionHistory?.pickedLast}"] button`,
      );
      if (pickedButton !== null && pickedButton !== undefined)
        return (
          pickedButton.focus({
            preventScroll: true,
            focusVisible: !wasPointerPressedLast(),
          }),
          revealInSidePane(paneRef.current, pickedButton)
        );
      return void focusPaneStart(paneRef.current, 'start', {
        isByPointer: wasPointerPressedLast(),
      });
    },
    whatHasCaretAfter: whatHasCaretAfter,
  });
  let openMenuRowRef = React.useRef(null);
  let onRowMenuOpenChange = React.useCallback((revision?: Dynamic, isOpen?: Dynamic) => {
    if (isOpen) openMenuRowRef.current = revision;
    else if (openMenuRowRef.current === revision) openMenuRowRef.current = null;
  }, []);
  let behindAtChangeCount = versionHistory?.behindAtChangeCount ?? null;
  React.useEffect(() => {
    if (behindAtChangeCount === null) return;
    let timer: Dynamic = setTimeout(function checkAgain() {
      if (!isHoveredByMouse(paneRef.current) && openMenuRowRef.current === null) return onLookAgain();
      timer = setTimeout(checkAgain, LOOK_AGAIN_MAX_DELAY_MS);
      return;
    }, LOOK_AGAIN_MAX_DELAY_MS);
    return () => clearTimeout(timer);
  }, [behindAtChangeCount, onLookAgain, paneRef]);
  let focusKeepingProps = useVersionListFocusKeeping({
    history: versionHistory,
    paneRef: paneRef,
    wasPointerPressedLast: wasPointerPressedLast,
  });
  useKeepCaretInView(paneRef, versionHistory !== null, wasPointerPressedLast);
  let isAwaitingOlder = versionHistory?.awaited === 'older';
  let nowMs2 = useStartOfToday();
  let pickedRevision = versionHistory?.picked ?? null;
  React.useLayoutEffect(() => {
    let pickedRow = paneRef.current?.querySelector(`[${VERSION_ROW_ATTRIBUTE}="${pickedRevision}"]`);
    if (pickedRow !== null && pickedRow !== undefined) revealInSidePane(paneRef.current, pickedRow);
  }, [pickedRevision, paneRef]);
  if (versionHistory === null) return null;
  let { versions: versions, whyNotRead: whyNotRead, isTakingBack: isTakingBack } = versionHistory;
  let whyNotWords = whyNotRead === null ? null : versionHistoryFailureText(whyNotRead);
  return jsxs(SidePane, {
    ref: paneRef,
    title: versionHistoryMessages.title(),
    takesNoTyping: props.takesNoTyping,
    width: props.paneWidth,
    onWidthChange: props.onPaneWidthChange,
    onClose: props.onShut,
    onKeyDown: (event?: Dynamic) => {
      if (event.key === 'Escape' && pickedRevision !== null) {
        event.preventDefault();
        return onAct({
          kind: 'endLook',
        });
      }
      return props.onKeyDownInPane(event);
    },
    onPressed: () => {
      if (openMenuRowRef.current === null) props.onPressed();
    },
    wasPointerPressedLast: wasPointerPressedLast,
    children: [
      versions === null && whyNotWords === null && jsx(VersionListSkeleton, {}),
      versions === null &&
        jsx(PaneEmptyState, {
          isSaid: true,
          title: versionHistory.awaited === null ? (whyNotWords?.title ?? '') : blankWhileAwaited(whyNotWords?.title),
          hint: versionHistory.awaited === null ? (whyNotWords?.hint ?? '') : blankWhileAwaited(whyNotWords?.hint),
          action:
            whyNotWords?.canTryAgain === true &&
            jsx(Button, {
              ...focusKeepingProps,
              variant: 'secondary',
              size: 'sm',
              busy: versionHistory.awaited !== null,
              busyLabel: versionHistoryMessages.loading(),
              onClick: () =>
                onAct({
                  kind: 'tryAgain',
                }),
              children: versionHistoryMessages.tryAgain(),
            }),
        }),
      versions !== null &&
        jsx('ul', {
          className: 'flex min-w-0 shrink-0 flex-col py-3',
          children: versions.map(
            (version?: Dynamic, index?: Dynamic) =>
              jsx(
                VersionRow,
                {
                  version: version,
                  nowMs: nowMs2,
                  isFirst: index === 0,
                  isPicked: pickedRevision === version.firstRevision,
                  isAnotherPicked: pickedRevision !== null && pickedRevision !== version.firstRevision,
                  isRestoreInBar: props.isRestoreInBar,
                  isTakingBack: isTakingBack,
                  onPicked: (isPicked?: Dynamic) =>
                    onAct(
                      isPicked
                        ? {
                            kind: 'look',
                            revision: version.revision,
                          }
                        : {
                            kind: 'endLook',
                            ...(wasPointerUsedWithKeyboard(wasPointerPressedLast) && {
                              isByPointer: true,
                            }),
                          },
                    ),
                  onMenuOpenChange: onRowMenuOpenChange,
                  whatHasCaretAfter: whatHasCaretAfter,
                  wasPointerPressedLast: wasPointerPressedLast,
                  onAct: onAct,
                },
                version.firstRevision,
              ),
          ),
        }),
      versions !== null &&
        (whyNotWords !== null || versionHistory.hasOlder) &&
        jsxs('div', {
          className: `flex shrink-0 flex-col items-start border-t border-alpha-2 py-md ps-lg pe-md ${whyNotWords?.canTryAgain === true ? 'gap-sm' : ''}`,
          children: [
            jsx('output', {
              className: `text-footnote text-secondary ${whyNotWords?.canTryAgain === true ? 'min-h-[1lh]' : ''}`,
              children: whyNotWords !== null && !isAwaitingOlder && versionHistoryMessages.olderVersionsNotLoaded(),
            }),
            whyNotWords?.canTryAgain !== false &&
              jsx(Button, {
                ...focusKeepingProps,
                variant: whyNotWords === null ? 'ghost' : 'secondary',
                size: 'sm',
                flush: whyNotWords === null,
                busy: isAwaitingOlder,
                onClick: () =>
                  onAct({
                    kind: whyNotWords === null ? 'showOlder' : 'tryAgain',
                  }),
                children: whyNotWords === null ? versionHistoryMessages.showOlderVersions() : versionHistoryMessages.tryAgain(),
              }),
          ],
        }),
    ],
  });
});
