/** Hand-edit mode's state machine and when a save would overwrite a change saved elsewhere. Pure. */

import type { EditUnavailableReason } from './words.ts';

/** `convert`: ask the agent to make an older page editable; `discard`: unsaved changes; `ask`: save before asking. */
export type EditDialogKind = 'convert' | 'discard' | 'ask';
export type EditAnswer = 'stay' | 'confirm' | 'other';

export interface EditState {
  phase: 'off' | 'editing' | 'saving';
  dialog: EditDialogKind | null;
}

export type EditEvent =
  | { type: 'pencil'; editable: boolean }
  | { type: 'leave' | 'cancel' | 'ask'; dirty: boolean }
  | { type: 'save' | 'saved' | 'failed' }
  | { type: 'answer'; choice: EditAnswer };

export const EDIT_OFF: EditState = { phase: 'off', dialog: null };
export const EDIT_ON: EditState = { phase: 'editing', dialog: null };

/** Where an answer to `dialog` leaves edit mode. */
export function answerEditDialog(state: EditState, dialog: EditDialogKind, choice: EditAnswer): EditState {
  if (choice === 'stay' || (dialog === 'ask' && choice === 'confirm')) return { phase: state.phase, dialog: null };
  return choice === 'confirm' || dialog === 'ask' ? EDIT_OFF : state;
}

export function reduceEditState(state: EditState, event: EditEvent): EditState {
  if (state.dialog !== null) return event.type === 'answer' ? answerEditDialog(state, state.dialog, event.choice) : state;
  if (state.phase === 'off') {
    if (event.type !== 'pencil') return state;
    return event.editable ? EDIT_ON : { phase: 'off', dialog: 'convert' };
  }
  if (state.phase === 'saving') return event.type === 'saved' ? EDIT_OFF : event.type === 'failed' ? EDIT_ON : state;
  switch (event.type) {
    case 'leave':
      return event.dirty ? state : EDIT_OFF;
    case 'cancel':
      return event.dirty ? { phase: 'editing', dialog: 'discard' } : EDIT_OFF;
    case 'ask':
      return event.dirty ? { phase: 'editing', dialog: 'ask' } : state;
    case 'save':
      return { phase: 'saving', dialog: null };
    default:
      return state;
  }
}

/**
 * The stored page changed since the edit began by someone else: it is
 * neither the page the edit started from nor the one this edit last saved.
 */
export function changedElsewhere(stored: string | null, base: string | null, saved: string | null): boolean {
  if (stored === null || base === null) return false;
  return stored !== base && stored !== (saved ?? base);
}

/** What keeps the pencil off, in the order it is told; `null` when it is free. */
export function editUnavailableReason(state: {
  viewingVersion: boolean;
  agentWorking: boolean;
  draftShown: boolean;
  commenting: boolean;
}): EditUnavailableReason | null {
  if (state.viewingVersion) return 'older_version';
  if (state.agentWorking) return 'agent_working';
  if (state.draftShown) return 'draft_open';
  if (state.commenting) return 'comments_on';
  return null;
}
