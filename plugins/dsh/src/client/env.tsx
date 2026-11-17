/**
 * What every component of the page reads besides the store: the words, the routes, and the app's conversation list.
 */
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { PageApi } from './api.ts';
import type { ExternalStore, SessionsSnapshot } from './host.ts';
import type { Translate } from './i18n.ts';

/** The page's surroundings. */
export interface PageEnv {
  t: Translate;
  api: PageApi;
  /** The app's conversations, for the titles a card's tooltip and the search show. */
  sessions: ExternalStore<SessionsSnapshot>;
}

/** The same snapshot each time: a new one per read makes React draw again forever. */
const NO_SESSIONS: SessionsSnapshot = {};
/** No conversation list. */
export const EMPTY_SESSIONS: ExternalStore<SessionsSnapshot> = { getSnapshot: () => NO_SESSIONS, subscribe: () => () => {} };

const EnvContext = createContext<PageEnv | null>(null);

/** Hands the page's surroundings to the components below. */
export function EnvProvider({ env, children }: { env: PageEnv; children: ReactNode }) {
  return <EnvContext.Provider value={env}>{children}</EnvContext.Provider>;
}

/** The page's surroundings. */
export function usePageEnv(): PageEnv {
  const env = useContext(EnvContext);
  if (env === null) throw new Error('usePageEnv needs an EnvProvider');
  return env;
}

/** A session's title, by id ('' when unknown), kept current. */
export function useSessionTitle(): (sessionId: string) => string {
  const { sessions } = usePageEnv();
  const snapshot = useSyncExternalStore(sessions.subscribe, sessions.getSnapshot, sessions.getSnapshot);
  return useCallback((id: string) => snapshot.byId?.[id]?.title?.trim() ?? '', [snapshot]);
}
