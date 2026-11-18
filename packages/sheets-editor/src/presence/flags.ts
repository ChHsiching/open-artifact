import type { Dynamic } from '../dynamic.ts';
import { isInSpan } from '../grid/geometry.ts';
export function estimateCharWidth(char?: Dynamic) {
  if (/\p{Extended_Pictographic}/u.test(char)) return 16;
  if (WIDE_CHAR_PATTERN.test(char) || /[MWmw]/.test(char)) return 11;
  if (/\p{Lu}/u.test(char)) return 8;
  return /[filjtr .’'-]/u.test(char) ? 3.5 : 6;
}
export function estimateTextWidth(text?: Dynamic) {
  let width: Dynamic = 0;
  for (let char of text as Dynamic) width += estimateCharWidth(char);
  return width;
}
export function flagStandOutside(box?: Dynamic, bottomLimit?: Dynamic, topLimit?: Dynamic) {
  let { left: left, top: top, height: height, showsIn: showsIn } = box;
  if (left < showsIn.left) return null;
  if (top - 1 - flagRoomTop(box, topLimit) >= FLAG_HEIGHT) return 'above';
  let bottom = top + height;
  return bottom <= showsIn.top + showsIn.height && bottom + FLAG_HEIGHT <= bottomLimit ? 'below' : null;
}
export function placeSelectionFlag(
  box: Dynamic,
  { flagWidth: flagWidth, roomAbove: roomAbove, isOneCell: isOneCell, heightCovered = 0, ...sizes }: Dynamic,
  bottomLimit?: Dynamic,
  topOfView?: Dynamic,
) {
  let coveredOffset = box.showsIn.top < topOfView ? 0 : heightCovered;
  let topLimit = topOfView + coveredOffset;
  let boxBelowCovered = {
    ...box,
    showsIn: {
      ...box.showsIn,
      top: box.showsIn.top + coveredOffset,
      height: box.showsIn.height - coveredOffset,
    },
  };
  let { top: top, height: height, showsIn: showsIn } = boxBelowCovered;
  let isPastLeft = boxBelowCovered.left < showsIn.left;
  if (isPastLeft && isFlagPastEdge(boxRight(boxBelowCovered), showsIn, flagWidth)) return null;
  let left = isPastLeft
    ? Math.min(showsIn.left + 1, boxRight(boxBelowCovered) - flagLeftInset(flagWidth, sizes.widthOfAll))
    : boxBelowCovered.left;
  let flagBox = {
    ...boxBelowCovered,
    left: left,
    width: boxRight(boxBelowCovered) - left,
  };
  let outside = flagStandOutside(
    {
      ...flagBox,
      left: Math.max(left, showsIn.left),
    },
    bottomLimit,
    topLimit,
  );
  if (outside === 'above')
    return {
      stands: 'above',
      box: flagBox,
    };
  let roomTop = flagRoomTop(boxBelowCovered, topLimit);
  let bottom = top + height;
  let heightInside = Math.min(bottom, showsIn.top + showsIn.height, bottomLimit) - Math.max(top, roomTop);
  let isTopHidden = top < roomTop && sizes.heightOfAll >= FLAG_INSIDE_MIN_HEIGHT;
  if (!isOneCell && (heightInside >= FLAG_INSIDE_MIN_HEIGHT || isTopHidden) && (roomAbove > FLAG_HEIGHT || outside === null)) {
    let insideTop = Math.min(roomTop + 1, bottom - FLAG_HEIGHT);
    return {
      stands: 'inside',
      box: {
        ...flagBox,
        top: insideTop,
        height: bottom - insideTop,
      },
    };
  }
  return outside === null
    ? null
    : {
        stands: outside,
        box: flagBox,
      };
}
export function cellBoxAt(x?: Dynamic, y?: Dynamic, rows?: Dynamic) {
  for (let row of rows as Dynamic)
    for (let cell of row.cells as Dynamic) if (isInSpan(x, cell.left, cell.width) && isInSpan(y, row.top + cell.top, cell.height)) return cell;
  return null;
}
export function flagEndForBox(
  { stands: stands, box: { left: boxLeft, top: boxTop, width: boxWidth, height: boxHeight, showsIn: showsIn } }: Dynamic,
  shownCells?: Dynamic,
) {
  if (boxLeft + boxWidth > showsIn.left + showsIn.width) return 'left';
  let edgeRow = (
    {
      above: boxTop - 2,
      below: boxTop + boxHeight,
      inside: boxTop,
    } as Dynamic
  )[stands];
  let edgeCells = [cellBoxAt(boxLeft, edgeRow, shownCells), cellBoxAt(boxLeft + boxWidth - 2, edgeRow, shownCells)];
  let areEdgeCellsEmpty = edgeCells.every((cell?: Dynamic) => cell?.text === '' && cell.checkbox === null);
  let [leftCell, rightCell] = areEdgeCellsEmpty ? [cellBoxAt(boxLeft, boxTop, shownCells), null] : edgeCells;
  return flagSideOfCellAlignment(leftCell) === 'left' && flagSideOfCellAlignment(rightCell) !== 'right' ? 'right' : 'left';
}
export function layOutSelectionFlags(flagRequests?: Dynamic, viewHeight?: Dynamic, topInset?: Dynamic, shownCells?: Dynamic) {
  let flagsByEdge = new (Map as Dynamic)();
  for (let request of flagRequests as Dynamic) {
    let placed = placeSelectionFlag(
      request.box,
      {
        ...request,
        flagWidth: 0,
      },
      viewHeight,
      topInset,
    );
    if (placed === null) continue;
    let { stands: stands, box: box } = placed;
    let flag = {
      ...request,
      box: box,
    };
    let edge = `${stands} ${stands === 'below' ? box.top + box.height : box.top}`;
    let edgeKey = `${edge} ${Math.max(request.box.left, box.showsIn.left)}`;
    let existing = flagsByEdge.get(edgeKey);
    let { atCorner = [], outlineKeys = [] } = existing ?? {};
    let isUserAlreadyAtCorner = atCorner.some(({ userId: userId }: Dynamic) => userId === flag.userId);
    flagsByEdge.set(edgeKey, {
      stands: stands,
      edge: edge,
      atCorner: isUserAlreadyAtCorner ? atCorner : [...atCorner, flag],
      outlineKeys: [...outlineKeys, flag.key],
      lastMoveAtMs: Math.max(existing?.lastMoveAtMs ?? 0, flag.movedAtMs),
      isAllThatShows: existing?.isAllThatShows === true || flag.isUnderOwnOutline,
      areAllAsWide: atCorner.every((other?: Dynamic) => boxRight(other.box) === boxRight(box)) && existing?.areAllAsWide !== false,
      areAllHeld: box.left > request.box.left && existing?.areAllHeld !== false,
    });
  }
  let flagGroups = [...flagsByEdge.values()].flatMap(({ areAllHeld: areAllHeld, atCorner: atCorner, ...group }: Dynamic) => {
    let [first, ...rest] = atCorner;
    if (first === undefined || !areAllHeld)
      return [
        {
          ...group,
          atCorner: atCorner,
        },
      ];
    let rightEdge = (Math.max as Dynamic)(...atCorner.map(({ box: box }: Dynamic) => boxRight(box)));
    if (isFlagPastEdge(rightEdge, first.box.showsIn, flagWidthOf(first.name))) return [];
    let widestFlagRow = (Math.max as Dynamic)(...atCorner.map(({ widthOfAll: widthOfAll }: Dynamic) => widthOfAll));
    let left = Math.min(first.box.left, rightEdge - flagLeftInset(flagWidthOf(first.name), widestFlagRow));
    let heldBox = {
      ...first.box,
      left: left,
      width: boxRight(first.box) - left,
    };
    return [
      {
        ...group,
        atCorner: [
          {
            ...first,
            box: heldBox,
          },
          ...rest,
        ],
      },
    ];
  });
  return flagGroups.flatMap(({ atCorner: atCorner, edge: edge, areAllAsWide: areAllAsWide, ...group }: Dynamic) => {
    let [first] = atCorner;
    if (first === undefined) return [];
    let width = (Math.max as Dynamic)(...atCorner.map(({ box: box2 }: Dynamic) => boxRight(box2))) - first.box.left;
    let box = {
      ...first.box,
      width: width,
    };
    let isEdgeFree = !flagGroups.some(
      (other?: Dynamic) => other.edge === edge && isInSpan(other.atCorner[0]?.box.left ?? box.left, box.left + 1, width - 1),
    );
    let runningWidth: Dynamic = 0;
    let flagEnds = atCorner.map(({ name: name }: Dynamic) => (runningWidth += flagWidthOf(name)));
    let fitsWithBadge = (flagEnd?: Dynamic, index?: Dynamic) =>
      index === 0 || flagEnd + moreBadgeWidth(atCorner.length - index - 1) <= width;
    let shownCount = runningWidth <= width ? atCorner.length : flagEnds.filter(fitsWithBadge).length;
    let shownFlags = atCorner.slice(0, shownCount);
    let foldedCount = atCorner.length - shownFlags.length;
    let badgeWidth = foldedCount > 0 ? moreBadgeWidth(foldedCount) : 0;
    return [
      {
        key: first.key,
        box: box,
        ...group,
        end:
          areAllAsWide && isEdgeFree
            ? flagEndForBox(
                {
                  stands: group.stands,
                  box: box,
                },
                shownCells,
              )
            : 'left',
        flags: shownFlags.map(
          ({ key: key, name: name, color: color, inkColor: inkColor }: Dynamic) => ({
            key: key,
            name: name,
            color: color,
            inkColor: inkColor,
          }),
        ),
        countFolded: foldedCount,
        flagsWidth: Math.max(Math.min(width, (flagEnds[shownCount - 1] ?? 0) + badgeWidth), foldedCount > 0 ? 2 * FLAG_PADDING + badgeWidth : 0),
      },
    ];
  });
}
export const PEER_FLAG_REST_AFTER_MS = 3200;
export const FLAG_HEIGHT = 18;
export const FLAG_PADDING = 6;
export const FLAG_BORDER = 1;
export const MORE_BADGE_PADDING = 3;
export const FLAG_MAX_WIDTH = 240;
export const WIDE_CHAR_PATTERN = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\u3000\uFF01-\uFF60]/u;
export const flagWidthOf = (flagName?: Dynamic) =>
  Math.min(2 * FLAG_PADDING + estimateTextWidth(flagName), FLAG_MAX_WIDTH) + FLAG_BORDER;
