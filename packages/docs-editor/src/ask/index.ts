/** Asking the agent from a line of the text: `@` → Ask Agent opens a prompt there, and the agent writes in its place. */
import { fillSlot } from '../app/slots.ts';
import { useDocs } from '../app/store.ts';
import { emptyDocHint } from '../editor/plugins.ts';
import { AskCard } from './AskCard.tsx';
import { canAskFromText, closeAsk } from './actions.ts';
import { getAsk } from './store.ts';

fillSlot('layer', 'ask-card', AskCard);
emptyDocHint.askAgent = canAskFromText;

// Another tab, or a doc that can't be written any more: a waiting prompt goes.
useDocs.subscribe((state, before) => {
  const open = getAsk().open;
  if (open?.phase === 'prompt' && (state.activeTab !== before.activeTab || !state.writable)) closeAsk(false);
});
