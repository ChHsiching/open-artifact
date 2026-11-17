/**
 * The screen-reader announcer core, free of any editor store: a polite live
 * region's message and a serial. {@link announce} queues a message; a
 * component renders `useAnnouncer` in a `role="status"` region (see
 * `Announcer.tsx`). Repeating the same message re-announces it.
 */

import { create } from 'zustand';

/** Longest message read out (longer ones are cut). */
export const ANNOUNCE_LIMIT = 200;

export interface AnnouncerState {
  message: string;
  /** Bumped per announcement, so the same text is read again. */
  serial: number;
}

export const useAnnouncer = create<AnnouncerState>()(() => ({ message: '', serial: 0 }));

/** The text read out for a message (whitespace collapsed, cut to {@link ANNOUNCE_LIMIT}); empty: nothing. */
export function announcementText(message: string): string {
  const text = message.replace(/\s+/g, ' ').trim();
  return text.length > ANNOUNCE_LIMIT ? `${text.slice(0, ANNOUNCE_LIMIT - 1)}…` : text;
}

/** Reads a message out to screen readers. */
export function announce(message: string): void {
  const text = announcementText(message);
  if (text) useAnnouncer.setState((s) => ({ message: text, serial: s.serial + 1 }));
}
