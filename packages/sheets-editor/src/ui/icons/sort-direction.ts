import { useDensity } from '../../kit/theme.tsx';
import { Icon } from '../../kit/icon.tsx';
import type { Dynamic } from '../../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
export function SortDirectionIcon({ direction: direction }: Dynamic) {
  let size = useDensity() === 'comfortable' ? 20 : 16;
  let customIcon = {
    name: direction,
    viewBox: size,
    paths: SORT_DIRECTION_ICON_PATHS[direction][size],
  };
  return jsx(Icon, {
    customIcon: customIcon,
    size: 'auto',
  });
}
export const SORT_DIRECTION_ICON_PATHS = {
  ascending: {
    16: [
      {
        d: 'M4.875 13.375L4.875 2.625M4.875 2.625L2.625 4.875M4.875 2.625L7.125 4.875',
        strokeWidth: 1.25,
      },
      {
        d: 'M9.125 3.625L10.625 3.625M9.125 7.625L12 7.625M9.125 11.625L13.375 11.625',
        strokeWidth: 1.25,
      },
    ],
    20: [
      {
        d: 'M6.375 16.375L6.375 3.625M6.375 3.625L3.625 6.375M6.375 3.625L9.125 6.375',
        strokeWidth: 1.25,
      },
      {
        d: 'M11.625 5.625L13.375 5.625M11.625 9.625L14.875 9.625M11.625 13.625L16.375 13.625',
        strokeWidth: 1.25,
      },
    ],
  },
  descending: {
    16: [
      {
        d: 'M4.875 2.625L4.875 13.375M4.875 13.375L2.625 11.125M4.875 13.375L7.125 11.125',
        strokeWidth: 1.25,
      },
      {
        d: 'M9.125 4.375L13.375 4.375M9.125 8.375L12 8.375M9.125 12.375L10.625 12.375',
        strokeWidth: 1.25,
      },
    ],
    20: [
      {
        d: 'M6.375 3.625L6.375 16.375M6.375 16.375L3.625 13.625M6.375 16.375L9.125 13.625',
        strokeWidth: 1.25,
      },
      {
        d: 'M11.625 6.375L16.375 6.375M11.625 10.375L14.875 10.375M11.625 14.375L13.375 14.375',
        strokeWidth: 1.25,
      },
    ],
  },
};
export const SORT_DIRECTION_ICONS = {
  ascending: jsx(SortDirectionIcon, {
    direction: 'ascending',
  }),
  descending: jsx(SortDirectionIcon, {
    direction: 'descending',
  }),
};
