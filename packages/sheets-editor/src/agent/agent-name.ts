export const DEFAULT_AGENT_NAME = 'Agent';

const UNSAFE_IN_MESSAGES = /[{}<>'"`#\u0000-\u001f\u007f]/g;
const MAX_AGENT_NAME = 40;

/** What the page calls the agent: the name the host gives it, cleaned for use inside messages. */
export let AGENT_NAME: string = DEFAULT_AGENT_NAME;

export function agentNameOf(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_AGENT_NAME;
  const clean = value.replace(UNSAFE_IN_MESSAGES, '').trim().slice(0, MAX_AGENT_NAME).trim();
  return clean === '' ? DEFAULT_AGENT_NAME : clean;
}

export function setAgentName(name: unknown): void {
  AGENT_NAME = agentNameOf(name);
}
