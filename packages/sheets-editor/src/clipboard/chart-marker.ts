import type { Dynamic } from '../dynamic.ts';
export function decodeChartFromClipboard(markerText?: Dynamic, ofSheet?: Dynamic) {
  if (markerText === '' || markerText.length > MOST_CHART_MARKER_LENGTH) return null;
  let parsed: Dynamic;
  try {
    parsed = JSON.parse(markerText);
  } catch {
    return null;
  }
  let entries = new (Map as Dynamic)(typeof parsed === 'object' && parsed !== null ? Object.entries(parsed) : []);
  let [sheetId, placementId] = [entries.get('sheetId'), entries.get('placementId')];
  if (typeof sheetId !== 'string' || typeof placementId !== 'string') return null;
  return ofSheet !== null && entries.get('ofSheet') === ofSheet
    ? {
        sheetId: sheetId,
        placementId: placementId,
      }
    : 'ofAnotherSheet';
}
export const encodeChartForClipboard = ({ sheetId: sheetId, placementId: placementId }: Dynamic, ofSheet?: Dynamic) =>
  JSON.stringify({
    ofSheet: ofSheet,
    sheetId: sheetId,
    placementId: placementId,
  });
export const MOST_CHART_MARKER_LENGTH = 1000;
