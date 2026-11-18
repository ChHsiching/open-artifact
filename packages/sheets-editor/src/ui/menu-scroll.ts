import type { Dynamic } from '../dynamic.ts';
export function scrollableMenuAncestor(element?: Dynamic, evenIfElementFocused?: Dynamic) {
  let menu = element.closest('[role="menu"]');
  let scroller: Dynamic = element.parentElement;
  while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller === menu ? null : scroller.parentElement;
  let activeElement = element.ownerDocument.activeElement;
  return !(evenIfElementFocused && activeElement === element) && scroller?.contains(activeElement) === true ? null : scroller;
}
export function scrollItemToCenter(item?: Dynamic, scroller?: Dynamic) {
  let { top: itemTop, bottom: itemBottom } = item.getBoundingClientRect();
  let scrollerBounds = scroller.getBoundingClientRect();
  scroller.scrollTop += (itemTop + itemBottom - scrollerBounds.top - scrollerBounds.bottom) / 2;
}
export function scrollItemAboveBottom(item?: Dynamic, scroller?: Dynamic) {
  scroller.scrollTop = 0;
  scroller.scrollTop = overflowBelowView(item.getBoundingClientRect(), scroller.getBoundingClientRect().bottom);
}
export const MENU_MAX_VISIBLE_ITEMS = 10.5;
export const overflowBelowView = ({ bottom: bottom, height: height }: Dynamic, viewBottom?: Dynamic) =>
  Math.max(0, bottom + height / 2 - viewBottom);
export const menusFocusedOnCheckedItem = new (WeakSet as Dynamic)();
export const createCheckedItemRef =
  (scrollItem?: Dynamic, shouldFocus?: Dynamic) =>
  (item?: Dynamic) => {
    let menu = item?.closest('[role="menu"]') ?? null;
    let view = item?.ownerDocument.defaultView ?? null;
    if (item === null || menu === null || view === null) return;
    let isFirstResize: Dynamic = true;
    let followedScrollTop: Dynamic = null;
    let resizeObserver = new (view.ResizeObserver as Dynamic)(() => {
      if (isFirstResize && shouldFocus) {
        let activeElement = item.ownerDocument.activeElement;
        let isFocusInMenu =
          !menusFocusedOnCheckedItem.has(menu) && activeElement !== menu && activeElement?.tagName !== 'INPUT' && menu.contains(activeElement);
        menusFocusedOnCheckedItem.add(menu);
        if (!isFocusInMenu) {
          resizeObserver.disconnect();
          return;
        }
        item.focus({
          preventScroll: true,
        });
      }
      isFirstResize = false;
      let scroller = scrollableMenuAncestor(item, shouldFocus);
      if (scroller === null || (followedScrollTop !== null && scroller.scrollTop !== followedScrollTop)) return;
      scrollItem(item, scroller);
      followedScrollTop = scroller.scrollTop;
    });
    resizeObserver.observe(menu);
    return () => resizeObserver.disconnect();
  };
export const centerCheckedItemRef = createCheckedItemRef(scrollItemToCenter, false);
export const focusCheckedItemRef = createCheckedItemRef(scrollItemAboveBottom, true);
