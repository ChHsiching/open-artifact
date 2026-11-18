import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function useDocumentElementAttribute(attributeName?: Dynamic) {
  let subscribe = React.useCallback(
    (onChange?: Dynamic) => {
      let observer = new (MutationObserver as Dynamic)(onChange);
      observer.observe((document as Dynamic).documentElement, {
        attributes: true,
        attributeFilter: [attributeName],
      });
      return () => observer.disconnect();
    },
    [attributeName],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => (document as Dynamic).documentElement.getAttribute(attributeName),
    () => null,
  );
}
