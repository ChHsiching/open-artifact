import type { Dynamic } from '../dynamic.ts';
import { jsxs, Fragment } from 'react/jsx-runtime';
import { toolUnavailableLabel } from '../i18n/grid-action-labels.ts';
export function focusControlInWrapper(element?: Dynamic) {
  let control = element?.matches(DISABLED_REASON_WRAPPER_SELECTOR) === true ? element.querySelector(ENABLED_CONTROL_SELECTOR) : null;
  control?.focus({
    preventScroll: true,
  });
  return control === element?.ownerDocument.activeElement ? control : null;
}
export const describeWhyNot = (label?: Dynamic, whyNot?: Dynamic) =>
  whyNot === null
    ? null
    : jsxs(Fragment, {
        children: [
          jsxs('span', {
            className: 'sr-only',
            children: [toolUnavailableLabel(label), ' '],
          }),
          whyNot,
        ],
      });
export const disabledByViewOnly = (viewOnlyBecause?: Dynamic) => ({
  disabled: viewOnlyBecause !== null,
  disabledReason: null,
});
export const disabledWithWhyNot = (label?: Dynamic, whyNot?: Dynamic, side?: Dynamic) => ({
  disabled: whyNot !== null,
  disabledReason: describeWhyNot(label, whyNot),
  disabledReasonSide: side,
});
export const DISABLED_REASON_WRAPPER_SELECTOR = '[data-ui-disabled-reason-wrapper]';
export const ENABLED_CONTROL_SELECTOR = 'button:enabled, [role][tabindex="0"]:not([aria-disabled="true"])';
export const isWrapperOfDisabledControl = (element?: Dynamic) =>
  element.matches(DISABLED_REASON_WRAPPER_SELECTOR) && element.querySelector(ENABLED_CONTROL_SELECTOR) === null;
