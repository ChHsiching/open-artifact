import type { Dynamic } from '../dynamic.ts';
export function chartAskFaultShown(input?: Dynamic, options?: Dynamic) {
  if (input !== 'forChat' && input !== 'noAgent') return input;
  if (!options.isChatToBeHad) return input === 'forChat' ? 'notHere' : input;
  return options.wasByRow ? 'notHere' : 'forChat';
}
export function dropChartChange(input?: Dynamic) {
  let { change: value = null } = input;
  if (value?.stands === 'asked')
    return {
      change: {
        stands: 'givenUp',
      },
    };
  if (value?.stands !== 'made' && value?.stands !== 'waits') return {};
  return {
    change: null,
    ...withPreviewToDiscard(input, value.preview),
  };
}
export function chartChangeAnswered(input?: Dynamic, options?: Dynamic, context?: Dynamic) {
  if (input.change !== options) return typeof context === 'object' ? withPreviewToDiscard(input, context.preview) : {};
  if (typeof context === 'object')
    return {
      change: {
        stands: 'made',
        from: options.from,
        ...context,
      },
    };
  return {
    change: null,
    whyNotChanged: context === 'stopped' ? null : context,
  };
}
export function chartChangeDrawn(input?: Dynamic, options?: Dynamic) {
  let { change: value = null } = input;
  if (value?.stands !== 'made' && value?.stands !== 'waits') return {};
  if (options === 'drawn')
    return value.stands === 'waits'
      ? {}
      : {
          change: {
            ...value,
            stands: 'waits',
          },
        };
  return {
    change: null,
    whyNotChanged: 'notChanged',
    ...withPreviewToDiscard(input, value.preview),
  };
}
export function chartChangeKeptChecked(input?: Dynamic, options?: Dynamic, context?: Dynamic) {
  let value = context === 'notPointed' || context === 'showsAnother' ? withPreviewToDiscard(input, options.preview) : {};
  if (input.change !== options) return value;
  return typeof context === 'object'
    ? {
        change: {
          ...options,
          isAnswered: true,
        },
      }
    : {
        change: null,
        ...value,
      };
}
export function chartChangeStage(input?: Dynamic) {
  if (input?.stands === 'waits') return 'waits';
  return input?.stands === 'asked' || input?.stands === 'made' ? 'agentWrites' : null;
}
export const shouldAskInChatInstead = (input?: Dynamic, options?: Dynamic) =>
  options && input !== null && input !== 'notChanged' && input !== 'noCells' && input !== 'filterCutsTable';
export const withPreviewToDiscard = ({ toDiscard = [] }: Dynamic, options?: Dynamic) => ({
  toDiscard: [...toDiscard, options],
});
export const letGoOfChartChange = (input?: Dynamic) => ({
  ...dropChartChange(input),
  ...(input.change?.stands === 'waits' && {
    words: '',
    previewsLetGo: (input.previewsLetGo ?? 0) + 1,
  }),
});
export const chartChangeAsked = (input?: Dynamic, options?: Dynamic, context?: Dynamic) => ({
  ...dropChartChange(input),
  change: options,
  whyNotChanged: null,
  asked: context,
});
export const chartChangeKept = (input?: Dynamic, options?: Dynamic) =>
  options?.stands === 'waits' && input.change === options
    ? {
        change: {
          ...options,
          stands: 'kept',
          isAnswered: false,
        },
      }
    : {};
export const isKeptChartChangeOutdated = (input?: Dynamic, options?: Dynamic) =>
  input?.stands === 'kept' && input.isAnswered && options !== input.from;
export const ENTER_HELD_AFTER_ACT_MS = 300;
export const shouldHoldEnterOnChange = (input?: Dynamic) =>
  !input.isChartInView ||
  input.lastBlurOfWindowAtMs > input.lastAct.atMs ||
  (input.lastAct.wasHeld && input.pressedAtMs - input.lastAct.atMs < ENTER_HELD_AFTER_ACT_MS);
export const isShownChartNodeSettled = (input?: Dynamic, options?: Dynamic, context?: Dynamic) =>
  input === shownChartNode(options, context) && (input === options || context?.stands === 'kept');
export const shownChartNode = (input?: Dynamic, options?: Dynamic) =>
  options?.stands === 'waits' || options?.stands === 'kept' ? options.preview : input;
export const chartNodesToDraw = (input?: Dynamic, options?: Dynamic) =>
  options !== null && 'preview' in options && options.preview !== input ? [input, options.preview] : [input];
