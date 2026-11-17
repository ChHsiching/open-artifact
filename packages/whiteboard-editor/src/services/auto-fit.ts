/**
 * Auto-fit: until the viewer moves the view themselves, the camera keeps
 * the whole board in view. That covers the first open and the agent's
 * claimed areas and new items as it adds them. A tab that restored its own
 * remembered camera never auto-fits, and neither does one following
 * someone.
 *
 * A fit happens only when the content outgrows the box last fitted, so a
 * board that only changes inside its bounds keeps a steady view.
 */

import { unionBounds, type Box } from '@open-artifact/whiteboard-core';
import { claimFrame } from '../collab/claim-frames.ts';
import { useBoard } from '../state/board.ts';
import { useCamera } from '../state/camera.ts';
import { currentMeasures } from '../state/measures.ts';
import { usePresence } from '../state/presence.ts';
import { contentBounds } from './navigation.ts';
import { fitTo } from './viewport.ts';

/** Whether `inner` lies within `outer`. */
function contains(outer: Box, inner: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** The box that holds everything on the board, the agent's claimed areas included. */
function boardBox(): Box | undefined {
  const content = useBoard.getState().board.content;
  const measures = currentMeasures();
  const claims = (content.claimed ?? []).map((claim) => claimFrame(claim, content.elements, measures));
  return unionBounds([contentBounds(content.elements, measures), ...claims].filter((box): box is Box => box !== undefined));
}

/**
 * Starts fitting the view to the board. `ownView`: this tab restored a
 * camera of its own, which it keeps. Returns a function that stops.
 */
export function startAutoFit({ ownView }: { ownView: boolean }): () => void {
  /** The box last fitted; undefined until the first fit. */
  let fitted: Box | undefined;
  /** A fit has been made with elements on the board (not only claims). */
  let fittedElements = false;
  /** The viewer moved the view after a fit. */
  let interacted = false;
  /** The camera this service set last, to tell its moves from the viewer's. */
  let ownCamera: unknown;

  const fit = (): void => {
    const camera = useCamera.getState();
    if (camera.width <= 1 || camera.height <= 1) return;
    if (usePresence.getState().following !== null) return;
    const hasElements = useBoard.getState().board.content.elements.length > 0;
    // Once a fit covered elements, only the viewer's own move stops fitting;
    // before that, a remembered view does.
    if (fitted !== undefined && (fittedElements || !hasElements) ? interacted : ownView) return;
    const box = boardBox();
    if (box === undefined) return;
    fittedElements ||= hasElements;
    if (fitted !== undefined && contains(fitted, box)) return;
    fitted = box;
    fitTo(box);
    ownCamera = useCamera.getState().camera;
  };

  const stopCamera = useCamera.subscribe((state, previous) => {
    if (state.width !== previous.width || state.height !== previous.height) {
      fit();
      return;
    }
    if (state.camera !== previous.camera && state.camera !== ownCamera && fitted !== undefined) interacted = true;
  });
  const stopBoard = useBoard.subscribe((state, previous) => {
    if (state.board.content !== previous.board.content) fit();
  });
  fit();
  return () => {
    stopCamera();
    stopBoard();
  };
}
