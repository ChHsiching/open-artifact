/** What the picture tools have open: crop mode and the alt text dialog. */
import { create } from 'zustand';
import type { CropRect } from './geometry.ts';

/** The picture a tool works on: its tab, where it is, and its bytes (to tell it is still the same picture). */
export interface ImageTarget {
  tab: string;
  pos: number;
  blob: unknown;
}

export interface CropSession extends ImageTarget {
  /** The whole picture's URL and pixel size. */
  src: string;
  natural: { w: number; h: number };
  /** The whole picture's box while cropping, against the page. */
  frame: { left: number; top: number; width: number; height: number };
  /** The crop when crop mode began. */
  entry: CropRect;
  /** The crop being set. */
  rect: CropRect;
}

interface ImagesState {
  crop: CropSession | null;
  alt: (ImageTarget & { text: string }) | null;
}

export const useImages = create<ImagesState>(() => ({ crop: null, alt: null }));
export const setImages = useImages.setState;
export const getImages = useImages.getState;
