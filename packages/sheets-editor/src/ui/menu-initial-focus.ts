import type { Dynamic } from '../dynamic.ts';
import { TOUCH_BELOW_SM_QUERY } from '../app/media-queries.ts';
import { getBottomSafeAreaInset } from '../shell/bottom-insets.ts';
import { isGridOrGridPopupTrigger } from '../dom/grid-role.ts';
import { ENTRY_EDITOR_OR_INPUT_SELECTOR } from '../dom/entry-editor.ts';
import { PLACEMENT_ID_SELECTOR } from '../charts/placed-views-layer.ts';
export function menuTakesCaretOnSmallTouch(element?: Dynamic) {
  let ownerDocument = element?.ownerDocument;
  return (
    ownerDocument?.defaultView?.matchMedia(TOUCH_BELOW_SM_QUERY).matches === true &&
    getBottomSafeAreaInset() === 0 &&
    !isEntryOrPlacedViewElement(ownerDocument.activeElement)
  );
}
export function menuTakesInitialCaret(element?: Dynamic, caretAfter?: Dynamic) {
  if (element?.ownerDocument.defaultView?.matchMedia(TOUCH_BELOW_SM_QUERY).matches === true) return menuTakesCaretOnSmallTouch(element);
  return caretAfter !== false && isGridOrGridPopupTrigger(caretAfter);
}
export const isEntryOrPlacedViewElement = (element?: Dynamic) =>
  element !== null &&
  ((element.matches(ENTRY_EDITOR_OR_INPUT_SELECTOR) && !isGridOrGridPopupTrigger(element)) || element.matches(`${PLACEMENT_ID_SELECTOR} *`));
