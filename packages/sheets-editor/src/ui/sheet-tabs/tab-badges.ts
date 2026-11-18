import { Avatar, AvatarStack } from '../../kit/avatar.tsx';
import { Icon } from '../../kit/icon.tsx';
import type { Dynamic } from '../../dynamic.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { peopleOnSheetText } from '../../i18n/menu-labels.ts';
export function TabFaces({ faces: faces }: Dynamic) {
  return jsx('span', {
    'aria-hidden': true,
    className: 'flex',
    children: jsx(AvatarStack, {
      'aria-label': '',
      max: MAX_FACES_ON_TAB,
      size: 'xs',
      surplusTooltip: false,
      children: faces.map(
        ({ userId: userId, name: name, avatarUrl: avatarUrl, color: color, inkColor: inkColor }: Dynamic) =>
          jsx(
            Avatar,
            {
              name: name,
              src: avatarUrl,
              style: {
                backgroundColor: color,
                color: inkColor,
              },
            },
            userId,
          ),
      ),
    }),
  });
}
export function OthersOnSheetText({ sheetId: sheetId, faces: faces }: Dynamic) {
  return jsx('span', {
    id: othersOnSheetId(sheetId),
    'aria-hidden': true,
    'data-find-omitted': true,
    className: 'sr-only select-none',
    children: peopleOnSheetText(faces.map(({ name: name }: Dynamic) => name)),
  });
}
export function TabCommentCount({ count: count }: Dynamic) {
  if (count === 0) return null;
  return jsxs('span', {
    'aria-hidden': true,
    className: 'flex items-center gap-1 text-secondary',
    children: [
      jsx(Icon, {
        name: 'Chat',
        customSize: 14,
      }),
      jsx('span', {
        className: 'text-caption font-medium',
        children: count,
      }),
    ],
  });
}
export const MAX_FACES_ON_TAB = 3;
export const othersOnSheetId = (sheetId?: Dynamic) => `others-on-${sheetId}`;
export const othersOnSheetDescription = (sheetId?: Dynamic, faces?: Dynamic) =>
  faces.length === 0
    ? {}
    : {
        'aria-describedby': othersOnSheetId(sheetId),
      };
export const isSheetNameLeftForWindow = ({ target: target, relatedTarget: relatedTarget }: Dynamic, isLeaving?: Dynamic) =>
  relatedTarget === null && target.isConnected && target.classList.contains('sheet-name-field') && !isLeaving;
