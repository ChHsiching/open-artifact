/**
 * What the stage's build show (services/build-show.ts) is doing, in a module
 * of its own so the agent service can ask without importing the show.
 */

import type { BuildIdle, BuildShowView } from '@open-artifact/editor-kit';
import { create } from 'zustand';

interface SlideBuildState {
  /** A slide sent to the stage whose show starts when the stage draws it. */
  pending: string | null;
  /** The show running, in slide units, and its slide. */
  show: BuildShowView | null;
  slideId: string | null;
  /** Where the cursor waits, in slide units; null: no cursor. */
  idle: BuildIdle | null;
}

export const useSlideBuild = create<SlideBuildState>()(() => ({ pending: null, show: null, slideId: null, idle: null }));

/** Whether the stage is busy showing the agent's slides as they arrive. */
export function slideBuildActive(): boolean {
  const state = useSlideBuild.getState();
  return state.pending !== null || state.show !== null;
}
