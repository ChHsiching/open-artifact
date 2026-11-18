import * as React from 'react';

/** Each nested overlay stacks one band above the overlay it opened from. */
export const LAYER_BAND_SIZE = 100;
/** The band that page-wide overlays, such as toasts, start from. */
export const GLOBAL_LAYER_BASE = 9000;

export const OVERLAY_LAYER_OFFSETS = {
  modal: 40,
  tooltip: 30,
  contextmenu: 30,
  popover: 20,
  menu: 20,
  combobox: 20,
  coachmark: 10,
} as const;

export type OverlayKind = keyof typeof OVERLAY_LAYER_OFFSETS;

export const LayerBaseContext = React.createContext<number>(0);

export type LayerStyle = React.CSSProperties & { '--ui-layer-base': number };

export interface OverlayLayer {
  /** The band the overlay's own children stack from. */
  base: number;
  style: LayerStyle;
}

/** The stacking of an overlay of `kind` opened from inside the current band. */
export function useOverlayLayer(kind: OverlayKind): OverlayLayer {
  const outer = React.useContext(LayerBaseContext);
  const base = outer + LAYER_BAND_SIZE;
  return { base, style: { zIndex: base + OVERLAY_LAYER_OFFSETS[kind], '--ui-layer-base': base } };
}

export function LayerBaseProvider({ base, children }: { base: number; children?: React.ReactNode }): React.ReactElement {
  return <LayerBaseContext.Provider value={base}>{children}</LayerBaseContext.Provider>;
}

/** Marks a menu, popover or dialog popup, so page code can find and close the open ones. */
export const OVERLAY_ATTRIBUTE = 'data-ui-overlay';
