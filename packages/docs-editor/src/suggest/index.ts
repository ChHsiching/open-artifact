/**
 * Suggestions: the agent's proposed edits drawn in the text, their cards beside it to accept or reject (and undo), and
 * Edit with Agent on the selection toolbar.
 */
import './suggest.css';
import { WandSparkles } from 'lucide-react';
import { docClient } from '../app/doc-client.ts';
import { provideSelectionAction } from '../app/selection-actions.ts';
import { fillSlot } from '../app/slots.ts';
import { getDocs, setDocs, useDocs } from '../app/store.ts';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { currentView, useEditor } from '../editor/format.ts';
import { undoDecisionByKeys } from './decide.ts';
import { DecisionNotice } from './DecisionNotice.tsx';
import { EditWithAgentPrompt } from './EditWithAgent.tsx';
import { refreshOpenSuggestions, useOpenSuggestions } from './model.ts';
import { showUi, suggestPlugins } from './plugin.ts';
import { editWithAgentAvailable, openEditWithAgent, stopEditWithAgent, watchEditWithAgent } from './rewrite.ts';
import { getSuggest, useSuggest } from './store.ts';
import { SuggestionColumnFeed } from './SuggestionColumnFeed.tsx';
import { SuggestionFloat } from './SuggestionFloat.tsx';
import { SuggestionMargin } from './SuggestionMargin.tsx';

export { provideSuggestionReply, type SuggestionReplyHandler, type SuggestionReplyTarget } from './reply.ts';

addEditorExtension({
  plugins: () =>
    suggestPlugins({
      undoDecision: undoDecisionByKeys,
      escape() {
        if (getSuggest().rewrite?.phase !== 'working') return false;
        stopEditWithAgent();
        return true;
      },
    }),
});

fillSlot('layer', 'suggestion-margin', SuggestionMargin, 20);
fillSlot('layer', 'suggestion-column', SuggestionColumnFeed, 21);
fillSlot('layer', 'edit-with-agent', EditWithAgentPrompt, 12);
fillSlot('float', 'suggestion-float', SuggestionFloat, 20);
fillSlot('float', 'decision-notice', DecisionNotice, 30);

provideSelectionAction('editWithAgent', {
  label: 'Edit with Agent',
  icon: WandSparkles,
  available: editWithAgentAvailable,
  run: () => openEditWithAgent(),
});

// The suggestion the text outlines: the card under the pointer, else the words under it, else the looked-at one.
let drawing = false;
function drawHighlight(): void {
  if (drawing) return;
  drawing = true;
  queueMicrotask(() => {
    drawing = false;
    const view = currentView();
    if (!view) return;
    const { hoveredCard, hoveredText } = getSuggest();
    showUi(view, { highlight: hoveredCard ?? hoveredText ?? getDocs().focusedSuggestion });
  });
}
useSuggest.subscribe((state, before) => {
  if (state.hoveredCard !== before.hoveredCard || state.hoveredText !== before.hoveredText) drawHighlight();
});
useDocs.subscribe((state, before) => {
  if (state.focusedSuggestion !== before.focusedSuggestion) drawHighlight();
});

// The cards follow the shown tab as the page holds it: its own writes, others' read in, and the tab shown.
let listening = false;
function listen(): void {
  if (listening || getDocs().phase.kind !== 'ready') return;
  listening = true;
  docClient().onShadow(tab => {
    if (tab === useEditor.getState().tab) queueMicrotask(refreshOpenSuggestions);
  });
}
listen();
useDocs.subscribe(listen);
useEditor.subscribe((state, before) => {
  if (state.tab !== before.tab || state.view !== before.view) {
    listen();
    refreshOpenSuggestions();
    drawHighlight();
  }
});

// A looked-at suggestion that is no longer open (decided here or elsewhere) is let go.
useOpenSuggestions.subscribe(({ cards }) => {
  const focused = getDocs().focusedSuggestion;
  if (focused && !cards.some(card => card.id === focused)) setDocs({ focusedSuggestion: null });
  const { hoveredCard, hoveredText } = getSuggest();
  if ((hoveredCard && !cards.some(card => card.id === hoveredCard)) || (hoveredText && !cards.some(card => card.id === hoveredText)))
    useSuggest.setState({ hoveredCard: null, hoveredText: null });
});

watchEditWithAgent();
