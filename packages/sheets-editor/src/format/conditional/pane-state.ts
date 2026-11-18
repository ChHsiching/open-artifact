import type { Dynamic } from '../../dynamic.ts';
import { withNoEffects } from '../../state/transitions.ts';
import { conditionalRulesOfPane } from '../../state/queries.ts';
import { closeSidePane } from '../../chips/dropdowns.ts';
import { isSameJsonValue } from '../../model/same-json.ts';
import { IF_QUEUED_DEFAULTS } from '../../model/edit-effects.ts';
import { withAddedTest } from './rule-edits.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function ruleOfConditionalFormat({ liveRanges: liveRanges, effect: effect }: Dynamic) {
  let [firstRange, ...otherRanges] = liveRanges;
  return firstRange === undefined
    ? null
    : {
        ranges: [firstRange, ...otherRanges],
        effect: effect,
      };
}
export function conditionalFormatRuleById(reads: WorkbookReads, sheetId?: Dynamic, conditionalFormatId?: Dynamic) {
  let conditionalFormat = reads
    .conditionalFormatsOf(sheetId)
    .find((format?: Dynamic) => format.conditionalFormatId === conditionalFormatId);
  return conditionalFormat === undefined ? null : ruleOfConditionalFormat(conditionalFormat);
}
export function conditionalFormatChangeEffect(
  sheetId?: Dynamic,
  conditionalFormatId?: Dynamic,
  oldRule?: Dynamic,
  newRule?: Dynamic,
  done: Dynamic = {
    what: 'ruleChanged',
  },
) {
  let [isSameRanges, isSameEffect] = [isSameRulesJson(newRule.ranges, oldRule.ranges), isSameRulesJson(newRule.effect, oldRule.effect)];
  if (isSameRanges && isSameEffect) return null;
  return queueRuleEditEffect(
    {
      kind: 'changeConditionalFormat',
      sheetId: sheetId,
      conditionalFormatId: conditionalFormatId,
      ...(isSameRanges
        ? {}
        : {
            ranges: newRule.ranges,
          }),
      ...(isSameEffect
        ? {}
        : {
            effect: newRule.effect,
          }),
    },
    done,
  );
}
export function stepBackInRulesPane(state: PageState, pane?: Dynamic) {
  if (pane.offer !== null)
    return withNoEffects(
      withConditionalFormatsPane(state, {
        ...pane,
        offer: null,
      }),
    );
  if (!isAskingAgentForRules(pane)) return withNoEffects(state);
  return {
    state: {
      ...withConditionalFormatsPane(state, {
        ...pane,
        agent: {
          kind: 'isIdle',
        },
      }),
      lastDone: {
        what: 'agentStopped',
      },
    },
    effects: [
      {
        kind: 'stopAskingAgentAboutConditionalFormats',
      },
    ],
  };
}
export function clearChosenTestBeingAdded(state: PageState) {
  let pane = conditionalRulesOfPane(state);
  let editor = pane?.editor ?? null;
  return pane === null || editor === null || (editor.testBeingAdded?.condition ?? null) === null
    ? state
    : withConditionalFormatsPane(state, {
        ...pane,
        editor: {
          ...editor,
          testBeingAdded: null,
        },
      });
}
export function dropUnfinishedTestBeingAdded(state: PageState) {
  let pane = conditionalRulesOfPane(state);
  return pane?.editor?.testBeingAdded?.condition === null
    ? withNoEffects(
        withConditionalFormatsPane(state, {
          ...pane,
          editor: {
            ...pane.editor,
            testBeingAdded: null,
          },
        }),
      )
    : null;
}
export function rulesOfAgentKeptNow(state: PageState) {
  let rulesOfAgentKept = state.rulesOfAgentKept;
  return rulesOfAgentKept !== null && rulesOfAgentKept.sheetId === state.sheetId && rulesOfAgentKept.workbookChangeCount === state.workbookChangeCount
    ? rulesOfAgentKept
    : null;
}
export function withRulesOfAgentKept(state: PageState, pane?: Dynamic) {
  if (!isPlainRulesMenu(pane)) return pane;
  let kept = rulesOfAgentKeptNow(state);
  return {
    ...pane,
    fromAgent: kept?.byCells ?? {},
    agent: kept?.stillAsked ?? pane.agent,
  };
}
export function rulesOfAgentToKeep({ workbookChangeCount: workbookChangeCount }: Dynamic, pane?: Dynamic) {
  let isUnchanged = workbookChangeCount === pane.openedAtChangeCount;
  let isStillAsked = pane.agent.kind === 'isAsked' && isAskingAgentForMoreSuggestions(pane);
  return {
    sheetId: pane.sheetId,
    workbookChangeCount: workbookChangeCount,
    byCells: isUnchanged ? pane.fromAgent : {},
    stillAsked: isUnchanged && isStillAsked ? pane.agent : null,
  };
}
export function openConditionalFormatsAs(state: PageState, drawnAs?: Dynamic) {
  let pane = conditionalRulesOfPane(state);
  if (pane?.drawnAs === 'menu' && drawnAs === 'card') {
    let rulesKept = isPlainRulesMenu(pane) ? state.rulesOfAgentKept : rulesOfAgentToKeep(state, pane);
    return openConditionalFormatsAs(
      {
        ...closeSidePane(state),
        rulesOfAgentKept: rulesKept,
      },
      'card',
    );
  }
  if (pane !== null) return pane.drawnAs !== 'pane' && drawnAs === 'pane' ? showRulesInPane(state, pane) : closeSidePane(state);
  let kept = rulesOfAgentKeptNow(state);
  return withConditionalFormatsPane(
    {
      ...state,
      menu: null,
      dropdown: null,
    },
    {
      drawnAs: drawnAs,
      wordsOfMenu: null,
      sheetId: state.sheetId,
      openedAtChangeCount: state.workbookChangeCount,
      isAskedForRules: false,
      forSelection: null,
      fromAgent: kept?.byCells ?? {},
      ofAgentForSelection: null,
      agent: kept?.stillAsked ?? {
        kind: 'isIdle',
      },
      offer: null,
      pointedAt: null,
      inWords: null,
      editor: null,
      tried: [],
      previewed: null,
      shown: NOTHING_SHOWN_IN_RULES_PANE,
      ...(state.hasViewNoAgentForRules && {
        agent: {
          kind: 'isNotToBeHad',
        },
      }),
    },
  );
}
export function openConditionalFormatsPane(state: PageState) {
  let pane = conditionalRulesOfPane(state);
  if (pane === null) return openConditionalFormatsAs(state, 'pane');
  return pane.drawnAs !== 'pane'
    ? showRulesInPane(state, pane)
    : {
        ...state,
        menu: null,
        timesSidePaneAsked: state.timesSidePaneAsked + 1,
      };
}
export function tableColumnsInAbout({ about: about, table: { columns: columns } }: Dynamic) {
  let firstIndex = columns.findIndex(({ c: c }: Dynamic) => c === about.topLeft.c);
  let lastIndex = columns.findIndex(({ c: c }: Dynamic) => c === about.bottomRight.c);
  return firstIndex === -1 ? [] : columns.slice(firstIndex, lastIndex === -1 ? undefined : lastIndex + 1);
}
export const CONDITIONAL_FORMATTING_PRESS = 'Conditional formatting';
export const NOTHING_SHOWN_IN_RULES_PANE = {
  about: null,
  suggestions: [],
  offer: null,
  readAtOnce: null,
  rules: [],
  notWorkedOut: null,
  editor: null,
};
export const isSameRulesJson = isSameJsonValue;
export const whatRuleLooksFor = ({ effect: effect }: Dynamic) => (effect.kind === 'formatWhere' ? effect.allOf : effect.kind);
export const rangesAndLooksForOf = (rule?: Dynamic) => ({
  ranges: rule.ranges,
  looksFor: whatRuleLooksFor(rule),
});
export const areSameRulesIgnoringFormat = (rules?: Dynamic, otherRules?: Dynamic) =>
  isSameRulesJson(rules.map(rangesAndLooksForOf), otherRules.map(rangesAndLooksForOf));
