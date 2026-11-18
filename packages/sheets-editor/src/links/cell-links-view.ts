import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { safeLinkUrl, shortenUrlMiddle, MAX_SHOWN_LINK_LENGTH } from './cell-links.ts';
import { isOpenLinkShortcut, githubReferenceOf } from './url-display.ts';
import { IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
import { DRAG_START_DISTANCE } from '../grid/geometry.ts';
import { githubLinkKindLabel, githubLinkTitle } from '../i18n/status-labels.ts';
import { jsx } from 'react/jsx-runtime';
export let lastOpenedLink: Dynamic;
export function openLinkInNewTab(url?: Dynamic) {
  let safeUrl = safeLinkUrl(url);
  if (safeUrl === null) return;
  let nowMs2 = performance.now();
  if (safeUrl === lastOpenedLink.url && nowMs2 - lastOpenedLink.atMs < REPEAT_LINK_OPEN_MS) return;
  lastOpenedLink = {
    url: safeUrl,
    atMs: nowMs2,
  };
  let anchor = (document as Dynamic).createElement('a');
  anchor.href = safeUrl;
  anchor.target = '_blank';
  anchor.relList.add('noopener', 'noreferrer');
  (document as Dynamic).body.append(anchor);
  anchor.click();
  anchor.remove();
}
export function openLinkFromKey(
  event: Dynamic,
  key: Dynamic,
  {
    mode: mode,
    linkOfActiveCell: linkOfActiveCell,
    linkInWordsOfActiveCell: linkInWordsOfActiveCell,
    linksAmongTextOfActiveCell: linksAmongTextOfActiveCell,
    linkExplained: linkExplained,
  }: Dynamic,
  { open: open, askForCard: askForCard, isCardHeldBack: isCardHeldBack }: Dynamic,
  mayEnterOpen: Dynamic = true,
) {
  let isShortcut = isOpenLinkShortcut(mode, key);
  let isPlainEnter = mayEnterOpen && key.key === 'Enter' && !key.isShiftHeld && !key.isModifierHeld && !key.isAltHeld;
  let markedUrl = isCardHeldBack ? undefined : linkExplained?.urls[linkExplained.marked ?? -1];
  if (linkExplained !== null && markedUrl !== undefined && (isShortcut || isPlainEnter)) {
    event.preventDefault();
    if (!event.repeat) open(markedUrl, linkExplained);
    return true;
  }
  let linkInWords = isCardHeldBack ? null : linkInWordsOfActiveCell;
  let linksAmongText = isCardHeldBack ? null : linksAmongTextOfActiveCell;
  if ((linkOfActiveCell ?? linkInWords ?? linksAmongText) === null || !isShortcut) return false;
  event.preventDefault();
  if (event.repeat) return true;
  let [firstUrl, ...otherUrls] = linksAmongText?.urls ?? [];
  if (linkOfActiveCell !== null) open(linkOfActiveCell, 'typed');
  else if (linkInWords !== null && !open(linkInWords.url, linkInWords)) askForCard();
  else if (linksAmongText !== null && firstUrl !== undefined) {
    if (otherUrls.length > 0 || !open(firstUrl, linksAmongText)) askForCard();
  }
  return true;
}
export function shouldShowLinkCardFirst(element?: Dynamic, hasShown?: Dynamic) {
  let urlInWords = element.getAttribute(LINK_URL_ATTR) === null ? element.getAttribute(LINK_IN_WORDS_ATTR) : null;
  return (
    urlInWords !== null &&
    !hasShown({
      ...linkCellKeyOf(element),
      url: urlInWords,
    })
  );
}
export function createLinkPressHandler(openLink: Dynamic, { hasShown: hasShown }: Dynamic, showCard?: Dynamic) {
  let press: Dynamic = null;
  return {
    pressed(event?: Dynamic, isTakenElsewhere?: Dynamic) {
      let linkElement = event.button === 0 && !isTakenElsewhere ? closestLinkElement(event.target) : null;
      let url = linkElement?.getAttribute(LINK_URL_ATTR) ?? linkElement?.getAttribute(LINK_IN_WORDS_ATTR) ?? null;
      let isOpenClick = isOpenLinkClick(event, IS_APPLE_PLATFORM);
      let isAmongText = linkElement?.hasAttribute(LINK_AMONG_TEXT_ATTR) === true;
      let pressedUrl = isOpenClick || isAmongText ? url : null;
      let showsCardFirst = isOpenClick && linkElement !== null && shouldShowLinkCardFirst(linkElement, hasShown);
      press =
        pressedUrl === null || showsCardFirst
          ? null
          : {
              url: pressedUrl,
              pointerId: event.pointerId,
              isOnlyToShowCard: !isOpenClick,
              at: {
                x: event.clientX,
                y: event.clientY,
              },
            };
      if (press === null) return showsCardFirst ? 'showsCardFirst' : 'isForCells';
      let defaultView = event.currentTarget.ownerDocument.defaultView;
      let controller = new (AbortController as Dynamic)();
      let forgetPress = () => {
        press = null;
        controller.abort();
      };
      for (let eventType of ['pointerup', 'pointercancel', 'blur'] as Dynamic)
        defaultView?.addEventListener(eventType, forgetPress, {
          signal: controller.signal,
        });
      defaultView?.addEventListener('pointerdown', forgetPress, {
        signal: controller.signal,
        capture: true,
      });
      return isOpenClick ? 'opensLink' : 'isForCells';
    },
    letGo(event?: Dynamic, isTakenElsewhere?: Dynamic) {
      if (press?.pointerId !== event.pointerId || isTakenElsewhere || event.button !== 0) return;
      let { clientX: clientX, clientY: clientY, currentTarget: currentTarget } = event;
      let linkElement = closestLinkElement(currentTarget.ownerDocument.elementFromPoint(clientX, clientY));
      let isSameUrlInWords = linkElement?.getAttribute(LINK_IN_WORDS_ATTR) === press.url;
      if (press.isOnlyToShowCard) {
        if (
          Math.hypot(clientX - press.at.x, clientY - press.at.y) < DRAG_START_DISTANCE &&
          linkElement !== null &&
          isSameUrlInWords &&
          linkElement.hasAttribute(LINK_AMONG_TEXT_ATTR)
        )
          showCard(linkElement, {
            clientX: clientX,
            clientY: clientY,
          });
      } else if (linkElement?.getAttribute(LINK_URL_ATTR) === press.url) openLink(press.url, 'typed');
      else if (isSameUrlInWords) openLink(press.url, linkCellKeyOf(linkElement));
    },
  };
}
export function watchLinkPressCursor(
  gridElement: Dynamic,
  { hasShown: hasShown }: Dynamic,
  opensNone?: Dynamic,
  isApplePlatform: Dynamic = IS_APPLE_PLATFORM,
) {
  let controller = new (AbortController as Dynamic)();
  let { signal: signal } = controller;
  let pointerAt: Dynamic = null;
  let markedElement: Dynamic = null;
  let markLinkUnder = (event?: Dynamic, linkElementOf2?: Dynamic) => {
    let linkElement =
      event !== null && hasModifierKeys(event) && isOpenLinkClick(event, isApplePlatform) && !opensNone() ? linkElementOf2() : null;
    let elementToMark = linkElement !== null && !shouldShowLinkCardFirst(linkElement, hasShown) ? linkElement : null;
    if (elementToMark === markedElement) return;
    markedElement?.removeAttribute(PRESS_OPENS_LINK_ATTR);
    elementToMark?.setAttribute(PRESS_OPENS_LINK_ATTR, '');
    markedElement = elementToMark;
  };
  let linkUnderPointer = () =>
    pointerAt === null ? null : closestLinkElement(gridElement.ownerDocument.elementFromPoint(pointerAt.x, pointerAt.y));
  let onPointer = (event?: Dynamic) => {
    pointerAt =
      hasPointerPosition(event) && event.buttons === 0
        ? {
            x: event.clientX,
            y: event.clientY,
          }
        : null;
    if (pointerAt === null) markLinkUnder(event, () => markedElement);
    else markLinkUnder(event, event.type === 'pointerenter' ? linkUnderPointer : () => closestLinkElement(event.target));
  };
  let clearMark = () => markLinkUnder(null, () => null);
  let defaultView = gridElement.ownerDocument.defaultView;
  for (let eventType of ['keydown', 'keyup'] as Dynamic)
    defaultView?.addEventListener(
      eventType,
      (event?: Dynamic) => markLinkUnder(event, pointerAt === null ? () => markedElement : linkUnderPointer),
      {
        signal: signal,
        capture: true,
      },
    );
  defaultView?.addEventListener('blur', clearMark, {
    signal: signal,
  });
  for (let eventType of ['pointermove', 'pointerenter'] as Dynamic)
    gridElement.addEventListener(eventType, onPointer, {
      signal: signal,
    });
  gridElement.addEventListener(
    'pointerleave',
    () => {
      pointerAt = null;
      clearMark();
    },
    {
      signal: signal,
    },
  );
  gridElement.addEventListener('wheel', clearMark, {
    signal: signal,
    passive: true,
  });
  return () => {
    controller.abort();
    clearMark();
  };
}
export function githubLinkFace(url?: Dynamic) {
  let githubReference = githubReferenceOf(url);
  return githubReference === null
    ? null
    : {
        icon: GITHUB_LINK_ICONS[githubReference.kind].icon,
        iconInWords: githubLinkKindLabel(githubReference.kind),
        words: githubLinkTitle(githubReference),
      };
}
export const LINK_URL_ATTR = 'data-link-url';
export const LINK_IN_WORDS_ATTR = 'data-link-in-words';
export const LINK_CELL_ATTR = 'data-link-cell';
export const LINK_AMONG_TEXT_ATTR = 'data-is-among-text';
export const LINK_ELEMENT_SELECTOR = `[${LINK_URL_ATTR}], [${LINK_IN_WORDS_ATTR}]`;
export const closestLinkElement = (target?: Dynamic) => (target instanceof Element ? target.closest(LINK_ELEMENT_SELECTOR) : null);
export const isOpenLinkClick = (
  { metaKey: metaKey, ctrlKey: ctrlKey, shiftKey: shiftKey, altKey: altKey }: Dynamic,
  isApplePlatform?: Dynamic,
) => (metaKey || (ctrlKey && !isApplePlatform)) && !shiftKey && !altKey;
export const REPEAT_LINK_OPEN_MS = 500;
lastOpenedLink = {
  url: '',
  atMs: Number.NEGATIVE_INFINITY,
};
export const linkPlaceOfUrl = (linkExplained?: Dynamic, url?: Dynamic) => {
  if (linkExplained?.urls.includes(url) !== true) return null;
  return linkExplained.isInWords
    ? {
        cellKey: linkExplained.cellKey,
      }
    : 'typed';
};
export const openLinkUnlessCommentMode =
  (controller?: Dynamic, openLink: Dynamic = openLinkInNewTab) =>
  (url?: Dynamic) => {
    if (controller.getView().isCommentModeOn)
      controller.dispatch({
        kind: 'linkHeldByCommentMode',
      });
    else openLink(url);
  };
export const openLinkIfShown =
  ({ hasShown: hasShown }: Dynamic, openLink: Dynamic = openLinkInNewTab) =>
  (url?: Dynamic, place?: Dynamic) => {
    if (
      place !== 'typed' &&
      !hasShown({
        ...place,
        url: url,
      })
    )
      return false;
    openLink(url);
    return true;
  };
export const linkCellKeyOf = (element?: Dynamic) => ({
  cellKey: element?.getAttribute(LINK_CELL_ATTR) ?? '',
  isForWords: true,
});
export const PRESS_OPENS_LINK_ATTR = 'data-press-opens-link';
export const hasModifierKeys = (event?: Dynamic) =>
  'metaKey' in event && 'ctrlKey' in event && 'shiftKey' in event && 'altKey' in event;
export const hasPointerPosition = (event?: Dynamic) => 'clientX' in event && 'clientY' in event && 'buttons' in event;
export const useLinkPressCursor = ({ gridRef: gridRef, card: card, opensNone: opensNone }: Dynamic) =>
  React.useEffect(() => {
    let gridElement = gridRef.current;
    return gridElement === null ? undefined : watchLinkPressCursor(gridElement, card, opensNone);
  }, [gridRef, card, opensNone]);
export const useLinkPressHandler = (openLink?: Dynamic, card?: Dynamic, showCard?: Dynamic) =>
  React.useMemo(() => createLinkPressHandler(openLink, card, showCard), [openLink, card, showCard]);
export const GITHUB_LINK_ICONS = {
  pullRequest: {
    icon: 'GitPullRequest',
  },
  issue: {
    icon: 'Ticket',
  },
};
export const OPEN_LINK_SHORTCUT = 'alt+enter';
export const LINK_DESCRIPTION_ID = 'link-description';
export const LINK_ADDRESS_ID = 'link-address';
export const linksInTextDescriptionId = (count?: Dynamic) => `links-in-text-description-${count}`;
export const breakableUrl = (url?: Dynamic) => url.replaceAll(/[/?&#=](?!\/)/g, '$&​');
export const shortBreakableUrl = (url?: Dynamic) => breakableUrl(shortenUrlMiddle(90, url));
export const breakableUrlText = (url?: Dynamic) => breakableUrl(url);
export const LinkUrlText = ({ url: url }: Dynamic) =>
  jsx('span', {
    className: 'wrap-anywhere',
    children: breakableUrl(shortenUrlMiddle(MAX_SHOWN_LINK_LENGTH, url)),
  });
export const CellLinkSpan = ({
  url: url,
  cellKeyOfWords: cellKeyOfWords,
  isAmongText = false,
  isOnWords = false,
  holdsChip = false,
  children: children,
}: Dynamic) =>
  jsx('span', {
    className: isAmongText ? 'sheet-link-among-text' : 'sheet-link',
    ...(cellKeyOfWords === null && !isAmongText
      ? {
          [LINK_URL_ATTR]: url,
        }
      : {
          [LINK_IN_WORDS_ATTR]: url,
          [LINK_CELL_ATTR]: cellKeyOfWords ?? '',
        }),
    ...{
      [LINK_AMONG_TEXT_ATTR]: isAmongText || undefined,
    },
    'data-is-on-words': isOnWords || undefined,
    'data-holds-chip': holdsChip || undefined,
    children: children,
  });
