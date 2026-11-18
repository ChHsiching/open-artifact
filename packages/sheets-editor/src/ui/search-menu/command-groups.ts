import type { Dynamic } from '../../dynamic.ts';
import { commandsNameableFromWords, MAX_COMMANDS_NAMED } from '../commands-from-words.ts';
import { toolLabelWithValue } from '../../tools/search-words.ts';
import { sortMenuLabel, sortRangeLabel, sortSheetLabel } from '../../i18n/grid-action-labels.ts';
import { commandActsOnCells } from './matching.ts';
import { translateMessage } from '../../i18n/messages.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { CONDITIONAL_FORMATTING_WORDS } from '../../messages/conditional-format.ts';
import { autocompleteFunctionsHeading } from '../../messages/formula-autocomplete.ts';
import { sheetWord } from '../../messages/sheet-command-words.ts';
import { goToLabel } from '../go-to-commands.ts';
import { customSortMessages } from '../../tables/sort-filter-labels.ts';
export function commandHint({ actsOn: actsOn, home: home, cost: cost }: Dynamic, { activeCell: activeCell, cellCount: cellCount }: Dynamic) {
  let costHint = cost === undefined ? null : commandCostHint(cost);
  if (costHint !== null) return costHint;
  if (actsOn === 'activeCell') return activeCell !== null && cellCount > 1 ? inCellHint(activeCell) : null;
  return actsOn === 'opens' && home !== undefined ? (COMMAND_HOME_HINTS[home]?.() ?? null) : null;
}
export function commandsNamedByAgent(commands?: Dynamic, namedIds?: Dynamic) {
  let offeredIds = new (Set as Dynamic)(
    commandsNameableFromWords(commandsOfferedToAgent(commands), 'all').map(({ id: id }: Dynamic) => id),
  );
  let commandById = new (Map as Dynamic)(commands.map((input?: Dynamic) => [input.id, input]));
  return [...new (Set as Dynamic)(namedIds.filter((input?: Dynamic) => typeof input === 'string' && offeredIds.has(input)))]
    .flatMap((input?: Dynamic) => commandById.get(String(input)) ?? [])
    .slice(0, MAX_COMMANDS_NAMED);
}
export function labelWithoutHeading(heading?: Dynamic, label?: Dynamic) {
  let [before = '', after = ''] = toolLabelWithValue(heading, '\x00').split('\x00');
  return label.length > before.length + after.length && label.startsWith(before) && label.endsWith(after)
    ? label.slice(before.length, label.length - after.length)
    : label;
}
export function headingOfCommand(input?: Dynamic) {
  if (input.id === SORT_AND_FILTER_COMMAND_ID) return null;
  if (isSortCommandUnderHeading(input)) return sortMenuLabel();
  return HEADINGS_BY_COMMAND_PREFIX.find(([input2]: Dynamic) => input.id.startsWith(input2))?.[1]() ?? null;
}
export function groupFoundCommands(commands?: Dynamic) {
  let headingsOfCellCommands = new (Set as Dynamic)(commands.filter(commandActsOnCells).map(headingOfCommand));
  let isOpenerUnderHeading = (input?: Dynamic) => isToolOpenerCommand(input) && headingsOfCellCommands.has(headingOfCommand(input));
  let isGroupedByHeading = (input?: Dynamic) =>
    commandActsOnCells(input) || UNDO_REDO_COMMAND_IDS.has(input.id) || isOpenerUnderHeading(input);
  let headedCommands = commands
    .filter(isGroupedByHeading)
    .map((input?: Dynamic) => (isOpenerUnderHeading(input) ? withoutHome(input) : input));
  let otherCommands = commands.filter((input?: Dynamic) => !isGroupedByHeading(input));
  let groupIndexOf = (input?: Dynamic) => COMMAND_GROUPS.findIndex(({ holds: holds }: Dynamic) => holds(input));
  let loneHeadingIds = new (Set as Dynamic)(
    groupByHeading(new (Map as Dynamic)(), headedCommands).flatMap(
      ({ heading: heading, commands: [first, ...rest] }: Dynamic) =>
        first !== undefined && rest.length === 0 && first.label === heading ? [first.id] : [],
    ),
  );
  let groups = [
    ...groupByHeading(new (Map as Dynamic)(), headedCommands, ({ id: id }: Dynamic) => loneHeadingIds.has(id)).map(
      ({ heading: heading, commands: commands2 }: Dynamic) => ({
        heading: heading,
        commands: commands2,
        isOfWhatOpens: false,
      }),
    ),
    ...COMMAND_GROUPS.map(
      ({ heading: heading, toolInNames: toolInNames, isOfWhatOpens = false }: Dynamic, groupIndex?: Dynamic) => ({
        heading: heading(),
        commands: otherCommands
          .filter((input?: Dynamic) => groupIndexOf(input) === groupIndex)
          .map((input?: Dynamic) => (toolInNames === undefined ? input : commandUnderHeading(toolInNames(), input))),
        isOfWhatOpens: isOfWhatOpens,
      }),
    ).filter(({ commands: commands2 }: Dynamic) => commands2.length > 0),
  ];
  let firstEnabledId = commands.find(({ whyNot: whyNot }: Dynamic) => whyNot === null)?.id;
  let holdsFirstEnabled = ({ commands: commands2 }: Dynamic) =>
    commands2.some(({ id: id }: Dynamic) => id === firstEnabledId);
  return [...groups.filter(holdsFirstEnabled), ...groups.filter((input?: Dynamic) => !holdsFirstEnabled(input))];
}
export function groupByHeading(groups?: Dynamic, commands?: Dynamic, keepsOwnLabel: Dynamic = () => false) {
  for (let command of commands as Dynamic) {
    let heading = keepsOwnLabel(command) ? null : headingOfCommand(command);
    let headed = heading === null ? command : commandUnderHeading(heading, command);
    groups.set(heading, [...(groups.get(heading) ?? []), headed]);
  }
  return [...groups]
    .filter(([, items]: Dynamic) => items.length > 0)
    .map(
      ([input, input2]: Dynamic) => ({
        heading: input,
        commands: input2,
      }),
    );
}
export const commandGroupMessages = {
  thisSheet: () =>
    translateMessage({
      defaultMessage: 'This sheet',
      id: 'Esonrjqh1K',
    }),
  sheets: () =>
    translateMessage({
      defaultMessage: 'Sheets',
      id: 'qHbcJVDB59',
    }),
  view: () =>
    translateMessage({
      defaultMessage: 'View',
      id: '0WRgxnjr2b',
    }),
  wholeFile: () =>
    translateMessage({
      defaultMessage: 'Whole file',
      id: 'NaYA7Xpb3p',
    }),
  open: () =>
    translateMessage({
      defaultMessage: 'Open',
      id: 'Wpz0k1hhsP',
    }),
  toolbar: () =>
    translateMessage({
      defaultMessage: 'Toolbar',
      id: '/4MG3sCGjO',
    }),
  topBar: () =>
    translateMessage({
      defaultMessage: 'Top bar',
      id: 'ceQFUv3E7s',
    }),
  sheetTab: () =>
    translateMessage({
      defaultMessage: 'Sheet tab',
      id: '7O+NbnXoVR',
    }),
  enterAgainToConfirm: () =>
    translateMessage({
      defaultMessage: 'Enter again to confirm',
      id: '5ecYuw0syO',
    }),
};
export const inCellHint = (cell?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'In {cell}',
      id: 'qMHePZOkA+',
    },
    {
      cell: cell,
    },
  );
