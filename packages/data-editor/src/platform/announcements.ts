/**
 * What the toolbar reads out to screen readers (through the page's
 * `Announcer` live region): its problem when it changes, "Loading…" when a
 * load starts on an empty page and "Data updated" when a load ends without
 * a problem.
 */

import { useEffect, useRef } from 'react';
import { announce } from '@open-artifact/editor-kit';

/** `announced` holds the last problem read out, so a remount does not repeat it. */
export function useToolbarAnnouncements(problem: string | null, loading: boolean, loaded: boolean, announced: { current: string | null }): void {
  useEffect(() => {
    if (problem === null || loading || problem === announced.current) return;
    announced.current = problem;
    announce(problem);
  }, [problem, loading, announced]);
  const wasLoading = useRef(false);
  useEffect(() => {
    if (loading === wasLoading.current) return;
    wasLoading.current = loading;
    if (loading) {
      if (!loaded) announce('Loading…');
      return;
    }
    if (problem === null) announced.current = null;
    if (problem !== null || !loaded) return;
    announce('Data updated');
  }, [loading, loaded, problem, announced]);
}
