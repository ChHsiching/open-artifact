/**
 * The open tab's suggestions as the cards show them, read from the tab as the page holds it (so a decision shows at
 * once), and where each one is in the editor's text.
 */
import { type DocState, proposalIds, suggestionAsOf } from '@open-artifact/docs-core';
import { create } from 'zustand';
import { docClient } from '../app/doc-client.ts';
import { getDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import { startedHere } from './mode.ts';
import { describeSuggestion, type Sentence } from './summary.ts';

export interface SuggestionCard {
  id: string;
  /** Who laid it (an address) and when; `agent`: an agent laid it for that person. */
  by: string;
  at: string;
  agent: boolean;
  /** Laid by the viewer, or by their agent. */
  mine: boolean;
  asOf: string;
  sentence: Sentence;
}

export function cardsOf(doc: DocState, me: string | null): SuggestionCard[] {
  return proposalIds(doc.blocks).map(id => {
    const info = doc.suggestions?.[id];
    // One the person just suggested here is theirs, though the tab as the page holds it doesn't name them yet.
    const by = info?.by || (me && startedHere(id) ? me : '');
    return {
      id,
      by,
      at: info?.at ?? '',
      agent: info?.via === 'agent',
      mine: !!me && by === me,
      asOf: suggestionAsOf(doc.blocks, id),
      sentence: describeSuggestion(doc, id),
    };
  });
}

interface OpenSuggestions {
  tab: string | null;
  shadow: DocState | null;
  cards: SuggestionCard[];
}

/** The shown tab's open suggestions, in document order. */
export const useOpenSuggestions = create<OpenSuggestions>(() => ({ tab: null, shadow: null, cards: [] }));

/** Reads the shown tab's suggestions again when its doc changed. */
export function refreshOpenSuggestions(): void {
  if (getDocs().phase.kind !== 'ready') return;
  const tab = useEditor.getState().tab;
  const shadow = tab ? (docClient().openTabOf(tab)?.sync.shadow ?? null) : null;
  const before = useOpenSuggestions.getState();
  if (before.tab === tab && before.shadow === shadow) return;
  useOpenSuggestions.setState({ tab, shadow, cards: shadow ? cardsOf(shadow, getDocs().me?.id ?? null) : [] });
}
