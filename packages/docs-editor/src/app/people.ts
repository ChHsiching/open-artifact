/**
 * The names of the people on the doc, by the id its versions and suggestions name them with: what the server knew
 * when the page opened, and the names suggestions arrive with since.
 */
import { create } from 'zustand';

export const usePeopleNames = create<{ names: Record<string, string> }>(() => ({ names: {} }));

/** Adds names; leaves the store as it was when none are new. */
export function learnNames(names: Record<string, string> | undefined): void {
  if (!names) return;
  const known = usePeopleNames.getState().names;
  const fresh = Object.entries(names).filter(([id, name]) => id && name && known[id] !== name);
  if (fresh.length) usePeopleNames.setState({ names: { ...known, ...Object.fromEntries(fresh) } });
}

/** The name an id goes by on this doc, when known. */
export const nameOfPerson = (id: string | undefined): string | undefined => (id ? usePeopleNames.getState().names[id] : undefined);
