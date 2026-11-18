import type { Dynamic } from '../../dynamic.ts';
import { isPromptDataTooLong } from '../../agent/prompt-text.ts';
import {
  withConditionalFormatsPane,
  isCardFarFromSelection,
  cellRangeKey,
  cellsToAskAgentAbout,
  cornerCellIdsOf,
  tableColumnsInAbout,
} from './pane-state.ts';
import { readsAsStored } from '../../model/workbook.ts';
import { splitConditionalFormatBrief, MAX_PICKED_TEXT_LENGTH, MAX_PICKED_CELLS_LISTED, suggestConditionalFormatsPrompt } from './agent-prompts.ts';
import { areasOfRuleRanges } from './descriptions.ts';
import { cellValueOf } from '../../model/cell-values.ts';
import { rowNumberAsStored } from '../../model/a1-references.ts';
import { ownRowOrderOfSheet } from '../../model/line-ids.ts';
import { conditionalRulesOfPane } from '../../state/queries.ts';
import { withNoEffects } from '../../state/transitions.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
import type { PageState } from '../../state/initial-state.ts';
export function askAgentAboutRules(state: PageState, pane?: Dynamic, ask?: Dynamic) {
  let mayRetry = ask.about !== 'moreSuggestions' && ask.attempt < MOST_AGENT_ATTEMPTS;
  if (isPromptDataTooLong(ask.asked, mayRetry ? ROOM_KEPT_FOR_RETRY : 0)) return agentAskFailed(state, pane, ask.about);
  let askId = state.conditionalFormatsAskCount + 1;
  return {
    state: {
      ...withConditionalFormatsPane(state, {
        ...pane,
        agent: {
          ...ask,
          kind: 'isAsked',
          askId: askId,
        },
      }),
      conditionalFormatsAskCount: askId,
    },
    effects: [
      {
        kind: 'askAgentAboutConditionalFormats',
        askId: askId,
        asked: ask.asked,
      },
    ],
  };
}
export function lineRunsOfSheet(reads: WorkbookReads, sheetId?: Dynamic) {
  let lines = readsAsStored(reads).linesOf(sheetId);
  if (lines === null) return null;
  let [rowRuns, columnRuns] = [lines.rows, lines.columns].map(
    (line?: Dynamic) =>
      line.runsIn({
        firstIndex: 0,
        count: line.count,
      }),
  );
  return rowRuns === undefined || columnRuns === undefined
    ? null
    : {
        rows: rowRuns,
        columns: columnRuns,
      };
}
export function rulesBriefForAgent(reads: WorkbookReads, cell?: Dynamic, area?: Dynamic) {
  let asTold = reads.conditionalFormatsAsAgentIsTold(cell, area);
  let told = asTold === null ? null : splitConditionalFormatBrief(asTold);
  let linesAsTold = lineRunsOfSheet(reads, cell.sheetId);
  return told === null || linesAsTold === null
    ? null
    : {
        told: told,
        linesAsTold: linesAsTold,
      };
}
export function agentSuggestionsStatus(pane?: Dynamic) {
  let { agent: agent, forSelection: forSelection, fromAgent: fromAgent } = pane;
  if (pane.editor !== null || isCardFarFromSelection(pane)) return null;
  let isAboutMore = 'about' in agent && agent.about === 'moreSuggestions';
  if (agent.kind === 'isAsked' && isAboutMore) return 'isLookedFor';
  if (canAskAgentForSuggestions(pane)) return isAboutMore ? 'couldNotBeLookedFor' : 'canBeAskedFor';
  return forSelection !== null &&
    fromAgent[cellRangeKey(cellsToAskAgentAbout(forSelection))] !== undefined &&
    !pane.shown.suggestions.some(({ isFromAgent: isFromAgent }: Dynamic) => isFromAgent)
    ? 'isNone'
    : null;
}
export function selectedCellsForAgent(reads: WorkbookReads, sheetId: Dynamic, { about: about, table: table }: Dynamic) {
  let [aboutArea] = areasOfRuleRanges(reads, sheetId, [about]);
  let [recordsArea] = areasOfRuleRanges(reads, sheetId, [table.records]);
  if (aboutArea === undefined || recordsArea === undefined) return null;
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = aboutArea;
  if (topRowIndex <= recordsArea.topRowIndex && topRowIndex + rowCount >= recordsArea.topRowIndex + recordsArea.rowCount) return null;
  let shownAt = (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
    let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
    let shown = cellId === null ? null : cellValueOf(reads.cellOnShowIn(cellId));
    return shown?.value === '' ? null : shown;
  };
  let holdAt = (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
    let shown = shownAt(rowIndex, columnIndex);
    if (shown === null || shown.kind === 'error') return null;
    return shown.kind === 'text' ? shown.value.slice(0, MAX_PICKED_TEXT_LENGTH) : shown.value;
  };
  let labelOfRow = (rowIndex?: Dynamic) => {
    for (let columnIndex: Dynamic = 0; columnIndex < leftColumnIndex; columnIndex += 1) {
      let hold = holdAt(rowIndex, columnIndex);
      if (typeof hold === 'string') return hold;
    }
    return null;
  };
  let columnIndexes = Array.from<Dynamic, Dynamic>(
    {
      length: columnCount,
    },
    (input?: Dynamic, offset?: Dynamic) => leftColumnIndex + offset,
  );
  return {
    form: columnCount === 1 ? 'partOfAColumn' : rowCount === 1 ? 'oneRowAcross' : 'block',
    rowCount: rowCount,
    columnCount: columnCount,
    rows:
      rowCount * columnCount > MAX_PICKED_CELLS_LISTED
        ? null
        : Array.from<Dynamic, Dynamic>(
            {
              length: rowCount,
            },
            (input?: Dynamic, offset?: Dynamic) => topRowIndex + offset,
          )
            .filter((rowIndex?: Dynamic) => columnIndexes.some((columnIndex?: Dynamic) => shownAt(rowIndex, columnIndex) !== null))
            .map(
              (rowIndex?: Dynamic) => ({
                row: rowNumberAsStored(rowIndex, ownRowOrderOfSheet(reads, sheetId)),
                label: labelOfRow(rowIndex),
                holds: columnIndexes.map((columnIndex?: Dynamic) => holdAt(rowIndex, columnIndex)),
              }),
            ),
  };
}
export function askAgentForMoreSuggestions(state: PageState, reads: WorkbookReads) {
  let pane = conditionalRulesOfPane(state);
  if (pane === null || pane.forSelection === null || !canAskAgentForSuggestions(pane)) return withNoEffects(state);
  let forCells = cellsToAskAgentAbout(pane.forSelection);
  let brief = (rulesBriefForAgent as Dynamic)(reads, ...cornerCellIdsOf(pane.sheetId, forCells));
  if (brief === null) return agentAskFailed(state, pane, 'moreSuggestions');
  let { told: told, linesAsTold: linesAsTold } = brief;
  let shownRules = reads.conditionalFormatsByAddress(
    pane.sheetId,
    pane.shown.suggestions.flatMap(({ rules: rules, isFromAgent: isFromAgent }: Dynamic) => (isFromAgent ? [] : rules)),
  );
  let promptFor = (cells?: Dynamic, withShownRules: Dynamic = true) =>
    suggestConditionalFormatsPrompt(told, withShownRules ? (shownRules ?? []).flatMap((rule?: Dynamic) => rule ?? []) : [], cells);
  let selectedCells = selectedCellsForAgent(reads, pane.sheetId, {
    about: forCells,
    table: pane.forSelection.table,
  });
  let asked =
    [
      ...(selectedCells === null
        ? []
        : [
            selectedCells,
            {
              ...selectedCells,
              rows: null,
            },
          ]),
      null,
    ]
      .flatMap((cells?: Dynamic) => [promptFor(cells), promptFor(cells, false)])
      .find((prompt?: Dynamic) => !isPromptDataTooLong(prompt)) ?? promptFor(null, false);
  return askAgentAboutRules(state, pane, {
    about: 'moreSuggestions',
    forCells: forCells,
    areWholeColumns: selectedCells === null,
    asked: asked,
    attempt: 1,
    linesAsTold: linesAsTold,
  });
}
export const MOST_RULE_WORDS_FOR_AGENT = 2000;
export const MOST_AGENT_ATTEMPTS = 2;
export const ROOM_KEPT_FOR_RETRY = 4096;
export const agentAskFailed = (state?: Dynamic, pane?: Dynamic, about?: Dynamic) => ({
  state: withConditionalFormatsPane(state, {
    ...pane,
    agent: {
      kind: 'hasFailed',
      about: about,
      isBeyondRules: false,
    },
  }),
  effects:
    pane.agent.kind === 'isAsked'
      ? [
          {
            kind: 'stopAskingAgentAboutConditionalFormats',
          },
        ]
      : [],
});
export const isAgentFreeForRules = ({ agent: agent }: Dynamic) => agent.kind === 'isIdle' || agent.kind === 'hasFailed';
export const canAskAgentForSuggestions = (pane?: Dynamic) =>
  pane.editor === null &&
  pane.offer === null &&
  pane.forSelection !== null &&
  isAgentFreeForRules(pane) &&
  tableColumnsInAbout({
    about: cellsToAskAgentAbout(pane.forSelection),
    table: pane.forSelection.table,
  }).some(({ filled: filled }: Dynamic) => filled > 0) &&
  pane.fromAgent[cellRangeKey(cellsToAskAgentAbout(pane.forSelection))] === undefined;
