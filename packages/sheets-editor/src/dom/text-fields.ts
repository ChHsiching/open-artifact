import type { Dynamic } from '../dynamic.ts';
export const TEXT_FIELD_SELECTOR = ['input', 'textarea']
  .map((tagName?: Dynamic) => `${tagName}:not([inputmode="none"], [readonly])`)
  .concat('[contenteditable]:not([contenteditable="false"])')
  .join();
export const createFocusPlaceReader =
  (ownerDocument?: Dynamic) =>
  () => {
    if (!ownerDocument.hasFocus()) return 'outsidePage';
    return ownerDocument.activeElement?.matches(TEXT_FIELD_SELECTOR) === true ? 'inField' : 'elsewhereInPage';
  };
