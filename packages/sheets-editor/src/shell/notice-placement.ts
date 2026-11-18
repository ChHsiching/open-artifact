import type { Dynamic } from '../dynamic.ts';
export function shouldNoticesSitAtFoot({
  isAtFoot: isAtFoot,
  howManyUp: howManyUp,
  isAnyLeft: isAnyLeft,
  isFrontNew: isFrontNew,
  spot: spot,
  spotAtFoot: spotAtFoot,
  notToCover: notToCover,
  betterNotCovered: betterNotCovered,
}: Dynamic) {
  if (howManyUp === 0) return isAtFoot && isAnyLeft;
  if (isAtFoot && !isFrontNew) return true;
  let stackLift = 14 * (howManyUp - 1);
  let spotLifted = {
    ...spot,
    bottom: spot.bottom + stackLift,
  };
  let spotAtFootLifted = {
    ...spotAtFoot,
    top: spotAtFoot.top - stackLift,
  };
  return (
    notToCover.some((box?: Dynamic) => doNoticeBoxesOverlap(box, spotLifted)) ||
    (betterNotCovered.some((box?: Dynamic) => doNoticeBoxesOverlap(box, spotLifted)) &&
      !notToCover.some((box?: Dynamic) => doNoticeBoxesOverlap(box, spotAtFootLifted)))
  );
}
export function noticeSpotAtFoot({
  heightOfWindow: heightOfWindow,
  roomUnder: roomUnder,
  rem: rem,
  topOfPinnedCard: topOfPinnedCard,
  rightOfCells: rightOfCells,
  width: width,
  height: height,
}: Dynamic) {
  let footLine = heightOfWindow - (Number.isNaN(roomUnder) ? 5.5 * rem : roomUnder);
  let stackBottom = topOfPinnedCard === null ? footLine - 0.75 * rem : topOfPinnedCard - rem;
  let stackRight = rightOfCells - rem;
  return {
    left: stackRight - width,
    top: stackBottom - height,
    right: stackRight,
    bottom: footLine,
  };
}
export function noticeLiftToClearCells({
  spot: spot,
  aboveBar: aboveBar,
  keptClear: keptClear,
  topOfCells: topOfCells,
  gap: gap,
  liftInUse: liftInUse,
}: Dynamic) {
  if (liftInUse !== null && liftInUse >= aboveBar) return liftInUse;
  let [firstKeptClear, ...restKeptClear] = keptClear;
  if (firstKeptClear === undefined) return aboveBar;
  let keptClearBox = restKeptClear.reduce(
    (union?: Dynamic, box?: Dynamic) => ({
      left: Math.min(union.left, box.left),
      top: Math.min(union.top, box.top),
      right: Math.max(union.right, box.right),
      bottom: Math.max(union.bottom, box.bottom),
    }),
    firstKeptClear,
  );
  let spotAboveBar = {
    ...spot,
    top: spot.top - aboveBar,
    bottom: spot.bottom - aboveBar,
  };
  if (!doNoticeBoxesOverlap(keptClearBox, spotAboveBar)) return aboveBar;
  let lift = spot.bottom - keptClearBox.top + gap;
  if (spot.top - lift >= topOfCells) return lift;
  return restKeptClear.length === 0
    ? aboveBar
    : noticeLiftToClearCells({
        spot: spot,
        aboveBar: aboveBar,
        keptClear: [firstKeptClear],
        topOfCells: topOfCells,
        gap: gap,
        liftInUse: liftInUse,
      });
}
export const NOTICE_STACK_STEP_PX = 14;
export const doNoticeBoxesOverlap = (box?: Dynamic, other?: Dynamic) =>
  box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom;
export const boxesNoticesMustNotCover = ({ activeCellBox: activeCellBox, placedViews: placedViews }: Dynamic) => [
  ...(activeCellBox === null ? [] : [activeCellBox]),
  ...placedViews
    .filter(({ isInView: isInView, isSelected: isSelected }: Dynamic) => isInView && isSelected)
    .map(({ box: box }: Dynamic) => box),
];
