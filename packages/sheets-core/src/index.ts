/** The Sheets type's model: the page and server protocol, and the agent's vocabulary over a workbook. */

export * from './protocol.ts';
export * from './agent/index.ts';
// The engine's requests and answers, as types only. Where the agent's vocabulary has a type of the same name, the
// agent's is the one exported by that name and the engine's has the `Engine` prefix.
export type * from './engine/index.ts';
export type { CellTable, ChartDescription, Placement, RecordedEdit, Run, SheetContents, WorkbookContents } from './agent/index.ts';
export type {
  CellTable as EngineCellTable,
  ChartDescription as EngineChartDescription,
  Placement as EnginePlacement,
  RecordedEdit as EngineRecordedEdit,
  Run as EngineRun,
  SheetContents as EngineSheetContents,
  WorkbookContents as EngineWorkbookContents,
} from './engine/index.ts';
