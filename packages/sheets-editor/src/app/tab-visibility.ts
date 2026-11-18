import type { Dynamic } from '../dynamic.ts';
export function watchTabVisibility(onVisibility?: Dynamic) {
  let tell = () => onVisibility((document as Dynamic).hidden);
  tell();
  (document as Dynamic).addEventListener('visibilitychange', tell);
  (window as Dynamic).addEventListener('focus', tell);
  (window as Dynamic).addEventListener('online', tell);
  return () => {
    (document as Dynamic).removeEventListener('visibilitychange', tell);
    (window as Dynamic).removeEventListener('focus', tell);
    (window as Dynamic).removeEventListener('online', tell);
  };
}
