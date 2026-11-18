/** Emoji by short name, for the `:name` picker. */
import { gemoji } from 'gemoji';

export interface EmojiHit {
  code: string;
  emoji: string;
}

let codes: EmojiHit[] | null = null;

const allCodes = (): EmojiHit[] => (codes ??= gemoji.flatMap(entry => entry.names.map(code => ({ code, emoji: entry.emoji }))));

/** The emoji whose short name is the query, then those whose name starts with it, at most `limit`. */
export function searchEmoji(query: string, limit = 8): EmojiHit[] {
  const wanted = query.toLowerCase();
  if (!wanted) return [];
  const all = allCodes();
  const exact = all.find(hit => hit.code === wanted);
  const out: EmojiHit[] = exact ? [exact] : [];
  for (const hit of all) {
    if (out.length >= limit) break;
    if (hit.code !== wanted && hit.code.startsWith(wanted)) out.push(hit);
  }
  return out;
}
