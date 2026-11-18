/** The ask card on a line: where it is and how far its request got. */
import { create } from 'zustand';

export interface AskState {
  open: { tab: string; block: string; phase: 'prompt' | 'sending' | 'working' } | null;
}

export const useAsk = create<AskState>(() => ({ open: null }));
export const getAsk = useAsk.getState;
export const setAsk = useAsk.setState;
