import type { Dynamic } from '../dynamic.ts';
import { resetScrollForFreezeDrag, layoutOfView } from '../grid/layout.ts';
import { hitTestGrid, rangeSpansOnScreen, isInSpan } from '../grid/geometry.ts';
import { areaOfPosition } from '../selection/model.ts';
import { drawnBoxOfSpans, clipBoxToShown } from '../grid/view-boxes.ts';
import { AGENT_FLAG_WIDTH, FLAG_HEIGHT } from './flags.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function nameFlagOnTopAt(
  pointer: Dynamic,
  { body: body, nameFlagsOfOthers: nameFlagsOfOthers, outlinesOfOthers: outlinesOfOthers }: Dynamic,
) {
  let point = {
    x: pointer.x - body.left,
    y: pointer.y - body.top,
  };
  if (
    nameFlagsOfOthers.length < 2 ||
    !isPointWithinBox(
      {
        ...body,
        left: 0,
        top: 0,
      },
      point,
    )
  )
    return null;
  let best: Dynamic = null;
  for (let outline of outlinesOfOthers as Dynamic) {
    if (!isPointInShownBox(outline.box, point)) continue;
    let flagKey = nameFlagsOfOthers.find(({ outlineKeys: outlineKeys }: Dynamic) => outlineKeys.includes(outline.key))?.key;
    if (flagKey === undefined) continue;
    if (best === null || outlineArea(outline) <= outlineArea(best.outline))
      best = {
        outline: outline,
        corner: flagKey,
      };
  }
  return best?.corner ?? null;
}
export function pointedCellBox(pointer: Dynamic, state: PageState, reads: ReadsWithTextMeasurer) {
  let stateForGrid = resetScrollForFreezeDrag(state);
  let layout = layoutOfView(stateForGrid, reads);
  let pointed = hitTestGrid(pointer, stateForGrid, layout);
  if (pointed?.kind !== 'cell') return null;
  let area = reads.mergedAreaAt(state.sheetId, pointed) ?? areaOfPosition(pointed);
  let box = drawnBoxOfSpans(rangeSpansOnScreen(area, stateForGrid, layout, stateForGrid));
  return box === null ? null : clipBoxToShown(box);
}
export function flagsHiddenByPointer(
  pointer: Dynamic,
  state: PageState,
  reads: ReadsWithTextMeasurer,
  { body: body, activeCellBox: activeCellBox, nameFlagsOfOthers: nameFlagsOfOthers, marksOnChangesByAgent: marksOnChangesByAgent }: Dynamic,
) {
  let agentFlags = marksOnChangesByAgent.flatMap(
    ({ name: name }: Dynamic) =>
      name === null
        ? []
        : [
            {
              ...name,
              end: 'left',
              flagsWidth: Math.min(name.box.width, AGENT_FLAG_WIDTH),
            },
          ],
  );
  if (nameFlagsOfOthers.length + agentFlags.length === 0) return NO_FLAGS_HIDDEN;
  let point = {
    x: pointer.x - body.left,
    y: pointer.y - body.top,
  };
  if (activeCellBox !== null && isPointWithinBox(clipBoxToShown(activeCellBox), point)) return NO_FLAGS_HIDDEN;
  let pointedBox = pointedCellBox(pointer, state, reads);
  if (pointedBox === null) return NO_FLAGS_HIDDEN;
  let isFlagOverCell = ({ box: box, stands: stands, end: end, flagsWidth: flagsWidth }: Dynamic) => {
    let { left: left, top: top, width: width, height: height } = growBoxByBorder(box);
    let flagLeft = end === 'left' ? left : left + width - flagsWidth;
    let topOfFlag = (
      {
        above: top - FLAG_HEIGHT,
        below: top + height,
        inside: top,
      } as Dynamic
    )[stands];
    let flagBox = {
      left: flagLeft + 1,
      top: topOfFlag + 1,
      width: flagsWidth - 1,
      height: FLAG_HEIGHT - 1,
    };
    let [shownLeft, shownTop] = [Math.max(flagBox.left, box.showsIn.left), Math.max(flagBox.top, box.showsIn.top)];
    let shownFlagBox = {
      left: shownLeft,
      top: shownTop,
      width: flagBox.left + flagBox.width - shownLeft,
      height: flagBox.top + flagBox.height - shownTop,
    };
    return doBoxesOverlap(shownFlagBox, pointedBox);
  };
  return {
    corners: nameFlagsOfOthers
      .filter((flag?: Dynamic) => isFlagOverCell(flag) && !flag.isAllThatShows)
      .map(({ key: key }: Dynamic) => key),
    isOfAgent: agentFlags.some(isFlagOverCell),
  };
}
export function nameFlagsCalledUpAt(
  pointer: Dynamic,
  { body: body, nameFlagsOfOthers: nameFlagsOfOthers, outlinesOfOthers: outlinesOfOthers }: Dynamic,
) {
  let point = {
    x: pointer.x - body.left,
    y: pointer.y - body.top,
  };
  if (
    !isPointWithinBox(
      {
        ...body,
        left: 0,
        top: 0,
      },
      point,
    )
  )
    return [];
  let outlinesPointed = outlinesOfOthers.filter(({ box: box }: Dynamic) => isPointInShownBox(box, point));
  return nameFlagsOfOthers
    .filter(({ outlineKeys: outlineKeys }: Dynamic) => outlinesPointed.some(({ key: key }: Dynamic) => outlineKeys.includes(key)))
    .map(({ key: key }: Dynamic) => key);
}
export const isPointWithinBox = ({ left: left, top: top, width: width, height: height }: Dynamic, { x: x, y: y }: Dynamic) =>
  isInSpan(x, left, width) && isInSpan(y, top, height);
export const growBoxByBorder = ({ left: left, top: top, width: width, height: height }: Dynamic) => ({
  left: left - 1,
  top: top - 1,
  width: width + 1,
  height: height + 1,
});
export const isPointInShownBox = (box: Dynamic, { x: x, y: y }: Dynamic) =>
  isPointWithinBox(growBoxByBorder(box), {
    x: x,
    y: y,
  }) &&
  isPointWithinBox(box.showsIn, {
    x: Math.max(x, box.left),
    y: Math.max(y, box.top),
  });
export const outlineArea = ({ box: box }: Dynamic) => box.width * box.height;
export const NO_FLAGS_HIDDEN = {
  corners: [],
  isOfAgent: false,
};
export const doBoxesOverlap = (first?: Dynamic, second?: Dynamic) =>
  first.left < second.left + second.width &&
  second.left < first.left + first.width &&
  first.top < second.top + second.height &&
  second.top < first.top + first.height;
export const presenceFlagsAtPointer = (pointer: Dynamic, state: PageState, reads: ReadsWithTextMeasurer, gridView?: Dynamic) => ({
  cornerOnTop: nameFlagOnTopAt(pointer, gridView),
  cornersCalledUp: nameFlagsCalledUpAt(pointer, gridView),
  flagsHidden: flagsHiddenByPointer(pointer, state, reads, gridView),
});
