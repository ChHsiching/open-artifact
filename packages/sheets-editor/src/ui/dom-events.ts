import type { Dynamic } from '../dynamic.ts';
export function wrapTabFocusInBar(event?: Dynamic) {
  if (event.key !== 'Tab') return;
  let tabbables = tabbableControlsIn(event.currentTarget);
  let [leavingControl, wrapTarget] = event.shiftKey ? [tabbables.at(0), tabbables.at(-1)] : [tabbables.at(-1), tabbables.at(0)];
  if (leavingControl !== event.currentTarget.ownerDocument.activeElement) return;
  event.preventDefault();
  wrapTarget?.focus({
    preventScroll: true,
  });
}
export function cycleTabFocusForward(event?: Dynamic) {
  if (event.key !== 'Tab' || event.shiftKey) return;
  let tabbables = tabbableControlsIn(event.currentTarget);
  let activeIndex = tabbables.findIndex((input?: Dynamic) => input === event.currentTarget.ownerDocument.activeElement);
  event.preventDefault();
  tabbables[(activeIndex + 1) % tabbables.length]?.focus({
    preventScroll: true,
  });
}
export const preventMouseDownDefault = (event?: Dynamic) => event.preventDefault();
export const IS_APPLE_PLATFORM = /Mac|iPhone|iPad/.test((navigator as Dynamic).platform);
export const isContextMenuClick = ({ button: button, ctrlKey: ctrlKey }: Dynamic) => button === 2 || (IS_APPLE_PLATFORM && ctrlKey);
export const isTouchOrPenPointer = ({ nativeEvent: nativeEvent }: Dynamic) =>
  'pointerType' in nativeEvent && (nativeEvent.pointerType === 'touch' || nativeEvent.pointerType === 'pen');
export const opensMenuAtPointer = (event?: Dynamic) => isContextMenuClick(event) || isTouchOrPenPointer(event);
export const tabbableControlsIn = (container?: Dynamic) =>
  [...container.querySelectorAll('button:enabled:not([tabindex="-1"]), input:enabled:not([tabindex="-1"]), [role="listbox"][tabindex="0"]')].filter(
    (control?: Dynamic) => control.getClientRects().length > 0,
  );
