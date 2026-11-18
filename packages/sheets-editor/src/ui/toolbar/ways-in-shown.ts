import { create } from 'zustand';

interface WaysInShownState {
  /** Whether the ways-in toolbar sits over the bar, which sends the bar's tooltips below it. */
  shown: boolean;
}

export const useWaysInShownStore = create<WaysInShownState>()(() => ({ shown: false }));

export const areWaysInShown = (): boolean => useWaysInShownStore.getState().shown;

export const setWaysInShown = (shown: boolean): void => useWaysInShownStore.setState({ shown });

export const subscribeWaysInShown = (listener: () => void): (() => void) =>
  useWaysInShownStore.subscribe((state, previous) => {
    if (state.shown !== previous.shown) listener();
  });
