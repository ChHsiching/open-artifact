import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { referenceTintStyle } from '../grid/cell-drawing.ts';
export let REFERENCE_PATCH_BLEED_PX: Dynamic;
export let REFERENCE_PATCH_GAP_PX: Dynamic;
export function widenReferencePatches(patches?: Dynamic) {
  let bleedBetween = (patch?: Dynamic, nextPatch?: Dynamic) =>
    patch === undefined || nextPatch === undefined || patch.top !== nextPatch.top
      ? REFERENCE_PATCH_BLEED_PX
      : Math.max(0, Math.min(REFERENCE_PATCH_BLEED_PX, (nextPatch.left - patch.left - patch.width - REFERENCE_PATCH_GAP_PX) / 2));
  return patches.map((patch?: Dynamic, index?: Dynamic) => {
    let [bleedBefore, bleedAfter] = [bleedBetween(patches[index - 1], patch), bleedBetween(patch, patches[index + 1])];
    return {
      ...patch,
      left: patch.left - bleedBefore,
      width: patch.width + bleedBefore + bleedAfter,
    };
  });
}
export function patchElementOfBox(box: Dynamic, ownerDocument: Dynamic, className: Dynamic) {
  let patchElement = ownerDocument.createElement('div');
  patchElement.className = className;
  for (let property of ['left', 'top', 'width', 'height'] as Dynamic) patchElement.style.setProperty(property, `${box[property]}px`);
  return patchElement;
}
export function referencePatchesInText(textNode: Dynamic, text: Dynamic, { start: start, end: end }: Dynamic, origin: Dynamic) {
  let ownerDocument = textNode.ownerDocument;
  if (
    ownerDocument === null ||
    textNode.nodeValue !==
      `${text}
` ||
    end > text.length
  )
    return [];
  let range = ownerDocument.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  return [...range.getClientRects()]
    .filter((input?: Dynamic) => input.width > 0)
    .map(
      (input?: Dynamic) => ({
        left: input.left - origin.left,
        top: input.top - origin.top,
        width: input.width,
        height: input.height,
      }),
    );
}
export function useFollowScrollOfBox(scrollerRef?: Dynamic, followerRefs?: Dynamic) {
  React.useLayoutEffect(() => {
    let scroller = scrollerRef.current;
    if (scroller === null) return;
    let follow = () => {
      let translate = `${-scroller.scrollLeft}px ${-scroller.scrollTop}px`;
      for (let { current: follower } of followerRefs as Dynamic) follower?.style.setProperty('translate', translate);
    };
    follow();
    scroller.addEventListener('scroll', follow);
    return () => scroller.removeEventListener('scroll', follow);
  });
}
export function FormulaBarReferenceHues({ text: text, references: references, brackets: brackets, box: box }: Dynamic) {
  let mirroredText = `${text}
`;
  let fillLayerRef = React.useRef(null);
  let hueLayerRef = React.useRef(null);
  let mirrorRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let [field, textNode] = [box.current, mirrorRef.current?.firstChild ?? null];
    let [fillLayer, hueLayer] = [fillLayerRef.current, hueLayerRef.current];
    let view = field?.ownerDocument.defaultView ?? null;
    if (field === null || textNode === null || view === null) return;
    if (fillLayer === null || hueLayer === null) return;
    let placeLayers = () => {
      let style = view.getComputedStyle(field);
      for (let layer of [fillLayer.parentElement, hueLayer.parentElement] as Dynamic) {
        for (let property of MIRRORED_FIELD_STYLES as Dynamic) layer?.style.setProperty(property, style.getPropertyValue(property));
        let offsetParent = layer?.offsetParent;
        if (offsetParent === null || offsetParent === undefined) continue;
        let [fieldRect, parentRect] = [field.getBoundingClientRect(), offsetParent.getBoundingClientRect()];
        for (let [property, px] of [
          ['left', fieldRect.left - parentRect.left - offsetParent.clientLeft],
          ['top', fieldRect.top - parentRect.top - offsetParent.clientTop],
          ['width', fieldRect.width],
          ['height', fieldRect.height],
        ] as Dynamic)
          layer?.style.setProperty(property, `${px}px`);
      }
      fillLayer.style.setProperty('translate', 'none');
      let origin = fillLayer.getBoundingClientRect();
      let patches = references.flatMap(
        ({ writtenAt: writtenAt, hue: hue }: Dynamic) =>
          writtenAt === undefined
            ? []
            : referencePatchesInText(textNode, text, writtenAt, origin).map(
                (patch?: Dynamic) =>
                  Object.assign(patch, {
                    hue: hue,
                  }),
              ),
      );
      let bracketPatches = (brackets === null ? [] : [brackets.opensAt, brackets.closesAt]).flatMap(
        (at?: Dynamic) =>
          referencePatchesInText(
            textNode,
            text,
            {
              start: at,
              end: at + 1,
            },
            origin,
          ),
      );
      let ownerDocument = field.ownerDocument;
      (fillLayer.replaceChildren as Dynamic)(
        ...referencePatchElements(widenReferencePatches(patches), ownerDocument, 'sheet-fill-under-reference'),
        ...bracketPatches.map((patch?: Dynamic) => patchElementOfBox(patch, ownerDocument, 'sheet-fill-under-bracket')),
      );
      (hueLayer.replaceChildren as Dynamic)(...referencePatchElements(patches, ownerDocument, 'sheet-hue-over-reference'));
      let scrollTranslate = `${-field.scrollLeft}px ${-field.scrollTop}px`;
      for (let layer of [fillLayer, hueLayer] as Dynamic) layer.style.setProperty('translate', scrollTranslate);
    };
    placeLayers();
    let resizeObserver = new (view.ResizeObserver as Dynamic)(placeLayers);
    resizeObserver.observe(field);
    field.addEventListener('focus', placeLayers);
    field.addEventListener('blur', placeLayers);
    field.ownerDocument.fonts.addEventListener('loadingdone', placeLayers);
    return () => {
      resizeObserver.disconnect();
      field.removeEventListener('focus', placeLayers);
      field.removeEventListener('blur', placeLayers);
      field.ownerDocument.fonts.removeEventListener('loadingdone', placeLayers);
    };
  }, [box, text, references, brackets]);
  useFollowScrollOfBox(box, [fillLayerRef, hueLayerRef]);
  return jsxs(Fragment, {
    children: [
      jsxs('div', {
        'aria-hidden': true,
        translate: 'no',
        className: 'sheet-entry-in-hues sheet-hues-in-formula-bar',
        'data-draws': 'fills',
        children: [
          jsx('span', {
            ref: mirrorRef,
            children: mirroredText,
          }),
          jsx('div', {
            ref: fillLayerRef,
            className: 'sheet-patches-on-entry',
          }),
        ],
      }),
      jsx('div', {
        'aria-hidden': true,
        translate: 'no',
        className: 'sheet-entry-in-hues sheet-hues-in-formula-bar',
        'data-draws': 'hues',
        children: jsx('div', {
          ref: hueLayerRef,
          className: 'sheet-patches-on-entry',
        }),
      }),
    ],
  });
}
[REFERENCE_PATCH_BLEED_PX, REFERENCE_PATCH_GAP_PX] = [1, 1];
export const referencePatchElements = (patches?: Dynamic, ownerDocument?: Dynamic, className?: Dynamic) =>
  patches.map((patch?: Dynamic) => {
    let patchElement = patchElementOfBox(patch, ownerDocument, className);
    for (let [property, propertyValue] of Object.entries(referenceTintStyle(patch.hue)) as Dynamic)
      patchElement.style.setProperty(property, propertyValue);
    return patchElement;
  });
export const BOX_SIDES = ['top', 'right', 'bottom', 'left'];
export const MIRRORED_FIELD_STYLES = [
  'box-sizing',
  ...BOX_SIDES.map((side?: Dynamic) => `padding-${side}`),
  ...BOX_SIDES.map((side?: Dynamic) => `border-${side}-width`),
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'direction',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-stretch',
  'font-kerning',
  'font-optical-sizing',
  'font-feature-settings',
  'font-variation-settings',
  'font-variant-ligatures',
  'font-variant-numeric',
  'letter-spacing',
  'word-spacing',
  'line-height',
  'tab-size',
  'text-indent',
  'text-rendering',
  'text-transform',
  'mask-image',
  'mask-clip',
  'mask-composite',
  'mask-origin',
  'mask-position',
  'mask-repeat',
  'mask-size',
  'z-index',
];