export const commandCostHint = (cost?: Dynamic) => {
  switch (cost.kind) {
    case 'replaces':
      return translateMessage(
        {
          defaultMessage: '{count, plural, one {Replaces # formula} other {Replaces # formulas}}',
          id: 'RVaZdrVNey',
        },
        {
          count: cost.count,
        },
      );
    case 'clears':
      return translateMessage(
        {
          defaultMessage: '{count, plural, one {Clears # cell} other {Clears # cells}}',
          id: '8MFmFXRzo1',
        },
        {
          count: cost.count,
        },
      );
    case 'becomesText':
      return null;
  }
};
export const COMMAND_HOME_HINTS = {
  toolbar: commandGroupMessages.toolbar,
  topBar: commandGroupMessages.topBar,
  sheetTab: commandGroupMessages.sheetTab,
  pane: null,
};
export const commandsOfferedToAgent = (commands?: Dynamic) =>
  commands
    .filter(({ whyNot: whyNot, isWeighty: isWeighty }: Dynamic) => whyNot === null && isWeighty !== true)
    .map(
      ({ id: id, label: label }: Dynamic) => ({
        id: id,
        label: label,
      }),
    );
export const HEADINGS_BY_COMMAND_PREFIX = [
  ['bar.borders', sheetMessages.borders],
  ['bar.fillColor', sheetMessages.cellColor],
  ['bar.textColor', sheetMessages.textColor],
  ['bar.numberFormat', sheetMessages.numberFormat],
  ['bar.fewerDecimalPlaces', sheetMessages.numberFormat],
  ['bar.moreDecimalPlaces', sheetMessages.numberFormat],
  ['bar.alignVertically', sheetMessages.alignVertically],
  ['bar.align', sheetMessages.align],
  ['bar.fontSize', sheetMessages.fontSize],
  ['bar.insert.', sheetMessages.insert],
  ['bar.sum.', sheetMessages.calculations],
  ['menu.freeze.', sheetMessages.freeze],
  ['menu.sortRange', sortRangeLabel],
  ['menu.customSort.range', sortRangeLabel],
  ['menu.sort', sortSheetLabel],
  ['menu.customSort.sheet', sortSheetLabel],
  ['menu.conditionalFormatting', CONDITIONAL_FORMATTING_WORDS.conditionalFormatting],
  ['bar.conditionalFormatting', CONDITIONAL_FORMATTING_WORDS.conditionalFormatting],
  ['rules.suggested.', CONDITIONAL_FORMATTING_WORDS.conditionalFormatting],
  ['rules.create', CONDITIONAL_FORMATTING_WORDS.conditionalFormatting],
  ['rules.show', CONDITIONAL_FORMATTING_WORDS.conditionalFormatting],
  ['menu.bold', sheetMessages.formatting],
  ['menu.italic', sheetMessages.formatting],
  ['menu.underline', sheetMessages.formatting],
  ['menu.strikethrough', sheetMessages.formatting],
  ['bar.bold', sheetMessages.formatting],
  ['bar.italic', sheetMessages.formatting],
  ['bar.underline', sheetMessages.formatting],
  ['bar.strikethrough', sheetMessages.formatting],
  ['bar.wrapText', sheetMessages.formatting],
  ['function.', autocompleteFunctionsHeading],
];
export const commandUnderHeading = (heading?: Dynamic, command?: Dynamic) => ({
  ...command,
  label: labelWithoutHeading(heading, command.label),
});
export const UNDO_REDO_COMMAND_IDS = new (Set as Dynamic)(['view.undo', 'view.redo']);
export const SHEETS_COMMAND_PREFIXES = ['sheet.add.', 'sheet.tab.', 'sheet.allSheets'];
export const isSheetsCommand = ({ id: id }: Dynamic) =>
  SHEETS_COMMAND_PREFIXES.some((input?: Dynamic) => id.startsWith(input));
