import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpNarrowWide,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  type LucideIcon,
  PanelLeft,
  PanelTop,
  TableCellsMerge,
  TableCellsSplit,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash2,
  UnfoldHorizontal,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { TableIcon } from './table-menu.ts';

const ICONS: Record<TableIcon, LucideIcon> = {
  rowAbove: BetweenHorizontalStart,
  rowBelow: BetweenHorizontalEnd,
  colLeft: BetweenVerticalStart,
  colRight: BetweenVerticalEnd,
  move: ArrowUpDown,
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
  width: UnfoldHorizontal,
  delete: Trash2,
  sortAsc: ArrowUpNarrowWide,
  sortDesc: ArrowDownWideNarrow,
  alignLeft: TextAlignStart,
  alignCenter: TextAlignCenter,
  alignRight: TextAlignEnd,
  merge: TableCellsMerge,
  split: TableCellsSplit,
  headerRow: PanelTop,
  headerColumn: PanelLeft,
};

export function TableIconView({ name }: { name: TableIcon }): ReactNode {
  const Icon = ICONS[name];
  return <Icon className="size-4" strokeWidth={1.75} />;
}
