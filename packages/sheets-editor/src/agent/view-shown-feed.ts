import type { Dynamic } from '../dynamic.ts';

export interface ViewShownByAgentFeed {
  start(listener: (shown: Dynamic) => void): () => void;
}

export const NO_VIEW_SHOWN_BY_AGENT: ViewShownByAgentFeed = {
  start: () => () => {},
};
