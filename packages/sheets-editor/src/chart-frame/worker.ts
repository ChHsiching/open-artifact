/**
 * The chart's worker: started from a blob by the chart frame, it empties its global object, imports the chart's
 * module, and sends the frame each drawing of it.
 */
import { ChartFault, emptyGlobal, isObject, runChart, type ChartRun } from './chart-runtime.ts';
import type { FrameToWorker, WorkerToFrame } from './messages.ts';

interface WorkerScope {
  postMessage(message: string): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<FrameToWorker>) => void): void;
  addEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
  queueMicrotask(task: () => void): void;
}

function startWorker(scope: WorkerScope): void {
  const post = scope.postMessage.bind(scope);
  const listen = scope.addEventListener.bind(scope);
  const soon = scope.queueMicrotask.bind(scope);
  const { stringify } = JSON;
  const [BlobOfCode, addressOf, forget] = [Blob, URL.createObjectURL.bind(URL), URL.revokeObjectURL.bind(URL)];
  const stayed = emptyGlobal(globalThis);
  if (stayed.length > 0) throw Error('the global is not emptied');
  const nothing = (): void => {};
  const observer = function (): object {
    return { observe: nothing, unobserve: nothing, disconnect: nothing, takeRecords: () => [] };
  };
  const consoleNames = 'log warn error info debug table group groupEnd groupCollapsed time timeEnd timeLog assert count countReset dir trace';
  for (const [name, value] of [
    ['console', Object.fromEntries(consoleNames.split(' ').map((method) => [method, nothing]))],
    ['ResizeObserver', observer],
    ['IntersectionObserver', observer],
  ] as const)
    Object.defineProperty(globalThis, name, { value });

  let run: ChartRun | null = null;
  const early: Exclude<FrameToWorker, { kind: 'code' }>[] = [];
  const begin = (readInit: () => unknown): void => {
    run = runChart(readInit, (message) => post(stringify(message)), soon);
    for (const message of early) run.hear(message);
  };
  const initOf = (module: unknown): unknown => (isObject(module) && 'init' in module ? module.init : undefined);
  async function load(code: string): Promise<void> {
    const address = addressOf(new BlobOfCode([code], { type: 'text/javascript' }));
    let readInit: () => unknown;
    try {
      if (code.includes('sourceMappingURL')) throw SyntaxError();
      const module: unknown = await import(/* @vite-ignore */ address);
      readInit = () => initOf(module);
    } catch (error) {
      readInit = () => {
        throw error instanceof SyntaxError ? new ChartFault('notAModule') : error;
      };
    }
    forget(address);
    begin(readInit);
  }
  listen('unhandledrejection', ({ reason }) => run?.failed(reason));
  listen('message', ({ data }) => {
    if (data.kind === 'code') void load(data.artifact);
    else if (run === null) early.push(data);
    else run.hear(data);
  });
  post(stringify({ kind: 'ready' } satisfies WorkerToFrame));
}

startWorker(self);
