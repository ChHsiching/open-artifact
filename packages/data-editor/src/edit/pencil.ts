/** What keeps the pencil off (pure). */

import { editUnavailableReason } from '../drafts/edit-state.ts';
import type { EditUnavailableReason } from '../drafts/words.ts';

export const USE_PAGE_LABEL = 'Use the page';
export const CLICK_TOOL_GROUP_LABEL = 'What a click on the page does';

export interface PencilInputs {
  editing: boolean;
  viewingVersion: boolean;
  agentWorking: boolean;
  draftShown: boolean;
  commenting: boolean;
  /** The page can be edited by hand (a one-writer page whose markup reads back the same). */
  editableByHand: boolean;
  /** The agent can be asked to make it editable. */
  canAsk: boolean;
}

/** Why the pencil is off, in the order it is told; null when it is free (or edit mode is on). */
export function pencilReason(inputs: PencilInputs): EditUnavailableReason | null {
  if (inputs.editing) return null;
  const reason = editUnavailableReason(inputs);
  if (reason !== null) return reason;
  return !inputs.editableByHand && !inputs.canAsk ? 'needs_agent' : null;
}
