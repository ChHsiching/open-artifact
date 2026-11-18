import type { Dynamic } from '../dynamic.ts';
export const IS_IOS_BROWSER = typeof CSS < 'u' && CSS.supports('-webkit-touch-callout', 'none');
