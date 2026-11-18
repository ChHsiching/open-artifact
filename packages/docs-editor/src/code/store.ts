/** Which live blocks show their source, remembered per block while the page is open. */
import { create } from 'zustand';

interface CodeBlocksState {
  sourceOpen: Readonly<Record<string, boolean>>;
}

export const useCodeBlocks = create<CodeBlocksState>(() => ({ sourceOpen: {} }));

export const sourceOpen = (key: string): boolean => useCodeBlocks.getState().sourceOpen[key] === true;

export function setSourceOpen(key: string, open: boolean): void {
  useCodeBlocks.setState(state => ({ sourceOpen: { ...state.sourceOpen, [key]: open } }));
}
