import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
export function FieldShortcutButton({ name: name, field: fieldRef }: Dynamic) {
  let buttonRef = React.useRef(null);
  let [isGone, setIsGone] = React.useState(false);
  let focusField = () => fieldRef.current?.focus();
  React.useEffect(() => {
    let dialog = buttonRef.current?.closest('[role="dialog"]');
    let onFocusIn = ({ target: target }: Dynamic) => {
      if (target !== buttonRef.current) setIsGone(true);
    };
    dialog?.addEventListener('focusin', onFocusIn);
    return () => dialog?.removeEventListener('focusin', onFocusIn);
  }, []);
  return isGone
    ? null
    : jsx('button', {
        ref: buttonRef,
        type: 'button',
        className: 'sr-only',
        onClick: focusField,
        onKeyDown: ({ key: key }: Dynamic) => {
          if (key.length === 1 && key !== ' ') focusField();
        },
        onBlur: ({ relatedTarget: relatedTarget }: Dynamic) => {
          if (relatedTarget !== null) setIsGone(true);
        },
        children: name,
      });
}