export const COMMAND_GROUPS = [
  {
    heading: commandGroupMessages.thisSheet,
    holds: (input?: Dynamic) => input.actsOn === 'sheet' && !isSheetsCommand(input),
  },
  {
    heading: commandGroupMessages.sheets,
    holds: isSheetsCommand,
    toolInNames: sheetWord,
  },
  {
    heading: goToLabel,
    holds: ({ actsOn: actsOn }: Dynamic) => actsOn === 'goesTo',
    toolInNames: goToLabel,
  },
  {
    heading: commandGroupMessages.view,
    holds: ({ actsOn: actsOn }: Dynamic) => actsOn === 'view',
  },
  {
    heading: commandGroupMessages.wholeFile,
    holds: ({ actsOn: actsOn }: Dynamic) => actsOn === 'file',
  },
  {
    heading: commandGroupMessages.open,
    holds: ({ actsOn: actsOn }: Dynamic) => actsOn === 'opens' || actsOn === 'handsOver',
    isOfWhatOpens: true,
  },
];
export const isSortCommandUnderHeading = ({ id: id, label: label }: Dynamic) =>
  (id.startsWith('menu.sort') && labelWithoutHeading(sortMenuLabel(), label) !== label) ||
  (id === 'menu.customSort.range' && label === customSortMessages.customSort());
export const SORT_AND_FILTER_COMMAND_ID = 'menu.sortAndFilter';
export const isToolOpenerCommand = ({ actsOn: actsOn, id: id }: Dynamic) =>
  actsOn === 'opens' && HEADINGS_BY_COMMAND_PREFIX.some(([input]: Dynamic) => input === id);
export const withoutHome = ({ home: home, ...input }: Dynamic) => input;
export const commandsUnderHeading = (heading?: Dynamic, commands?: Dynamic) =>
  commands.length === 0
    ? []
    : [
        {
          heading: heading,
          commands: commands.map((input?: Dynamic) => commandUnderHeading(heading, input)),
        },
      ];
export const groupCommandsByHeading = (input?: Dynamic) => groupByHeading(new (Map as Dynamic)([[null, []]]), input);
