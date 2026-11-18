/**
 * Keeps a menu that a touch opened from closing on the same touch: the finger lifting, and the
 * mouse events the browser makes up afterwards, would otherwise land outside the new popup.
 */

/** Any object that names one guarded menu; the page keeps one per menu. */
export type TouchGuardKey = object;

interface DismissDetails {
  readonly reason: string;
  cancel(): void;
}

const documentByMenu = new WeakMap<TouchGuardKey, Document>();
const menuByDocument = new WeakMap<Document, TouchGuardKey>();
const triggers = new WeakMap<TouchGuardKey, Element>();
const targets = new WeakMap<TouchGuardKey, Element>();
const suppressed = new WeakSet<TouchGuardKey>();

const CAPTURE: AddEventListenerOptions = { capture: true };
const ACTIVE_CAPTURE: AddEventListenerOptions = { capture: true, passive: false };
const PASSIVE_CAPTURE: AddEventListenerOptions = { capture: true, passive: true };
const TRIGGER_OPTIONS: AddEventListenerOptions = { capture: false, passive: false };

function isSettled(menu: TouchGuardKey): boolean {
  const target = targets.get(menu);
  return target !== undefined && target.isConnected && target.closest('[data-popup-open]') === null;
}

function menuForEvent(event: Event): TouchGuardKey | undefined {
  const current = event.currentTarget;
  const doc = current instanceof Node ? current.ownerDocument : current !== null && 'document' in current ? (current as Window).document : null;
  return doc ? menuByDocument.get(doc) : undefined;
}

function elementOf(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node && target.parentNode instanceof Element) return target.parentNode;
  return null;
}

function endedOffTrigger(event: TouchEvent, menu: TouchGuardKey): boolean {
  const trigger = triggers.get(menu);
  if (trigger === undefined || event.changedTouches.length === 0) return false;
  for (const touch of Array.from(event.changedTouches)) {
    const element = elementOf(touch.target);
    if (element === null || element === trigger) return false;
  }
  return true;
}

function releaseOnPress(event: Event): void {
  const menu = menuForEvent(event);
  if (menu !== undefined) releaseTouchOpenGuard(menu);
}

function onTouchEnd(event: Event): void {
  const menu = menuForEvent(event);
  if (menu === undefined || !(event instanceof TouchEvent) || event.touches.length !== 0) return;
  if (endedOffTrigger(event, menu)) {
    releaseTouchOpenGuard(menu);
    return;
  }
  if (event.cancelable && !isSettled(menu)) event.preventDefault();
  suppressed.add(menu);
}

function suppressGhostMouse(event: Event): void {
  const menu = menuForEvent(event);
  if (menu === undefined || !suppressed.has(menu)) return;
  if (event instanceof MouseEvent && event.detail !== 0 && !isSettled(menu)) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (event.type === 'click') releaseTouchOpenGuard(menu);
}

const WINDOW_LISTENERS: ReadonlyArray<readonly [string, (event: Event) => void, AddEventListenerOptions]> = [
  ['pointerdown', releaseOnPress, CAPTURE],
  ['touchstart', releaseOnPress, PASSIVE_CAPTURE],
  ['touchend', onTouchEnd, ACTIVE_CAPTURE],
  ['touchcancel', onTouchEnd, CAPTURE],
  ['mousedown', suppressGhostMouse, CAPTURE],
  ['mouseup', suppressGhostMouse, CAPTURE],
  ['click', suppressGhostMouse, CAPTURE],
];

function setTrigger(menu: TouchGuardKey, trigger: Element | undefined): void {
  const previous = triggers.get(menu);
  if (previous === trigger) return;
  previous?.removeEventListener('touchend', onTouchEnd, TRIGGER_OPTIONS);
  if (trigger === undefined) {
    triggers.delete(menu);
    return;
  }
  triggers.set(menu, trigger);
  trigger.addEventListener('touchend', onTouchEnd, TRIGGER_OPTIONS);
}

/** Stops guarding `menu`. */
export function releaseTouchOpenGuard(menu: TouchGuardKey): void {
  const doc = documentByMenu.get(menu);
  if (doc === undefined) return;
  documentByMenu.delete(menu);
  menuByDocument.delete(doc);
  suppressed.delete(menu);
  targets.delete(menu);
  setTrigger(menu, undefined);
  for (const [type, listener, options] of WINDOW_LISTENERS) doc.defaultView?.removeEventListener(type, listener, options);
}

/** Starts guarding `menu` in `doc` until the next press; `trigger` is the element the touch opened it from. */
export function armTouchOpenGuard(menu: TouchGuardKey, doc: Document, trigger?: Element): void {
  const win = doc.defaultView;
  if (win === null) return;
  if (documentByMenu.get(menu) === doc) {
    if (trigger !== undefined) setTrigger(menu, trigger);
    return;
  }
  releaseTouchOpenGuard(menu);
  const other = menuByDocument.get(doc);
  if (other !== undefined) releaseTouchOpenGuard(other);
  menuByDocument.set(doc, menu);
  documentByMenu.set(menu, doc);
  for (const [type, listener, options] of WINDOW_LISTENERS) win.addEventListener(type, listener, options);
  setTrigger(menu, trigger);
}

/**
 * Call from the menu's `onOpenChange`. Returns true when it cancelled a close that the opening
 * touch caused; the handler should then return. Any other close ends the guard.
 */
export function touchGuardCancelsClose(menu: TouchGuardKey, open: boolean, details: DismissDetails): boolean {
  if (open) return false;
  if (documentByMenu.has(menu) && (details.reason === 'outside-press' || details.reason === 'cancel-open')) {
    details.cancel();
    return true;
  }
  releaseTouchOpenGuard(menu);
  return false;
}
