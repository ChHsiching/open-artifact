import type { Dynamic } from '../dynamic.ts';
export const waitForNextTask = () =>
  new (Promise as Dynamic)((resolve?: Dynamic) => {
    let { port1: receiver, port2: sender } = new (MessageChannel as Dynamic)();
    receiver.addEventListener('message', () => {
      receiver.close();
      resolve();
    });
    receiver.start();
    sender.postMessage(null);
  });
