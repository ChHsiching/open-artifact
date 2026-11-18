import type { Dynamic } from '../dynamic.ts';
export function createWorkbookPainter(options?: Dynamic) {
  let { draw: draw, report: report, onFailedLater: onFailedLater } = options;
  let own: Dynamic = null;
  let cleanUp: Dynamic = noDrawingCleanup;
  let drawing: Dynamic = null;
  let state: Dynamic = 'empty';
  let drawAfresh = () => {
    cleanUp();
    cleanUp = noDrawingCleanup;
    state = 'empty';
    if (own === null) return;
    let attempt: Dynamic = {};
    drawing = attempt;
    try {
      cleanUp = draw(own, (error?: Dynamic) => {
        if (drawing !== attempt) return;
        drawing = null;
        cleanUp();
        cleanUp = noDrawingCleanup;
        state = 'failed';
        report(error);
        onFailedLater();
      });
      state = 'drawn';
    } catch (error: Dynamic) {
      state = 'failed';
      report(error);
    }
  };
  return {
    ownIs(own2?: Dynamic) {
      if (own2 === own) return;
      own = own2;
      drawAfresh();
    },
    drawAfresh: drawAfresh,
    state: () => state,
  };
}
export const noDrawingCleanup = () => {};
