/** Reading threads: links to them, whose messages are the viewer's, and threads that are a single reaction. */
import type { CommentAuthor, CommentMessage, CommentReaction, CommentThread } from '@open-artifact/runtime';

/** The address parameter naming a thread to open. */
export const COMMENT_PARAM = 'comment';
const TAB_PARAM = 'tab';

/** A link that opens the page on a thread (and its tab). */
export function commentLink(href: string, threadId: string, tab: string | null): string {
  const url = new URL(href);
  url.searchParams.set(COMMENT_PARAM, threadId);
  if (tab) url.searchParams.set(TAB_PARAM, tab);
  else url.searchParams.delete(TAB_PARAM);
  url.hash = '';
  return url.toString();
}

/** The thread an address names, if any. */
export function commentInLink(href: string): string | null {
  try {
    return new URL(href).searchParams.get(COMMENT_PARAM) || null;
  } catch {
    return null;
  }
}

/** The address without its thread (once the thread is open). */
export function withoutComment(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(COMMENT_PARAM);
  return url.toString();
}

/** A person's message, written as the viewer (messages carry a name, not an id). */
export const isOwn = (author: CommentAuthor, me: string | null): boolean => author.kind === 'person' && !!me && author.name === me;

export const reactedByMe = (reaction: CommentReaction, me: string | null): boolean => reaction.authors.some(author => isOwn(author, me));

const ONE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:️|‍|\p{Emoji_Modifier}|\p{Extended_Pictographic})*$/u;

/** Whether a text is one emoji and nothing else. */
export const isEmoji = (text: string): boolean => ONE_EMOJI.test(text.trim());

/** A thread made by reacting to words: a single message that is one emoji. */
export const isReactionThread = (thread: CommentThread): boolean => thread.messages.length === 1 && isEmoji(thread.messages[0]!.text);

/** How many people reacted to a reaction thread with its own emoji: its author and those who joined. */
export function reactionCount(thread: CommentThread): number {
  const root = thread.messages[0];
  if (!root) return 0;
  const joined = root.reactions?.find(reaction => reaction.emoji === root.text.trim())?.authors.filter(author => author.name !== root.author.name || author.kind !== root.author.kind) ?? [];
  return 1 + joined.length;
}

/** Whether a message can be changed by the viewer. */
export const canEditMessage = (message: CommentMessage, me: string | null, canComment: boolean): boolean => canComment && isOwn(message.author, me);

/** Whether a message can be deleted by the viewer: their own, or anyone's for those who may remove comments. */
export const canDeleteMessage = (message: CommentMessage, me: string | null, canComment: boolean, canRemove: boolean): boolean =>
  canRemove || (canComment && isOwn(message.author, me));

/** Whether a whole thread can be deleted: by those who may remove comments, or by its author while it is all theirs. */
export const canDeleteThread = (thread: CommentThread, me: string | null, canComment: boolean, canRemove: boolean): boolean =>
  canRemove || (canComment && thread.messages.length > 0 && thread.messages.every(message => isOwn(message.author, me)));

/** Threads in the order the list shows them: open first, then by when they started (newest first). */
export function byRecent(a: CommentThread, b: CommentThread): number {
  const at = (thread: CommentThread) => Date.parse(thread.messages[0]?.at ?? '') || 0;
  return at(b) - at(a);
}
