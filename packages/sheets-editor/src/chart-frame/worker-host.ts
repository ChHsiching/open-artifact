/**
 * Starts a chart's worker and keeps it honest: each drawing it sends must answer what it was told, come in time, and
 * be drawable; a worker that stops answering, or answers out of turn, ends the chart.
 */
import type * as React from 'react';
import { Tooltip } from '../kit/tooltip.tsx';
import { drawTree, DrawingFault } from './drawing.ts';
import { isWorkerFault, type FrameToWorker, type WorkerToFrame } from './messages.ts';
import type { ChartFrameFault } from '../charts/frame-messages.ts';

const MOST_WAIT_FOR_AN_ANSWER_MS = 8000;
const MOST_CLOCK_JUMPS = 3;
const QUIET_BEFORE_ASKING_MS = 5000;
const MOST_TIME_TO_DRAW_MS = 2000;
const MOST_LETTERS_OF_A_MESSAGE = 16_000_000;

type Said = Exclude<FrameToWorker, { kind: 'code' | 'shown' | 'stillThere' }>;

export interface WorkerHostEvents {
  drawing: (drawn: React.ReactNode) => void;
  failed: (fault: ChartFrameFault) => void;
}

export interface WorkerHost {
  say: (message: Said) => void;
  /** Tells the worker its last drawing is on the screen, so it may send the next. */
  shown: () => void;
  end: () => void;
}

export interface WorkerHostDevices {
  addressOf: (code: string) => string;
  forget: (address: string) => void;
  startWorker: (address: string) => Worker;
  now: () => number;
}

const BROWSER: WorkerHostDevices = {
  addressOf: (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
  forget: (address) => URL.revokeObjectURL(address),
  startWorker: (address) => new Worker(address),
  now: () => performance.now(),
};

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** A message from the worker: JSON of an object, and not too long. */
function parseWorkerMessage(data: unknown): Partial<WorkerToFrame> & Record<string, unknown> | null {
  if (typeof data !== 'string' || data.length > MOST_LETTERS_OF_A_MESSAGE) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function startWorkerHost(
  { artifact, scriptOfWorker }: { artifact: string; scriptOfWorker: string },
  events: WorkerHostEvents,
  { addressOf, forget, startWorker, now }: WorkerHostDevices = BROWSER,
): WorkerHost | null {
  const address = addressOf(scriptOfWorker);
  let worker: Worker;
  try {
    worker = startWorker(address);
  } catch {
    forget(address);
    events.failed('threw');
    return null;
  }
  const post = (message: FrameToWorker): void => worker.postMessage(message, { transfer: [] });
  let [sentCount, answeredCount, askedCount] = [0, 0, 0];
  let [isReady, isDrawingHeld, isAsking, hasEnded] = [false, false, false, false];
  let [heldSince, clockJumps] = [0, 0];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const end = (): void => {
    hasEnded = true;
    clearTimeout(timer);
    forget(address);
    worker.terminate();
  };
  const fail = (fault: ChartFrameFault): void => {
    if (hasEnded) return;
    end();
    events.failed(fault);
  };
  const watch = (): void => {
    clearTimeout(timer);
    const since = now();
    timer =
      answeredCount < sentCount || isAsking
        ? setTimeout(() => {
            if (now() - since > MOST_WAIT_FOR_AN_ANSWER_MS * 1.25 && ++clockJumps <= MOST_CLOCK_JUMPS) watch();
            else fail('threw');
          }, MOST_WAIT_FOR_AN_ANSWER_MS)
        : setTimeout(() => {
            isAsking = true;
            watch();
            post({ kind: 'stillThere', nth: ++askedCount });
          }, QUIET_BEFORE_ASKING_MS);
  };
  const say = (message: Said): void => {
    if (hasEnded) return;
    if (sentCount++ === answeredCount && !isAsking) watch();
    post(message);
  };
  const hasHeard = (heard: unknown): boolean => {
    if (!isCount(heard) || heard <= answeredCount || heard > sentCount) return false;
    answeredCount = heard;
    watch();
    return true;
  };

  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (hasEnded) return;
    const heardAt = now();
    clockJumps = 0;
    const message = parseWorkerMessage(event.data);
    if (!isReady) {
      if (message?.kind !== 'ready') return fail('threw');
      isReady = true;
      forget(address);
      return post({ kind: 'code', artifact });
    }
    if (message?.kind === 'here') {
      if (!isAsking || message.nth !== askedCount) return fail('threw');
      isAsking = false;
      return watch();
    }
    if (message?.kind !== 'drawing') return fail(isWorkerFault(message?.fault) ? message.fault : 'threw');
    const { drawing, tree } = message;
    if (isDrawingHeld || !isCount(drawing) || !hasHeard(message.heard)) return fail('threw');
    let drawn: React.ReactNode;
    try {
      drawn = drawTree(tree, (handler) => say({ kind: 'pressed', drawing, handler }), Tooltip);
    } catch (error) {
      if (now() - heardAt > MOST_TIME_TO_DRAW_MS) return fail('tookTooLong');
      return fail(error instanceof DrawingFault ? error.fault : 'threw');
    }
    isDrawingHeld = true;
    heldSince = heardAt;
    events.drawing(drawn);
  });
  worker.addEventListener('error', () => fail('threw'));
  worker.addEventListener('messageerror', () => fail('threw'));

  return {
    say,
    end,
    shown() {
      if (hasEnded || !isDrawingHeld) return;
      isDrawingHeld = false;
      if (now() - heldSince > MOST_TIME_TO_DRAW_MS) return fail('tookTooLong');
      post({ kind: 'shown' });
    },
  };
}