export const moreBadgeWidth = (count?: Dynamic) => MORE_BADGE_PADDING + estimateTextWidth(`+${count}`);
export const AGENT_FLAG_WIDTH = flagWidthOf('Agent');
export const flagRoomTop = ({ top: top, showsIn: showsIn }: Dynamic, topLimit?: Dynamic) =>
  top < topLimit ? showsIn.top : Math.max(showsIn.top, topLimit);
export const FLAG_INSIDE_MIN_HEIGHT = 2 * FLAG_HEIGHT;
export const boxRight = ({ left: left, width: width }: Dynamic) => left + width;
export const FLAG_LEFT_SLACK = 6;
export const flagLeftInset = (flagWidth?: Dynamic, widthOfAll?: Dynamic) => Math.min(flagWidth + FLAG_LEFT_SLACK, widthOfAll);
export const isFlagPastEdge = (right: Dynamic, { left: left, width: width }: Dynamic, flagWidth?: Dynamic) =>
  right > left + width && width < flagWidth;
export const flagTop = ({ stands: stands, box: { top: top, height: height } }: Dynamic) =>
  (
    ({
      above: top - FLAG_HEIGHT,
      below: top + height,
      inside: top,
    }) as Dynamic
  )[stands];
export const flagSideOfCellAlignment = (cell?: Dynamic) =>
  cell === null || cell.text === '' || cell.alignment === 'center' ? null : cell.alignment;
