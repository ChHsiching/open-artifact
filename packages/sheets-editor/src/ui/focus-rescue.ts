import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function wasFocusDroppedWith(element?: Dynamic, ownerDocument?: Dynamic) {
  return !element.isConnected && ownerDocument.activeElement === ownerDocument.body;
}
export function createFocusRescue() {
  let focusedElement: Dynamic = null;
  let container: Dynamic = null;
  return {
    focused({ target: target, currentTarget: currentTarget }: Dynamic) {
      focusedElement = target;
      container = currentTarget;
    },
    blurred({ currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) {
      focusedElement = currentTarget.contains(relatedTarget) ? relatedTarget : null;
      container = currentTarget;
    },
    isToBeTaken() {
      let element = focusedElement;
      if (element === null || element.isConnected) return false;
      let ownerDocument = element.ownerDocument;
      let wasDropped = wasFocusDroppedWith(element, ownerDocument);
      focusedElement = !wasDropped && container?.contains(ownerDocument.activeElement) === true ? ownerDocument.activeElement : null;
      return wasDropped && ownerDocument.hasFocus();
    },
  };
}
export function useFocusRescue(onRescue?: Dynamic) {
  let [rescue] = React.useState(createFocusRescue);
  React.useEffect(() => {
    if (rescue.isToBeTaken()) onRescue();
  });
  return {
    onFocus: rescue.focused,
    onBlur: rescue.blurred,
  };
}
