import type { Dynamic } from '../dynamic.ts';
import * as ReactDOM from 'react-dom';
import { eventsToPickFunction } from './autocomplete.ts';
export function pickFunctionWhenSettled(functionName?: Dynamic, store?: Dynamic, onPicked?: Dynamic, isStale?: Dynamic) {
  store.onceEventsAreFinished(() => {
    if (isStale()) return;
    for (let event of eventsToPickFunction(functionName) as Dynamic) store.dispatch(event);
    store.lookOnceEventsAreFinished(() => {
      if (isStale()) return;
      ReactDOM.flushSync(() => {
        return;
      });
      onPicked();
    });
  });
}
