import type { AgentRequest } from '@open-artifact/runtime';
import type { ConnectionFix } from '@open-artifact/data-core';

/**
 * What a connection fix does here: connectors are set up on the owner's computer, so a missing or signed-out one is
 * the agent's to fix; the others (and every fix without an agent) try the connector's queries again.
 */
export type ConnectionFixAction = 'agent' | 'retry';

export function getConnectionFixAction(fix: ConnectionFix, canAskAgent: boolean): ConnectionFixAction {
  return canAskAgent && (fix === 'reconnect' || fix === 'add') ? 'agent' : 'retry';
}

export function connectionFixLabel(fix: ConnectionFix, canAskAgent: boolean): string {
  if (getConnectionFixAction(fix, canAskAgent) === 'retry') return 'Try again';
  return fix === 'reconnect' ? 'Reconnect' : 'Connect';
}

export function connectionFixAriaLabel(fix: ConnectionFix, connector: string, canAskAgent: boolean): string {
  if (getConnectionFixAction(fix, canAskAgent) === 'retry') return `Try ${connector} again`;
  return fix === 'reconnect' ? `Reconnect ${connector}` : `Connect ${connector}`;
}

/** What the agent is asked to set up a connector the dashboard's queries need. */
export function connectorSetupRequest(connector: string, fix: ConnectionFix): AgentRequest {
  const problem =
    fix === 'reconnect' ? `The ${connector} connector needs to be signed in again` : `The ${connector} connector isn’t set up or isn’t connected`;
  return {
    title: fix === 'reconnect' ? `Reconnect ${connector}` : `Connect ${connector}`,
    text: `${problem}, so this dashboard’s queries can’t load. Tell me what to add or fix for it in my connectors.json (~/.agents/open-artifact/connectors.json unless configured elsewhere); I’ll add the server and its credentials myself.`,
    context: { connector, fix },
  };
}