export const cellRangeKey = ({ topLeft: topLeft, bottomRight: bottomRight }: Dynamic) => JSON.stringify([topLeft, bottomRight]);
export const queueRuleEditEffect = (edit?: Dynamic, done?: Dynamic, ifQueued: Dynamic = {}) => ({
  kind: 'queueEdit',
  edit: edit,
  ifQueued: {
    ...IF_QUEUED_DEFAULTS,
    select: null,
    done: done,
    leavesEntryOpen: true,
    ...ifQueued,
  },
});
export const withConditionalFormatsPane = (state?: Dynamic, pane?: Dynamic) => ({
  ...state,
  sidePane: {
    kind: 'conditionalFormats',
    rules: pane,
  },
});
export const isAskingAgentForMoreSuggestions = ({ agent: agent }: Dynamic) =>
  agent.kind === 'isAsked' && agent.about === 'moreSuggestions';
export const isAskingAgentForRules = ({ agent: agent }: Dynamic) => agent.kind === 'isAsked' && agent.about !== 'moreSuggestions';
export const isAgentOfferPendingOrAsked = (pane?: Dynamic) => pane.offer !== null || isAskingAgentForRules(pane);
export const ruleWithTestBeingAdded = (rule?: Dynamic, testBeingAdded?: Dynamic) =>
  rule.effect.kind === 'formatWhere' && testBeingAdded !== null && testBeingAdded.condition !== null
    ? {
        ...rule,
        effect: withAddedTest(rule.effect, {
          ...testBeingAdded,
          condition: testBeingAdded.condition,
        }),
      }
    : rule;
export const isPlainRulesMenu = (pane?: Dynamic) => pane?.drawnAs === 'menu' && pane.wordsOfMenu === null;
export const showRulesInPane = (state: PageState, pane?: Dynamic) =>
  withConditionalFormatsPane(
    {
      ...state,
      menu: null,
      timesSidePaneAsked: state.timesSidePaneAsked + 1,
    },
    {
      ...withRulesOfAgentKept(state, pane),
      drawnAs: 'pane',
      wordsOfMenu: null,
      inWords: null,
    },
  );
export const cornerCellIdsOf = (sheetId: Dynamic, { topLeft: topLeft, bottomRight: bottomRight }: Dynamic) => [
  {
    sheetId: sheetId,
    rowId: topLeft.r,
    columnId: topLeft.c,
  },
  {
    sheetId: sheetId,
    rowId: bottomRight.r,
    columnId: bottomRight.c,
  },
];
export const tableOfRuleRange = (reads: WorkbookReads, sheetId: Dynamic, { ranges: [firstRange] }: Dynamic) =>
  (reads.conditionalFormatSuggestions as Dynamic)(...cornerCellIdsOf(sheetId, firstRange))?.table ?? null;
export const isCardFarFromSelection = ({ drawnAs: drawnAs, forSelection: forSelection }: Dynamic) =>
  drawnAs === 'card' && forSelection?.isFarFromWhatIsSelected === true;
export const cellsToAskAgentAbout = ({ about: about, toAskAgentAbout = about }: Dynamic) => toAskAgentAbout;
