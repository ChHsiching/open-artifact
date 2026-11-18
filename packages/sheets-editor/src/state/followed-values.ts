import * as React from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** A value that components can follow, changed from outside React. */
export interface FollowedValue<T> {
  read(): T;
  change(next: T): void;
  follow(listener: () => void): () => void;
  store: StoreApi<{ value: T }>;
}

export function createFollowedValue<T>(initial: T): FollowedValue<T> {
  const store = createStore<{ value: T }>()(() => ({ value: initial }));
  return {
    read: () => store.getState().value,
    change(next) {
      if (Object.is(next, store.getState().value)) return;
      store.setState({ value: next });
    },
    follow: (listener) => store.subscribe(() => listener()),
    store,
  };
}

/** Keeps a followed value in step with `value`, so children can follow it without being drawn again by this component. */
export function useFollowedValueOf<T>(value: T): FollowedValue<T> {
  const [followed] = React.useState(() => createFollowedValue(value));
  React.useEffect(() => followed.change(value), [followed, value]);
  return followed;
}

const valueOf = <T,>(state: { value: T }): T => state.value;

export const useFollowed = <T,>(followed: FollowedValue<T>): T => useStore(followed.store, valueOf);
