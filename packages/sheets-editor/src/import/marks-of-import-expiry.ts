import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { IMPORT_MARKS_SHOWN_MS } from './marks-of-import.ts';
export function useMarksOfImportExpiry(store?: Dynamic, marksOfImport?: Dynamic) {
  React.useEffect(() => {
    if (marksOfImport === null) return;
    let timer = setTimeout(
      () =>
        store.dispatch({
          kind: 'marksOfImportOver',
        }),
      IMPORT_MARKS_SHOWN_MS,
    );
    return () => clearTimeout(timer);
  }, [store, marksOfImport]);
}
