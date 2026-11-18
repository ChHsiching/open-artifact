/** Reply on a suggestion's card: the comments feature answers it (it opens a thread on the suggestion's words). */
import { create } from 'zustand';

export interface SuggestionReplyTarget {
  tab: string;
  suggestId: string;
  /** The card's sentence, e.g. `Replace “a” with “b”`. */
  summary: string;
}

export type SuggestionReplyHandler = (target: SuggestionReplyTarget) => void;

export const useSuggestionReply = create<{ handler: SuggestionReplyHandler | null }>(() => ({ handler: null }));

/** Shows Reply on suggestion cards until the returned function is called. */
export function provideSuggestionReply(handler: SuggestionReplyHandler): () => void {
  useSuggestionReply.setState({ handler });
  return () => {
    if (useSuggestionReply.getState().handler === handler) useSuggestionReply.setState({ handler: null });
  };
}
