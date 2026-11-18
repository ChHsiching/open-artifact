import type { Dynamic } from '../dynamic.ts';
export const isMentionText = (text?: Dynamic) => text.startsWith('@');
export const mentionQueryOf = (text?: Dynamic) => text.slice(1).trim();
