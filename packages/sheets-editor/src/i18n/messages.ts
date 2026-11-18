import { AGENT_NAME, DEFAULT_AGENT_NAME } from '../agent/agent-name.ts';
import type { Dynamic } from '../dynamic.ts';
import * as IntlMessageformat from 'intl-messageformat';


const localWordsOf = (name: string): Record<string, string> => ({
  'Agent isn’t available in this Sheet.': `${name} isn’t listening to this Sheet. Ask it to wait for requests here, then try again.`,
  '{cells} added to your message to Agent.': `{cells} sent to ${name}.`,
  '{cells} added to your message to Agent. Typing in the Sheet is paused. The message box is outside the Sheet. Press Escape to go back to the cells.': `{cells} sent to ${name}.`,
  'Added to your message to Agent. Send it when you’re ready.': `Sent to ${name}.`,
  'Rule added to your message to Agent. Describe the change you want in the message box.': `Rule sent to ${name}. Tell ${name} the change you want.`,
});
const AGENT_IN_WORDS = /\bAgent\b(?! Sheets?\b| Docs?\b)/g;
const agentWordsCache = new Map<string, string>();
let agentWordsName = '';
let localWords: Record<string, string> = {};
function agentWordsOf(message: Dynamic) {
  if (typeof message !== 'string') return message;
  if (agentWordsName !== AGENT_NAME) {
    agentWordsName = AGENT_NAME;
    localWords = localWordsOf(AGENT_NAME);
    agentWordsCache.clear();
  }
  let words = agentWordsCache.get(message);
  if (words === undefined) {
    words = localWords[message] ?? (AGENT_NAME === DEFAULT_AGENT_NAME ? message : message.replace(AGENT_IN_WORDS, () => AGENT_NAME));
    agentWordsCache.set(message, words);
  }
  return words;
}
export function compileMessage(message?: Dynamic) {
  let cached = compiledMessages.get(message);
  if (cached !== undefined) return cached;
  let compiled = new (IntlMessageformat.default as Dynamic)(message, MESSAGE_LOCALE, undefined, {
    ignoreTag: true,
  });
  compiledMessages.set(message, compiled);
  return compiled;
}
export function formatMessageText(message?: Dynamic, values?: Dynamic) {
  if (brokenMessages.has(message)) return message;
  try {
    return compileMessage(message).format(values);
  } catch (error: Dynamic) {
    brokenMessages.add(message);
    reportError(error);
    return message;
  }
}
export function translateMessage({ defaultMessage: defaultMessage }: Dynamic, values: Dynamic = {}) {
  let formatted = formatMessageText(agentWordsOf(defaultMessage), values);
  let asParts = () => [formatted].flat(2);
  if (Object.values(values).some((input?: Dynamic) => typeof input === 'object')) return asParts();
  return typeof formatted === 'string' ? formatted : joinMessageParts(asParts());
}
export const joinMessageParts = (parts?: Dynamic) =>
  parts.map((input?: Dynamic) => (typeof input === 'string' ? input : input.setApart)).join('');
export const MESSAGE_LOCALE = 'en-US';
export const compiledMessages = new (Map as Dynamic)();
export const brokenMessages = new (Set as Dynamic)();
