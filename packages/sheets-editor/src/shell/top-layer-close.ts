import type { Dynamic } from '../dynamic.ts';
export let offerTopLayerClose: Dynamic;
export function pushTopLayerClose(offerClose?: Dynamic) {
  topLayerClosers.push(offerClose);
  offerCloseOfTopmostLayer();
  return () => {
    let index = topLayerClosers.indexOf(offerClose);
    if (index >= 0) topLayerClosers.splice(index, 1);
    offerCloseOfTopmostLayer();
  };
}
export function setTopLayerCloseOfferer(offerer?: Dynamic) {
  offerTopLayerClose = offerer;
  offerCloseOfTopmostLayer();
}
export const topLayerClosers: Dynamic = [];
offerTopLayerClose = () => {};
export const offerCloseOfTopmostLayer = () => offerTopLayerClose(topLayerClosers.at(-1) ?? null);
