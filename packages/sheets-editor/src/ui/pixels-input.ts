import { FieldNumberInput } from '../kit/number-input.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { digitsBetweenHint, wholeNumberBetweenHint } from '../i18n/grid-action-labels.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
export function PixelsInput({
  ref: ref,
  label: label,
  smallest: smallest,
  largest: largest,
  disabled = false,
  value: value,
  onValueChange: onValueChange,
}: Dynamic) {
  let [isUnreadable, setIsUnreadable] = React.useState(false);
  let [committedBy, setCommittedBy] = React.useState(null);
  let leavingByKeyRef = React.useRef(false);
  let rangeError =
    (isUnreadable ? committedBy !== null : value === null && !isUnreadable && committedBy === 'key') && !disabled
      ? digitsBetweenHint(smallest, largest)
      : null;
  return jsxs(Fragment, {
    children: [
      jsx(FieldNumberInput, {
        ref: ref,
        'data-initial-focus': true,
        onFocus: ({ currentTarget: currentTarget }: Dynamic) => currentTarget.select(),
        onBlur: () => {
          setCommittedBy(leavingByKeyRef.current ? 'key' : 'leaving');
          leavingByKeyRef.current = false;
        },
        onKeyDown: ({ key: key, keyCode: keyCode, nativeEvent: nativeEvent }: Dynamic) => {
          leavingByKeyRef.current = key === 'Enter' || key === 'Tab';
          if (key === 'Enter' && !nativeEvent.isComposing && keyCode !== 229) setCommittedBy('key');
        },
        onKeyUp: () => {
          leavingByKeyRef.current = false;
        },
        onInput: () => setCommittedBy(null),
        label: label,
        hint: rangeError === null ? wholeNumberBetweenHint(smallest, largest) : undefined,
        error: rangeError ?? undefined,
        min: smallest,
        max: largest,
        format: WHOLE_PIXELS_FORMAT,
        disabled: disabled,
        value: value,
        onValueChange: (nextValue: Dynamic, { isUnreadable: isUnreadable2 }: Dynamic) => {
          onValueChange(nextValue);
          setIsUnreadable(isUnreadable2 === true);
        },
      }),
      jsx('p', {
        role: 'alert',
        className: 'sr-only',
        children: committedBy === 'key' && rangeError,
      }),
    ],
  });
}
export const WHOLE_PIXELS_FORMAT = {
  maximumFractionDigits: 0,
  useGrouping: false,
};
