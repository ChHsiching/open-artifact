import type { Refused } from '@open-artifact/sheets-core';

/** What a workbook's worker posts once it can take messages. */
export const WORKER_STARTED_MESSAGE = 'started';

export const NO_TRANSFER: StructuredSerializeOptions = { transfer: [] };

/** A line between two threads: JSON messages one way (`Sent`) and the other (`Heard`). */
export interface WorkerLine<Sent, Heard> {
  send(message: Sent): void;
  onMessage(listener: (message: Heard) => void): void;
}

interface MessagePort {
  postMessage(message: unknown, options?: StructuredSerializeOptions): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export const workerLine = <Sent, Heard>(target: MessagePort): WorkerLine<Sent, Heard> => ({
  send: (message) => target.postMessage(JSON.stringify(message), NO_TRANSFER),
  onMessage: (listener) => target.addEventListener('message', ({ data }) => listener(JSON.parse(data))),
});

/** Runs one of the page's edits; an edit that throws is refused as every edit is now. */
export function runEditOrRefuse<Outcome, Refusal extends string>(
  workbook: { refusalOfEveryEdit(): Refusal | null },
  edit: () => Outcome,
  onThrown: (error: unknown) => void,
): Outcome | Refused<Refusal | 'savingStopped'> {
  try {
    return edit();
  } catch (error) {
    onThrown(error);
    return { kind: 'refused', refusal: workbook.refusalOfEveryEdit() ?? 'savingStopped' };
  }
}
