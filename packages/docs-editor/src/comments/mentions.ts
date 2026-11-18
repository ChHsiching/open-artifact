/** @mentions in a comment: who can be named, finding the name being typed, and who a message names. */

export interface MentionCandidate {
  /** What a message's `to` names them by: `agent` for the agent, a person's name otherwise. */
  key: string;
  name: string;
  kind: 'person' | 'agent';
}

/** The key a message's `to` uses for the agent. */
export const AGENT_KEY = 'agent';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ENDS = '(?=$|[\\s.,;:!?)\\]])';

/** The `@name` being typed just before the caret: where its `@` is and what follows it. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n@]/.test(query) || /\s\s/.test(query) || /^\s/.test(query)) return null;
  return { start: at, query };
}

/** The candidates whose name, or a word of it, starts with the query (the agent first). */
export function matchCandidates(candidates: readonly MentionCandidate[], query: string, limit = 6): MentionCandidate[] {
  const wanted = query.trim().toLowerCase();
  const hits = candidates.filter(candidate => {
    if (!wanted) return true;
    const name = candidate.name.toLowerCase();
    return name.startsWith(wanted) || name.split(/\s+/).some(word => word.startsWith(wanted));
  });
  return hits.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'agent' ? -1 : 1)).slice(0, limit);
}

/** The text with the typed `@query` replaced by the whole name and a space; and where the caret goes. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `;
  const after = text.slice(caret).replace(/^ /, '');
  return { text: text.slice(0, start) + inserted + after, caret: start + inserted.length };
}

/** The keys of the candidates a message names, in the order of the candidates. */
export function mentionsIn(text: string, candidates: readonly MentionCandidate[]): string[] {
  const keys: string[] = [];
  for (const candidate of candidates) {
    const pattern = new RegExp(`(^|\\s)@${escape(candidate.name)}${ENDS}`, 'i');
    if (pattern.test(text) && !keys.includes(candidate.key)) keys.push(candidate.key);
  }
  return keys;
}

export interface TextPiece {
  text: string;
  mention: boolean;
}

/** The text cut into plain pieces and `@name` pieces, for the names given (longest first, so `@Ann Lee` beats `@Ann`). */
export function splitMentions(text: string, names: readonly string[]): TextPiece[] {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!sorted.length) return [{ text, mention: false }];
  const pattern = new RegExp(`(^|\\s)(@(?:${sorted.map(escape).join('|')}))${ENDS}`, 'gi');
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[1]!.length;
    if (start > last) pieces.push({ text: text.slice(last, start), mention: false });
    pieces.push({ text: match[2]!, mention: true });
    last = start + match[2]!.length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), mention: false });
  return pieces;
}
