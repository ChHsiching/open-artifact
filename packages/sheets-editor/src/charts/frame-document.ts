import type { Dynamic } from '../dynamic.ts';
import { fetchAssetWithRetry, reportErrorSoftly } from '../engine/loader.ts';
export function forbidFramesInDocument(document2?: Dynamic) {
  let meta = {
    httpEquiv: 'Content-Security-Policy',
    content: "frame-src 'none'",
  };
  document2.head.append(Object.assign(document2.createElement('meta'), meta));
}
export function createChartFrameDocumentSource(host?: Dynamic) {
  let documentNow: Dynamic = null;
  let isFetching: Dynamic = false;
  let listeners = new (Set as Dynamic)();
  let setDocument = (next?: Dynamic) => {
    documentNow = next;
    for (let listener of listeners as Dynamic) listener();
  };
  let fetchDocument = async (): Promise<Dynamic> => {
    if (isFetching) return;
    isFetching = true;
    setDocument(null);
    try {
      setDocument({
        text: new (TextDecoder as Dynamic)().decode(await fetchAssetWithRetry(CHART_FRAME_FILE, host)),
      });
    } catch (error: Dynamic) {
      reportErrorSoftly(error, 'charts');
      isFetching = false;
      setDocument('notFetched');
    }
  };
  return {
    now: () => documentNow,
    follow(listener?: Dynamic) {
      listeners.add(listener);
      fetchDocument();
      return () => void listeners.delete(listener);
    },
    askAgainIfItDidNotCome() {
      if (documentNow === 'notFetched') fetchDocument();
    },
  };
}
export const CHART_FRAME_FILE = 'chart-frame.txt';
