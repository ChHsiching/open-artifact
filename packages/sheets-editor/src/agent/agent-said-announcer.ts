import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { isMadeChangesWaitingFor } from './turn-of-agent.ts';
import { agentTurnSaidText } from '../i18n/agent-turn-labels.ts';
export const ANNOUNCEMENT_HOLD_MS = 5000;
export const AgentSaidAnnouncer = React.memo(function ({ said: said, doneByAgent: doneByAgent }: Dynamic) {
  let [staleSaid, setStaleSaid] = React.useState(null);
  React.useEffect(() => {
    if (said === null || (said.what === 'isWorking' && said.staysWhileCursorShows)) return;
    let value = setTimeout(() => setStaleSaid(said), ANNOUNCEMENT_HOLD_MS);
    return () => clearTimeout(value);
  }, [said]);
  return jsx(LiveAnnouncer, {
    words: said !== null && (said !== staleSaid || isMadeChangesWaitingFor(said, doneByAgent)) && agentTurnSaidText(said),
  });
});
