import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
export function useFormulaBarRemountKey(isEditing?: Dynamic, isHeld?: Dynamic) {
  let [remountKey, setRemountKey] = React.useState(0);
  let isDueRef = React.useRef(true);
  React.useEffect(() => {
    if (isEditing) isDueRef.current = true;
    if (isEditing || isHeld || !isDueRef.current) return;
    let timer = setTimeout(() => {
      isDueRef.current = false;
      ReactDOM.flushSync(() => setRemountKey((key?: Dynamic) => key + 1));
    });
    return () => clearTimeout(timer);
  }, [isEditing, isHeld]);
  return remountKey;
}
