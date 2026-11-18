/** The agent's working line on the empty page: what it says when, cycling through how long it takes and what the page will offer. */

import { MAKING_PAGE_TEXT, TAKING_LONGER_TEXT, USUALLY_A_FEW_MINUTES_TEXT, WORKING_TIPS } from './words.ts';

export const WORKING_FIRST_MS = 3000;
export const WORKING_STEP_MS = 5000;
export const WORKING_LOOP_MS = 10000;
export const WORKING_LONG_MS = 480000;

/** The working line `elapsed` ms after the agent began (`null`: just that the agent is working), and how long it stays. */
export function workingLineAt(elapsed: number, coarse = false): { text: string | null; forMs: number } {
  const tips: string[] = coarse ? [WORKING_TIPS.sources, WORKING_TIPS.change] : [WORKING_TIPS.select, WORKING_TIPS.sources, WORKING_TIPS.change];
  const count = 2 + tips.length;
  const line = (index: number): string =>
    index === 0 ? MAKING_PAGE_TEXT : index === 1 ? (elapsed < WORKING_LONG_MS ? USUALLY_A_FEW_MINUTES_TEXT : TAKING_LONGER_TEXT) : (tips[index - 2] ?? MAKING_PAGE_TEXT);
  if (elapsed < WORKING_FIRST_MS) return { text: null, forMs: WORKING_FIRST_MS - elapsed };
  const since = elapsed - WORKING_FIRST_MS;
  if (since < count * WORKING_STEP_MS) return { text: line(Math.floor(since / WORKING_STEP_MS)), forMs: WORKING_STEP_MS - (since % WORKING_STEP_MS) };
  const looped = since - count * WORKING_STEP_MS;
  return { text: line(Math.floor(looped / WORKING_LOOP_MS) % count), forMs: WORKING_LOOP_MS - (looped % WORKING_LOOP_MS) };
}
