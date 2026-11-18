/// <reference lib="webworker" />
import { hostWorkbook, inWords } from './engine/workbook-host.ts';
import { WORKER_STARTED_MESSAGE, NO_TRANSFER, workerLine } from './engine/worker-line.ts';
import { createSheetsUtilities, createWorkbookSessionCore } from './engine/wasm-bindings.ts';
import { newIdCode } from './engine/core-reads.ts';

interface WorkerStart {
  module: WebAssembly.Module;
  timeOriginMs: number;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

function start({ data }: MessageEvent<WorkerStart>): void {
  const line = workerLine(scope);
  scope.addEventListener('unhandledrejection', ({ reason }) => line.send({ happened: [{ kind: 'threw', inWords: inWords(reason) }] }));
  hostWorkbook({
    line,
    newCore: () => createWorkbookSessionCore(data.module),
    loadUtilities: () => createSheetsUtilities(data.module),
    newEditId: () => crypto.randomUUID(),
    newIdCode,
    wait: (ms) => new Promise((resolve) => void setTimeout(resolve, ms)),
    nowMs: () => performance.timeOrigin + performance.now() - data.timeOriginMs,
    calculateLater: (calculate) => void setTimeout(calculate),
  });
  scope.postMessage(WORKER_STARTED_MESSAGE, NO_TRANSFER);
}

scope.addEventListener('message', start, { once: true });
