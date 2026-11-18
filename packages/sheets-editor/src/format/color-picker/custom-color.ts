import { TextInput } from '../../kit/text-input.tsx';
import { Tooltip } from '../../kit/tooltip.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { PAGE_BACKGROUND_COLORS, PAGE_TEXT_COLORS } from '../cell-colors.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { DEFAULT_CELL_FONT_STYLE } from '../../grid/cell-drawing.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { hexToHsb, hsbToHex, normalizeHexColor } from '../hsb-colors.ts';
export function stopKeyUnlessTabOrEscape(event?: Dynamic) {
  if (event.key !== 'Tab' && event.key !== 'Escape') event.stopPropagation();
}
export function ColorSamplePreview({ sample: sample, color: color }: Dynamic) {
  let paints = sample.paintsWith(color);
  let [fill, text] = [paints.fill ?? PAGE_BACKGROUND_COLORS, paints.text ?? PAGE_TEXT_COLORS];
  let sampleSpan = (input?: Dynamic, options?: Dynamic) =>
    jsxs('span', {
      className: 'sheet-color-sample',
      'data-on': input,
      style: {
        backgroundColor: PAGE_BACKGROUND_COLORS[input],
      },
      children: [
        jsx('span', {
          className: 'sheet-color-sample-label',
          children: options,
        }),
        jsx('span', {
          className: sample.shape === 'pill' ? 'sheet-color-sample-cell font-medium' : 'sheet-color-sample-cell',
          'data-shape': sample.shape,
          style: {
            ...DEFAULT_CELL_FONT_STYLE,
            backgroundColor: fill[input],
            color: text[input],
          },
          children: sample.text,
        }),
      ],
    });
  return jsxs('div', {
    'aria-hidden': true,
    className: 'sheet-color-samples',
    children: [sampleSpan('onLight', sheetMessages.onLightSheet()), sampleSpan('onDark', sheetMessages.onDarkSheet())],
  });
}
export function CustomColorPicker(props?: Dynamic) {
  let { startsAt: startsAt, sample: sample, onChosen: onChosen } = props;
  let [hsb, setHsb] = React.useState(() => hexToHsb(startsAt, 0));
  let hsbRef = React.useRef(hsb);
  let [hexTyped, setHexTyped] = React.useState(null);
  let isChangeUnsent = React.useRef(false);
  let [pointersDown, setPointersDown] = React.useState([]);
  let isPointerDown = pointersDown.length > 0;
  let [isSampleShown, setSampleShown] = React.useState(false);
  let rootRef = React.useRef(null);
  let hex = hsbToHex(hsb);
  let color = {
    kind: 'rgb',
    hex: hex,
  };
  let changeHsb = (input?: Dynamic) => {
    hsbRef.current = input;
    isChangeUnsent.current = true;
    setHsb(input);
    setHexTyped(null);
  };
  let sendChange = () => {
    if (!isChangeUnsent.current) return;
    isChangeUnsent.current = false;
    onChosen({
      kind: 'rgb',
      hex: hsbToHex(hsbRef.current),
    });
  };
  let moveOnSquare = (event?: Dynamic) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    let bounds = event.currentTarget.getBoundingClientRect();
    changeHsb({
      hue: hsbRef.current.hue,
      saturation: clampToRange(0, (event.clientX - bounds.left) / bounds.width, 1),
      brightness: clampToRange(0, 1 - (event.clientY - bounds.top) / bounds.height, 1),
    });
  };
  let commitHexTyped = () => {
    let value = hexTyped === null ? null : normalizeHexColor(hexTyped);
    if (value === null) return;
    changeHsb(hexToHsb(value, hsbRef.current.hue));
    isChangeUnsent.current = false;
    onChosen({
      kind: 'rgb',
      hex: value,
    });
  };
  let notePointerDown = (input?: Dynamic) => {
    if (input.button === 0) setPointersDown((input2?: Dynamic) => [...input2, input.pointerId]);
  };
  React.useEffect(() => {
    let value = rootRef.current?.ownerDocument.defaultView ?? null;
    if (!isPointerDown || value === null) return;
    let value2 = (input?: Dynamic) => {
      if (input.type === 'pointermove' && input.buttons !== 0) return;
      let { pointerId: value3 } = input;
      setPointersDown(
        (input2?: Dynamic) => (input2.includes(value3) ? input2.filter((input3?: Dynamic) => input3 !== value3) : input2),
      );
    };
    let items = ['pointerup', 'pointercancel', 'pointermove'];
    for (let value3 of items as Dynamic) value.addEventListener(value3, value2);
    return () => {
      for (let value3 of items as Dynamic) value.removeEventListener(value3, value2);
    };
  }, [isPointerDown]);
  let onRangeKeyDown = (event?: Dynamic) => {
    stopKeyUnlessTabOrEscape(event);
    if (/^(Arrow|Page|Home|End)/.test(event.key)) setSampleShown(true);
    if (event.key !== 'Escape' || !isSampleShown || isPointerDown || isChangeUnsent.current) return;
    event.preventDefault();
    event.stopPropagation();
    setSampleShown(false);
  };
  let squareStyle = {
    '--sheet-hue-of-square': `hsl(${String(hsb.hue)} 100% 50%)`,
  };
  return jsxs('div', {
    ref: rootRef,
    className: 'sheet-custom-color',
    onFocus: ({ target: target }: Dynamic) => setSampleShown(target.matches('input[type=range]:focus-visible')),
    onBlur: (event?: Dynamic) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setSampleShown(false);
    },
    children: [
      jsxs('div', {
        className: 'sheet-color-square',
        style: squareStyle,
        onPointerDown: (event?: Dynamic) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          notePointerDown(event);
          moveOnSquare(event);
        },
        onPointerMove: moveOnSquare,
        onPointerUp: (input?: Dynamic) => {
          moveOnSquare(input);
          sendChange();
        },
        onPointerCancel: sendChange,
        children: [
          jsx('span', {
            'aria-hidden': true,
            className: 'sheet-color-handle',
            style: {
              left: `${String(hsb.saturation * 100)}%`,
              top: `${String((1 - hsb.brightness) * 100)}%`,
              backgroundColor: hex,
            },
          }),
          ['saturation', 'brightness'].map(
            (input?: Dynamic) =>
              jsx(
                'input',
                {
                  type: 'range',
                  className: 'sr-only',
                  'aria-label': sheetMessages[input](),
                  min: 0,
                  max: 100,
                  value: Math.round(hsb[input] * 100),
                  onChange: (input2?: Dynamic) =>
                    changeHsb({
                      ...hsbRef.current,
                      [input]: Number(input2.target.value) / 100,
                    }),
                  onKeyDown: onRangeKeyDown,
                  onKeyUp: sendChange,
                },
                input,
              ),
          ),
        ],
      }),
      jsx('input', {
        type: 'range',
        className: 'sheet-hue-slider',
        'aria-label': sheetMessages.hue(),
        min: 0,
        max: 359,
        value: Math.round(hsb.hue),
        onChange: (input?: Dynamic) =>
          changeHsb({
            ...hsbRef.current,
            hue: Number(input.target.value),
          }),
        onKeyDown: onRangeKeyDown,
        onKeyUp: sendChange,
        onPointerDown: notePointerDown,
        onPointerUp: sendChange,
      }),
      jsx(TextInput, {
        size: 'sm',
        'aria-label': sheetMessages.hex(),
        'aria-invalid': hexTyped !== null && normalizeHexColor(hexTyped) === null,
        spellCheck: false,
        autoComplete: 'off',
        autoCapitalize: 'off',
        autoCorrect: 'off',
        value: hexTyped ?? hex.toUpperCase(),
        onChange: (input?: Dynamic) => setHexTyped(input.target.value),
        onBlur: () => setHexTyped(null),
        onKeyDown: (input?: Dynamic) => {
          stopKeyUnlessTabOrEscape(input);
          if (input.key === 'Enter') commitHexTyped();
        },
      }),
      jsx(Tooltip, {
        anchor: () => rootRef.current?.closest('[role=dialog]') ?? rootRef.current,
        open: isPointerDown || isSampleShown,
        side: 'right',
        align: 'start',
        sideOffset: 8,
        className: 'p-xs',
        content: jsx(ColorSamplePreview, {
          sample: sample,
          color: color,
        }),
      }),
    ],
  });
}
export const clampToRange = (value?: Dynamic, min?: Dynamic, max?: Dynamic) => Math.min(max, Math.max(value, min));
