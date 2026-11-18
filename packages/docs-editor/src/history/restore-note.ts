/** What restoring a version does to the tab's open suggestions, as the restore dialog says it. */
import { type DocState, proposalIds } from '@open-artifact/docs-core';
import type { DocSuggestion } from '@open-artifact/runtime/doc-api';
import { nameOfPerson } from '../app/people.ts';

/** Said when the version restored could not be read to tell. */
export const RESTORE_SUGGESTIONS_FALLBACK =
  'Suggestions that were pending in this version come back as pending, even if they were accepted or rejected since. Suggestions made after this version are discarded.';

const COME_BACK = 'Suggestions that were pending in this version come back as pending, even if they were accepted or rejected since.';

/** Who laid a suggestion, as the note names them: "you", "Agent", the person; `undefined` when unknown. */
export function suggesterOf(suggestion: DocSuggestion): string | undefined {
  if (suggestion.via === 'agent') return 'Agent';
  if (suggestion.mine) return 'you';
  return suggestion.name || nameOfPerson(suggestion.by);
}

/** "A", "A and B", "A, B and 3 others". */
function listed(names: readonly string[]): string {
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Restoring will discard 3 open suggestions, by you, Agent and 1 other." */
export function discardSentence(count: number, names: readonly string[], others: number): string {
  const head = `Restoring will discard ${count} open ${count === 1 ? 'suggestion' : 'suggestions'}`;
  if (!names.length) return `${head}.`;
  return `${head}, by ${listed(others > 0 ? [...names, `${others} ${others === 1 ? 'other' : 'others'}`] : names)}.`;
}

function staySentence(count: number, more: boolean): string {
  const one = count === 1;
  return `${count} ${more ? 'more' : one ? 'open suggestion' : 'open suggestions'} will stay open as ${one ? 'it' : 'they'} stood in this version; anything added to ${one ? 'it' : 'them'} since is discarded.`;
}

/**
 * The note on suggestions: the open ones the version doesn't hold are discarded (with up to two of who laid them), the
 * ones it holds stay as they stood in it, and ones pending in it but decided since come back. `null`: nothing to say.
 */
export function restoreNote(open: readonly DocSuggestion[], version: DocState | null): string | null {
  if (!version) return open.length ? RESTORE_SUGGESTIONS_FALLBACK : null;
  const held = new Set([...proposalIds(version.blocks), ...Object.keys(version.suggestions ?? {})]);
  const discarded = open.filter(suggestion => !held.has(suggestion.id));
  const stay = open.length - discarded.length;
  const openIds = new Set(open.map(suggestion => suggestion.id));
  const comeBack = [...held].some(id => !openIds.has(id));
  const who = discarded.map(suggesterOf);
  const people = [...new Set(who.filter((name): name is string => name !== undefined))];
  const by = [...people.filter(name => name === 'you'), ...people.filter(name => name !== 'you')];
  const names = who.includes(undefined) ? [] : by.slice(0, 2);
  const parts = [
    ...(discarded.length ? [discardSentence(discarded.length, names, by.length - names.length)] : []),
    ...(stay > 0 ? [staySentence(stay, discarded.length > 0)] : []),
    ...(comeBack ? [COME_BACK] : []),
  ];
  return parts.length ? parts.join(' ') : null;
}
