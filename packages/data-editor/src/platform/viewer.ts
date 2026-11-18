/** Who is looking at the page. */

import { maybeSession } from '../services/session.ts';

export interface ViewerIdentity {
  id: string;
  name: string;
}

/** The current viewer, or `null` before the session started. */
export function getCurrentViewer(): ViewerIdentity | null {
  const viewer = maybeSession()?.viewer;
  return viewer === undefined ? null : { id: viewer.id, name: viewer.name };
}

/** The current viewer for a component (the session starts before the page renders). */
export function useCurrentViewer(): ViewerIdentity | null {
  return getCurrentViewer();
}
