import * as React from 'react';

/**
 * One tab stop for a whole toolbar: Tab enters at the item last used, and the arrow keys,
 * Home and End move between items. Items are found in the DOM, so any focusable child
 * counts, whatever component draws it.
 */
export interface RovingToolbar {
  /** Attach to the toolbar element. Stable across renders. */
  ref: (element: HTMLElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLElement>) => void;
}

const ITEM_SELECTOR = 'button:not([disabled]), a[href], [role="button"], [tabindex]';

/** Children that use the arrow keys themselves, so the toolbar leaves those keys to them. */
const OWNS_ARROWS_SELECTOR = [
  'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="reset"])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[role="slider"]',
  '[role="combobox"]',
  '[data-ui="TextInput"]',
].join(', ');

/** Nested composites with their own arrow-key movement. */
const NESTED_COMPOSITE_SELECTOR = '[role="tablist"], [role="radiogroup"], [role="menubar"], [role="toolbar"], [data-ui="Toolbar"]';

function isUsable(element: HTMLElement): boolean {
  if (element.dataset.focusGuard !== undefined || element.hasAttribute('data-base-ui-focus-guard')) return false;
  if (element.closest('[aria-hidden="true"], [inert], [hidden]') !== null) return false;
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return false;
  if (typeof element.checkVisibility === 'function') return element.checkVisibility({ visibilityProperty: true });
  return element.getClientRects().length > 0;
}

function ownsArrows(element: Element, toolbar: HTMLElement): boolean {
  if (element.matches(OWNS_ARROWS_SELECTOR)) return true;
  const composite = element.closest(NESTED_COMPOSITE_SELECTOR);
  return composite !== null && composite !== toolbar && toolbar.contains(composite);
}

function itemsOf(toolbar: HTMLElement): HTMLElement[] {
  const candidates = [...toolbar.querySelectorAll<HTMLElement>(ITEM_SELECTOR)].filter(
    (element) => isUsable(element) && !ownsArrows(element, toolbar),
  );
  // An item inside another item (a button in a focusable wrapper) is the one that takes focus.
  return candidates.filter((element) => !candidates.some((other) => other !== element && element.contains(other)));
}

function isRtl(element: HTMLElement): boolean {
  return getComputedStyle(element).direction === 'rtl';
}

export function useRovingToolbar(): RovingToolbar {
  const toolbarRef = React.useRef<HTMLElement | null>(null);
  const currentRef = React.useRef<HTMLElement | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  const currentIndexRef = React.useRef(0);
  const focusWithinRef = React.useRef(false);

  const sync = React.useCallback((): HTMLElement[] => {
    const toolbar = toolbarRef.current;
    if (toolbar === null) return [];
    const items = itemsOf(toolbar);
    const previous = currentRef.current;
    let current = previous !== null && items.includes(previous) ? previous : null;
    if (current === null) {
      // The item last used went away: its neighbour takes over the tab stop, and focus if it had it.
      current = items[Math.min(currentIndexRef.current, items.length - 1)] ?? null;
      const activeElement = toolbar.ownerDocument.activeElement;
      const lostFocus = focusWithinRef.current && previous !== null && !previous.isConnected;
      if (current !== null && lostFocus && (activeElement === null || activeElement === toolbar.ownerDocument.body)) {
        current.focus({ focusVisible: true } as FocusOptions);
      }
    }
    currentRef.current = current;
    currentIndexRef.current = current === null ? 0 : items.indexOf(current);
    for (const item of items) item.tabIndex = item === current ? 0 : -1;
    return items;
  }, []);

  const ref = React.useCallback(
    (element: HTMLElement | null): void => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      toolbarRef.current = element;
      if (element === null) return;
      const view = element.ownerDocument.defaultView;
      let frame = 0;
      const schedule = (): void => {
        if (frame !== 0 || view === null) return;
        frame = view.requestAnimationFrame(() => {
          frame = 0;
          sync();
        });
      };
      const onFocusIn = (): void => {
        focusWithinRef.current = true;
      };
      const onFocusOut = (event: FocusEvent): void => {
        const next = event.relatedTarget;
        if (next instanceof Node && element.contains(next)) return;
        const left = event.target;
        if (next !== null || !(left instanceof Node)) {
          focusWithinRef.current = false;
          return;
        }
        // Focus going nowhere is either the page losing focus or the focused item being removed;
        // only the second leaves focus for the toolbar to hand on.
        queueMicrotask(() => {
          if (left.isConnected) focusWithinRef.current = false;
        });
      };
      element.addEventListener('focusin', onFocusIn);
      element.addEventListener('focusout', onFocusOut);
      sync();
      const mutations = view === null ? null : new view.MutationObserver(schedule);
      mutations?.observe(element, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled', 'inert', 'aria-hidden', 'aria-disabled', 'hidden'],
      });
      const resizes = view === null || typeof view.ResizeObserver !== 'function' ? null : new view.ResizeObserver(schedule);
      resizes?.observe(element);
      cleanupRef.current = () => {
        if (frame !== 0) view?.cancelAnimationFrame(frame);
        element.removeEventListener('focusin', onFocusIn);
        element.removeEventListener('focusout', onFocusOut);
        mutations?.disconnect();
        resizes?.disconnect();
      };
    },
    [sync],
  );

  const onFocus = React.useCallback(
    (event: React.FocusEvent<HTMLElement>): void => {
      const toolbar = toolbarRef.current;
      if (toolbar === null || !(event.target instanceof HTMLElement)) return;
      const items = itemsOf(toolbar);
      if (!items.includes(event.target) || currentRef.current === event.target) return;
      currentRef.current = event.target;
      currentIndexRef.current = items.indexOf(event.target);
      for (const item of items) item.tabIndex = item === event.target ? 0 : -1;
    },
    [],
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      const toolbar = toolbarRef.current;
      if (toolbar === null || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof Element) || !toolbar.contains(target) || ownsArrows(target, toolbar)) return;
      const items = sync();
      if (items.length === 0) return;
      const at = items.findIndex((item) => item === target || item.contains(target));
      const last = items.length - 1;
      const forward = isRtl(toolbar) ? 'ArrowLeft' : 'ArrowRight';
      const backward = isRtl(toolbar) ? 'ArrowRight' : 'ArrowLeft';
      let next: number;
      if (event.key === forward) next = at < 0 || at === last ? 0 : at + 1;
      else if (event.key === backward) next = at <= 0 ? last : at - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      else return;
      event.preventDefault();
      const item = items[next];
      if (item === undefined) return;
      currentRef.current = item;
      currentIndexRef.current = next;
      for (const other of items) other.tabIndex = other === item ? 0 : -1;
      item.focus({ focusVisible: true } as FocusOptions);
    },
    [sync],
  );

  React.useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  return React.useMemo(() => ({ ref, onKeyDown, onFocus }), [ref, onKeyDown, onFocus]);
}
