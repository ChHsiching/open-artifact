import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { offerKeyboardToField } from './keyboard-handoff.ts';
export function usePopupFieldFocus({ isOpen: isOpen, popup: popup, shut: shut }: Dynamic) {
  let callOffRef = React.useRef(() => {
    return;
  });
  let shutRef = React.useRef(shut);
  React.useLayoutEffect(() => {
    shutRef.current = shut;
  });
  React.useLayoutEffect(() => {
    if (!isOpen) callOffRef.current();
  }, [isOpen]);
  React.useEffect(() => () => callOffRef.current(), []);
  let [focusField] = React.useState(
    () => () => {
      let field = popup.current?.querySelector('input') ?? null;
      if (popup.current === null || field === null) return null;
      callOffRef.current();
      let focusTrap = offerKeyboardToField(popup.current, field, () => shutRef.current());
      callOffRef.current = focusTrap.callOff;
      return focusTrap.answer;
    },
  );
  return focusField;
}
