import { DropZone, useDropZone } from '../kit/drop-zone.tsx';
import { useUiWindow } from '../kit/theme.tsx';
import { GLOBAL_LAYER_BASE } from '../kit/layers.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { isModalOpen } from '../ui/find.ts';
export function useIsDraggingInPage() {
  let [isDraggingInPage, setDraggingInPage] = React.useState(false);
  let pageWindow = useUiWindow();
  React.useEffect(() => {
    if (pageWindow === undefined) return;
    let controller = new (AbortController as Dynamic)();
    let listenerOptions = {
      capture: true,
      signal: controller.signal,
    };
    pageWindow.addEventListener('dragstart', () => setDraggingInPage(true), listenerOptions);
    for (let eventType of ['dragend', 'drop', 'pointerdown'] as Dynamic)
      pageWindow.addEventListener(eventType, () => setDraggingInPage(false), listenerOptions);
    return () => controller.abort();
  }, [pageWindow]);
  return isDraggingInPage;
}
export function PageFileDrop({ isTaken: isTaken, wayInByKeyboard: wayInByKeyboard, onDropped: onDropped }: Dynamic) {
  let isDraggingInPage = useIsDraggingInPage();
  let { dragState: dragState } = useDropZone({
    scope: 'page',
    disabled: !isTaken || isDraggingInPage,
    pickerPath: {
      mode: 'external',
      control: wayInByKeyboard,
    },
    onFiles: ({ accepted: [file], notices: notices }: Dynamic) => {
      let isFolder = notices.some(({ code: code }: Dynamic) => code === 'folder-not-allowed');
      onDropped(file ?? (isFolder ? 'folder' : 'notRead'));
    },
  });
  return jsx('div', {
    className: 'pointer-events-none fixed inset-0',
    style: {
      zIndex: GLOBAL_LAYER_BASE,
    },
    children: jsx(DropZone.Overlay, {
      dragState: dragState,
    }),
  });
}
export const isExcelFileName = ({ name: name }: Dynamic) => /\.(?:xlsx|xlsm|xls)$/i.test(name);
export const canTakeDroppedFile = (state?: Dynamic) =>
  state.viewOnlyBecause === null && !isModalOpen(state) && state.menu === null && state.ownFilterList === null && !state.isUnfinishedFormulaOpen;
