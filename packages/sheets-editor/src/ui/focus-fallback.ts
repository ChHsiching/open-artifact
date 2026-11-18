import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function useFocusFallbackToButton(isFocusKept?: Dynamic, { preventScroll = false }: Dynamic = {}) {
  let containerRef = React.useRef(null);
  let hasFocusRef = React.useRef(false);
  let focusHandlers = React.useMemo(
    () => ({
      onFocus: () => void (hasFocusRef.current = true),
      onBlur: () => void (hasFocusRef.current = false),
    }),
    [],
  );
  React.useEffect(() => {
    if (isFocusKept) return;
    let hadFocus = hasFocusRef.current;
    hasFocusRef.current = false;
    let ownerDocument = containerRef.current?.ownerDocument;
    if (hadFocus && ownerDocument !== undefined && ownerDocument.activeElement === ownerDocument.body && ownerDocument.hasFocus())
      containerRef.current?.querySelector('button, [role="button"]')?.focus({
        preventScroll: preventScroll,
      });
  }, [isFocusKept, preventScroll]);
  return [containerRef, focusHandlers];
}
