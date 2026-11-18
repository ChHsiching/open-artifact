import type { Dynamic } from '../dynamic.ts';
export function popupDirectionWithRoom(top?: Dynamic, bounds?: Dynamic) {
  let [roomBelow, roomAbove] = [bounds.foot - top, top - 8 - bounds.top];
  if (roomBelow >= 332 || roomBelow >= roomAbove + 12) return 'down';
  return roomBelow < 308 && roomAbove > roomBelow + 12 && roomAbove >= 60 ? 'up' : null;
}
export function popupTopNearRow(row?: Dynamic, bounds?: Dynamic, height?: Dynamic, heightAbove: Dynamic = null) {
  let topBelow = row.foot + 2;
  if (popupDirectionWithRoom(topBelow, bounds) === 'down') return topBelow - height;
  let topAbove = row.top - 2 + 4;
  if (popupDirectionWithRoom(topAbove + height, bounds) === 'up') return topAbove;
  if (heightAbove === null) return null;
  let bottomAbove = row.top - 2 - heightAbove;
  let topAboveAll = bottomAbove - height;
  return topAboveAll >= bounds.top + 12 && popupDirectionWithRoom(bottomAbove, bounds) === 'down' ? topAboveAll : null;
}
export const boundsAboveKeyboard = (viewport?: Dynamic) => ({
  top: viewport.topOfPage,
  foot:
    viewport.heightUnderKeyboard > 0
      ? viewport.height - viewport.heightUnderKeyboard
      : viewport.height -
        Math.max(
          0,
          Math.min(viewport.height - viewport.topOfBarAtFoot + 8, 120 * Math.max(1, viewport.rem / 16), viewport.height - viewport.topOfPage - 240),
        ),
});
