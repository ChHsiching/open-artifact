import type { Dynamic } from '../dynamic.ts';
import { widgetProjectionRequest, readCompiledWidget } from '../store/requests.ts';
import { failureOf } from '../store/workbook-node.ts';
import { syncRetryDelayMs } from '../store/workbook-sync.ts';
export function createChartCodeStore(host?: Dynamic) {
  let chartsById = new (Map as Dynamic)();
  let stream: Dynamic = null;
  let streamCount: Dynamic = 0;
  let noAnswerCount: Dynamic = 0;
  let caretChartId: Dynamic = null;
  let codeTimedOut = new (Map as Dynamic)();
  let entryOf = (chartId?: Dynamic) => {
    let existing = chartsById.get(chartId);
    if (existing !== undefined) return existing;
    let entry = {
      code: CHART_CODE_AWAITED,
      listeners: new (Set as Dynamic)(),
      timesPublished: null,
      answeredAt: 'never',
      isAsked: false,
    };
    chartsById.set(chartId, entry);
    return entry;
  };
  let setCode = (chartId?: Dynamic, entry?: Dynamic, code?: Dynamic) => {
    let offCode = chartId === caretChartId ? CHART_CODE_OFF_TOOK_CARET : CHART_CODE_OFF_ANOTHER_TOOK_CARET;
    entry.code = code.kind === 'compiled' && caretChartId !== null ? offCode : code;
    for (let listener of entry.listeners as Dynamic) listener();
  };
  let askForCode = async (chartId?: Dynamic, tryIndex: Dynamic = 0): Promise<Dynamic> => {
    let isGivingUp = tryIndex >= MAX_CHART_CODE_TRIES || noAnswerCount >= MAX_CHART_CODE_NO_ANSWERS;
    if (stream === null) return 'notSent';
    if (isGivingUp) return null;
    let { call, noteFailure } = stream;
    let sent = await call(widgetProjectionRequest(chartId));
    let answer = readCompiledWidget(sent);
    let failure = failureOf(sent, answer.kind !== 'refused');
    if (failure !== null)
      noteFailure({
        ...failure,
        action: 'loadChart',
      });
    if (answer.kind === 'noAnswer') noAnswerCount += 1;
    else if (sent.kind === 'answered') noAnswerCount = 0;
    if (answer.kind === 'compiled') return answer;
    if (answer.kind === 'notPublished' || answer.kind === 'notCompiled')
      return {
        kind: 'none',
        why: answer.kind,
      };
    if (answer.kind === 'notSent') return 'notSent';
    if (answer.kind === 'refused') return null;
    await host.wait(syncRetryDelayMs(tryIndex));
    return askForCode(chartId, tryIndex + 1);
  };
  let askIfStale = async (chartId?: Dynamic, entry?: Dynamic): Promise<Dynamic> => {
    let isStale = entry.answeredAt === 'never' || entry.answeredAt !== entry.timesPublished;
    if (entry.isAsked || entry.listeners.size === 0 || !isStale) return;
    entry.isAsked = true;
    let [timesPublished, streamCountBefore] = [entry.timesPublished, streamCount];
    let code = await askForCode(chartId);
    entry.isAsked = false;
    if (code === 'notSent' || code === null) {
      let isOff = [CHART_CODE_OFF_TOOK_CARET, CHART_CODE_OFF_ANOTHER_TOOK_CARET, CHART_CODE_OFF_TOOK_TOO_LONG].includes(entry.code);
      if (code === null && entry.code.kind !== 'compiled' && !isOff)
        setCode(chartId, entry, {
          kind: 'none',
          why: 'notFetched',
        });
      if (streamCount !== streamCountBefore) askIfStale(chartId, entry);
      return;
    }
    entry.answeredAt = timesPublished;
    setCode(chartId, entry, code);
    askIfStale(chartId, entry);
  };
  let forgiveNoAnswers = () => {
    noAnswerCount = Math.min(noAnswerCount, MAX_CHART_CODE_NO_ANSWERS - 1);
  };
  return {
    of: (chartId?: Dynamic) => chartsById.get(chartId)?.code ?? CHART_CODE_AWAITED,
    isAsked: (chartId?: Dynamic) => chartsById.get(chartId)?.isAsked ?? false,
    follow(chartId?: Dynamic, listener?: Dynamic) {
      let entry = entryOf(chartId);
      entry.listeners.add(listener);
      forgiveNoAnswers();
      askIfStale(chartId, entry);
      return () => void entry.listeners.delete(listener);
    },
    tookCaret(chartId?: Dynamic) {
      caretChartId ??= chartId;
      for (let [otherChartId, entry] of chartsById as Dynamic) if (entry.code.kind === 'compiled') setCode(otherChartId, entry, entry.code);
    },
    tookTooLong(chartId?: Dynamic) {
      let entry = chartsById.get(chartId);
      if (entry?.code.kind !== 'compiled') return;
      let { artifact: code } = entry.code;
      if (codeTimedOut.get(chartId) === code) setCode(chartId, entry, CHART_CODE_OFF_TOOK_TOO_LONG);
      codeTimedOut.set(chartId, code);
    },
    streamOpened(stream2?: Dynamic) {
      stream = stream2;
      streamCount += 1;
      for (let [chartId, entry] of chartsById as Dynamic) askIfStale(chartId, entry);
    },
    publishedTimes(chartId?: Dynamic, timesPublished?: Dynamic) {
      let entry = entryOf(chartId);
      if (entry.timesPublished !== timesPublished) forgiveNoAnswers();
      entry.timesPublished = timesPublished;
      askIfStale(chartId, entry);
    },
  };
}
export function waitForChartCode(chartCode?: Dynamic, chartId?: Dynamic, setTimer?: Dynamic) {
  return new (Promise as Dynamic)((resolve?: Dynamic) => {
    let stopFollowing: Dynamic = null;
    let settle = (isTimedOut: Dynamic = false) => {
      let code = chartCode.of(chartId);
      if ((code.kind === 'awaited' || chartCode.isAsked(chartId)) && !isTimedOut) return;
      stopFollowing?.();
      resolve(code.kind === 'compiled' ? code.artifact : null);
    };
    stopFollowing = chartCode.follow(chartId, settle);
    setTimer(CHART_CODE_WAIT_MS, () => settle(true));
    settle();
  });
}
export const CHART_CODE_AWAITED = {
  kind: 'awaited',
};
export const CHART_CODE_OFF_TOOK_CARET = {
  kind: 'none',
  why: 'tookCaret',
};
export const CHART_CODE_OFF_ANOTHER_TOOK_CARET = {
  kind: 'none',
  why: 'anotherTookCaret',
};
export const CHART_CODE_OFF_TOOK_TOO_LONG = {
  kind: 'none',
  why: 'tookTooLong',
};
export const MAX_CHART_CODE_NO_ANSWERS = 3;
export const MAX_CHART_CODE_TRIES = 5;
export const CHART_CODE_WAIT_MS = 1e4;
