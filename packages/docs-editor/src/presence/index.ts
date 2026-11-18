/**
 * Presence: who else has the doc open (faces in the top bar, dots on tabs), their carets and selections in the text
 * of the tab they share with this page, and the agent while it writes.
 */
import { fillSlot } from '../app/slots.ts';
import { type AppPhase, getDocs, useDocs } from '../app/store.ts';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { peerCaretsPlugin } from './carets.ts';
import { startPresence } from './presence.ts';
import { PresenceBar } from './PresenceBar.tsx';
import './presence.css';

export { usePeersOnTab, usePeople } from './hooks.ts';
export { PeerDots } from './PeerDots.tsx';
export type { Person } from './people.ts';

fillSlot('topBar', 'presence', PresenceBar, 10);
addEditorExtension({ plugins: () => [peerCaretsPlugin()] });

let started = false;

function begin(phase: AppPhase): void {
  if (started || phase.kind !== 'ready') return;
  started = true;
  startPresence().then(
    stop => window.addEventListener('pagehide', stop, { once: true }),
    () => undefined,
  );
}

begin(getDocs().phase);
useDocs.subscribe(state => begin(state.phase));
