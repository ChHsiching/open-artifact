import { create } from 'zustand';

/** A cell of a source's result, picked by pointing at a mark on the page. */
export interface SourcePick {
  id: string;
  /** Row index in the source's rows, when the mark names one row. */
  row?: number;
  /** Column, when the mark names one. */
  field?: string;
  /** The values of the mark's `data-where`, which name the row. */
  where?: string[];
  /** The text the mark shows, and whether the page may show the value scaled. */
  shown?: string;
  scaled?: boolean;
}

export interface SourcesUiState {
  /** The Sources panel is open. */
  open: boolean;
  /** The source shown in detail (`null`: the list). */
  selected: string | null;
  /** The cell to highlight in the selected source's result. */
  pick: SourcePick | null;
  /** The pointer picks marks on the page (the eyedropper) instead of using them. */
  pointing: boolean;
  /** The mark under the pointer while pointing, for its hint. */
  hovered: SourcePick | null;
}

export const useSourcesUi = create<SourcesUiState>(() => ({
  open: false,
  selected: null,
  pick: null,
  pointing: false,
  hovered: null,
}));

export function openSources(selected: string | null = null): void {
  useSourcesUi.setState({ open: true, selected, pick: selected === null ? null : { id: selected } });
}

export function closeSources(): void {
  useSourcesUi.setState({ open: false, pointing: false, hovered: null });
}

/** Opens the Sources panel on the source a mark names, with its cell highlighted. */
export function pickSource(pick: SourcePick): void {
  useSourcesUi.setState({ open: true, selected: pick.id, pick, hovered: null });
}

export function setPointing(pointing: boolean): void {
  useSourcesUi.setState({ pointing, hovered: null });
}

export function setHoveredMark(hovered: SourcePick | null): void {
  useSourcesUi.setState({ hovered });
}
