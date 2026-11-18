import type { Dynamic } from '../dynamic.ts';
export function blockRepeatedEnterOrSpace(event?: Dynamic) {
  if (!isRepeatedEnterOrSpace(event)) return;
  event.preventDefault();
  event.stopPropagation();
}
export function blockRepeatedTyping(event?: Dynamic) {
  if (!event.repeat || event.key.length > 1) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
}
export const isRepeatedEnterOrSpace = ({ key: key, repeat: repeat }: Dynamic) => repeat && (key === 'Enter' || key === ' ');
