import type { Dynamic } from '../dynamic.ts';
import { translateMessage, MESSAGE_LOCALE } from '../i18n/messages.ts';
import { refusalMessageKey } from '../model/refusals.ts';
export function importPlanSummary(plan?: Dynamic, sheetName?: Dynamic) {
  let { addedCount: addedCount, changedCount: changedCount, goneCount: goneCount } = plan;
  if (isImportChangeless(plan))
    return translateMessage(
      {
        defaultMessage: '{sheetName} already has all of these rows.',
        id: 'Zykp65BlLS',
      },
      {
        sheetName: sheetName,
      },
    );
  let currentRowCount = changedCount + plan.sameCount + goneCount;
  if (plan.isReplaced && currentRowCount > 0)
    return translateMessage(
      {
        defaultMessage:
          '{writtenCount, plural, one {# row will replace {currentRows} in {sheetName}.} other {{writtenCount, number} rows will replace {currentRows} in {sheetName}.}}',
        id: 'WOXybZ+Wic',
      },
      {
        writtenCount: addedCount + changedCount + plan.sameCount,
        currentRows: currentRowsWords(currentRowCount),
        sheetName: sheetName,
      },
    );
  if (changedCount === 0)
    return translateMessage(
      {
        defaultMessage: '{addedCount, plural, one {# row} other {{addedCount, number} rows}} will be added to {sheetName}.',
        id: 'QeyocxOjqi',
      },
      {
        addedCount: addedCount,
        sheetName: sheetName,
      },
    );
  if (addedCount === 0)
    return translateMessage(
      {
        defaultMessage: '{changedCount, plural, one {# row} other {{changedCount, number} rows}} will be updated in {sheetName}.',
        id: 'W8EMotcBE4',
      },
      {
        changedCount: changedCount,
        sheetName: sheetName,
      },
    );
  return translateMessage(
    {
      defaultMessage: '{updatedRows} will be updated and {addedRows} added in {sheetName}.',
      id: 'TDY8bLk6/N',
    },
    {
      updatedRows: importRowCountWords(changedCount),
      addedRows: importRowCountWords(addedCount),
      sheetName: sheetName,
    },
  );
}
export function importDoneWords({
  sheetName: sheetName,
  isReplaced: isReplaced,
  addedCount: addedCount,
  changedCount: changedCount,
  isSaved: isSaved,
}: Dynamic) {
  if (!isSaved)
    return translateMessage(
      {
        defaultMessage: 'Importing to {sheetName}…',
        id: '+VtCAxqtib',
      },
      {
        sheetName: sheetName,
      },
    );
  if (isReplaced)
    return translateMessage(
      {
        defaultMessage: 'Replaced the rows in {sheetName}',
        id: 'YfGi8uLiM/',
      },
      {
        sheetName: sheetName,
      },
    );
  if (changedCount === 0)
    return translateMessage(
      {
        defaultMessage: 'Added {addedCount, plural, one {# row} other {{addedCount, number} rows}} to {sheetName}',
        id: 'sh8j9Vt8uQ',
      },
      {
        addedCount: addedCount,
        sheetName: sheetName,
      },
    );
  if (addedCount === 0)
    return translateMessage(
      {
        defaultMessage: 'Updated {changedCount, plural, one {# row} other {{changedCount, number} rows}} in {sheetName}',
        id: 'fz9vWsInVJ',
      },
      {
        changedCount: changedCount,
        sheetName: sheetName,
      },
    );
  return translateMessage(
    {
      defaultMessage: 'Updated {updatedRows} and added {addedRows} in {sheetName}',
      id: 'voi3l3S4fx',
    },
    {
      updatedRows: importRowCountWords(changedCount),
      addedRows: importRowCountWords(addedCount),
      sheetName: sheetName,
    },
  );
}
export function moreRowsChangeWords(plan?: Dynamic) {
  let { addedCount: addedCount, changedCount: changedCount, sameCount: sameCount, goneCount: goneCount, isReplaced: isReplaced } = plan;
  let moreCount = addedCount + changedCount + (isReplaced ? sameCount : goneCount) - plan.rows.length;
  return moreCount <= 0
    ? null
    : translateMessage(
        {
          defaultMessage: '{moreCount, plural, one {# more row changes.} other {{moreCount, number} more rows change.}}',
          id: '7LbR+4lazF',
        },
        {
          moreCount: moreCount,
        },
      );
}
export function rowsStayWords(plan?: Dynamic) {
  let { sameCount: sameCount, untouchedCount: untouchedCount, isReplaced: isReplaced } = plan;
  let stayCount = isReplaced ? 0 : sameCount + untouchedCount;
  return stayCount <= 0
    ? null
    : translateMessage(
        {
          defaultMessage: '{staysCount, plural, one {# row stays as it is.} other {{staysCount, number} rows stay as they are.}}',
          id: 'gMeGvgA3NY',
        },
        {
          staysCount: stayCount,
        },
      );
}
export function dropdownOptionsAddedWords(options?: Dynamic, column?: Dynamic, sheetName?: Dynamic) {
  let shownOptions = options.slice(0, MAX_OPTIONS_NAMED_IN_IMPORT_NOTES).map(quotedOptionLabel);
  let moreCount = options.length - shownOptions.length;
  let [columnName = ''] = importColumnNames([column]);
  if (moreCount > 0)
    return translateMessage(
      {
        defaultMessage:
          '{moreCount, plural, one {{labels}, and # more will be added to the {columnName} dropdown in {sheetName}.} other {{labels}, and # more will be added to the {columnName} dropdown in {sheetName}.}}',
        id: 'zThKZeY9y5',
      },
      {
        moreCount: moreCount,
        labels: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE, {
          type: 'unit',
        }).format(shownOptions),
        columnName: columnName,
        sheetName: sheetName,
      },
    );
  return translateMessage(
    {
      defaultMessage:
        '{count, plural, one {{labels} will be added to the {columnName} dropdown in {sheetName}.} other {{labels} will be added to the {columnName} dropdown in {sheetName}.}}',
      id: 'IAj8MRqaKK',
    },
    {
      count: shownOptions.length,
      labels: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE).format(shownOptions),
      columnName: columnName,
      sheetName: sheetName,
    },
  );
}
export function dropdownsOptionsAddedNotes(optionsByColumn?: Dynamic, sheetName?: Dynamic) {
  if (optionsByColumn.length <= MAX_COLUMNS_NAMED_IN_IMPORT_NOTES)
    return optionsByColumn.map(({ labels: labels, column: column }: Dynamic) => dropdownOptionsAddedWords(labels, column, sheetName));
  return [
    translateMessage(
      {
        defaultMessage:
          '{count, plural, one {# new option will be added to {columnCount, number, ::group-off} dropdowns in {sheetName}.} other {{count, number, ::group-off} new options will be added to {columnCount, number, ::group-off} dropdowns in {sheetName}.}}',
        id: 'SrZGHAG9MR',
      },
      {
        count: optionsByColumn.reduce((total: Dynamic, { labels: labels }: Dynamic) => total + labels.length, 0),
        columnCount: optionsByColumn.length,
        sheetName: sheetName,
      },
    ),
  ];
}
export function columnsClearedWords(columns?: Dynamic, sheetName?: Dynamic) {
  if (columns.length > MAX_COLUMNS_NAMED_IN_IMPORT_NOTES)
    return translateMessage(
      {
        defaultMessage:
          '{count, plural, one {# other column in {sheetName} will be cleared too, including any formulas, because the file doesn’t have it.} other {{count, number} other columns in {sheetName} will be cleared too, including any formulas, because the file doesn’t have them.}}',
        id: 'AZaSnvbLCY',
      },
      {
        count: columns.length,
        sheetName: sheetName,
      },
    );
  let columnNames = importColumnNames(columns);
  return translateMessage(
    {
      defaultMessage:
        '{count, plural, one {{names} will be cleared too, including any formulas, because the file doesn’t have that column.} other {{names} will be cleared too, including any formulas, because the file doesn’t have those columns.}}',
      id: 'OBtXG3GZVF',
    },
    {
      count: columnNames.length,
      names: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE).format(columnNames),
    },
  );
}
export function formulasWrittenOverWords(count?: Dynamic, columns?: Dynamic, sheetName?: Dynamic) {
  if (columns.length > MAX_COLUMNS_NAMED_IN_IMPORT_NOTES)
    return translateMessage(
      {
        defaultMessage:
          '{count, plural, one {# formula in {columnCount, number} columns of {sheetName} will be replaced with the file’s value and stop updating.} other {{count, number} formulas in {columnCount, number} columns of {sheetName} will be replaced with the file’s values and stop updating.}}',
        id: 'vzEoKmohJ6',
      },
      {
        count: count,
        columnCount: columns.length,
        sheetName: sheetName,
      },
    );
  return translateMessage(
    {
      defaultMessage:
        '{count, plural, one {# formula in {names} will be replaced with the file’s value and stop updating.} other {{count, number} formulas in {names} will be replaced with the file’s values and stop updating.}}',
      id: 'Z2E4++736w',
    },
    {
      count: count,
      names: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE).format(importColumnNames(columns)),
    },
  );
}
export function importLossWarning(
  { columnsCleared: columnsCleared, formulasWrittenOver: formulasWrittenOver2 }: Dynamic,
  sheetName?: Dynamic,
) {
  let { count: count, columns: columns } = formulasWrittenOver2;
  let lines = [
    ...(columnsCleared.length > 0 ? [columnsClearedWords(columnsCleared, sheetName)] : []),
    ...(count > 0 ? [formulasWrittenOverWords(count, columns, sheetName)] : []),
  ];
  return lines.length > 0 ? lines.join(' ') : null;
}
export function importNotes(plan?: Dynamic, sheetName?: Dynamic) {
  let lossWarning = importLossWarning(plan, sheetName);
  let optionNotes = dropdownsOptionsAddedNotes(plan.optionsAdded, sheetName);
  if (lossWarning === null && optionNotes.length === 0) return null;
  return {
    words: [...(lossWarning === null ? [] : [lossWarning]), ...optionNotes].join(' '),
    variant: lossWarning === null ? 'neutral' : 'warning',
  };
}
export function importRefusalWords(refusal?: Dynamic, sheetName?: Dynamic, keyName?: Dynamic) {
  if (refusal === 'keyRepeats')
    return translateMessage(
      {
        defaultMessage:
          'Rows can’t be matched by {keyName} because some of its values repeat. You can match by another column or choose another option.',
        id: '4moqi/iy7W',
      },
      {
        keyName: keyName ?? '',
      },
    );
  if (refusal === 'cellCoveredByMergedRange')
    return translateMessage(
      {
        defaultMessage: '{sheetName} has merged cells where these rows would go. You can import to a new sheet.',
        id: 'qH/OCmFt5s',
      },
      {
        sheetName: sheetName,
      },
    );
  if (refusal === 'tooManyDropdownOptions')
    return translateMessage(
      {
        defaultMessage:
          'A dropdown in {sheetName} can have up to 100 options, and this file has too many new values for it. You can import to a new sheet.',
        id: 'HC+4wWXfaj',
      },
      {
        sheetName: sheetName,
      },
    );
  if (refusal === 'dropdownOptionTooLong' || refusal === 'dropdownOptionHoldsControlCharacter')
    return translateMessage(
      {
        defaultMessage:
          'Some values in this file are over 100 characters or have line breaks, so they can’t be dropdown options in {sheetName}. You can import to a new sheet.',
        id: 'jhyC4NPZWS',
      },
      {
        sheetName: sheetName,
      },
    );
  if (refusalMessageKey(refusal) === 'noRoomInWorkbook')
    return translateMessage({
      defaultMessage: 'This Sheet doesn’t have room for that much data. Import a smaller file.',
      id: 'dYGkEJ/GES',
    });
  return translateMessage(
    {
      defaultMessage: 'This file can’t go into {sheetName}. You can import to a new sheet.',
      id: '8q2XGzq7ck',
    },
    {
      sheetName: sheetName,
    },
  );
}
export function listKindName(kind?: Dynamic) {
  switch (kind) {
    case 'bullet':
      return translateMessage({
        defaultMessage: 'Bulleted list',
        id: '3cPsFM4vaz',
      });
    case 'numbered':
      return translateMessage({
        defaultMessage: 'Numbered list',
        id: 'Q8Yu8zRwwm',
      });
    case 'checkbox':
      return translateMessage({
        defaultMessage: 'Checklist',
        id: 'fGEcnqeBe8',
      });
  }
}
export function listKindOnOffWords(kind?: Dynamic, isOn?: Dynamic) {
  switch (kind) {
    case 'bullet':
      return translateMessage(
        {
          defaultMessage: '{isOn, select, true {Bulleted list on} other {Bulleted list off}}',
          id: 'NVvCzIKwD9',
        },
        {
          isOn: String(isOn),
        },
      );
    case 'numbered':
      return translateMessage(
        {
          defaultMessage: '{isOn, select, true {Numbered list on} other {Numbered list off}}',
          id: 'S8rD6WgwrV',
        },
        {
          isOn: String(isOn),
        },
      );
    case 'checkbox':
      return translateMessage(
        {
          defaultMessage: '{isOn, select, true {Checklist on} other {Checklist off}}',
          id: 'VggFzlOIrF',
        },
        {
          isOn: String(isOn),
        },
      );
  }
}
export const importMessages = {
  addRows: () =>
    translateMessage({
      defaultMessage: 'Add rows',
      id: 'QB0amnfU/j',
    }),
  merge: () =>
    translateMessage({
      defaultMessage: 'Merge rows',
      id: 'mb6YYOl2Ub',
    }),
  replace: () =>
    translateMessage({
      defaultMessage: 'Replace rows',
      id: 'jcX2M5CKcY',
    }),
  into: () =>
    translateMessage({
      defaultMessage: 'Into',
      id: 'S1wjiJtkLA',
    }),
  previewOfChanges: () =>
    translateMessage({
      defaultMessage: 'Preview of changes',
      id: '7TQl/d4o+C',
    }),
  change: () =>
    translateMessage({
      defaultMessage: 'Change',
      id: 'myL34/kyb3',
    }),
};
export const intoSheetLabel = (sheetName?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Into sheet: {sheetName}',
      id: 'sqHvAwPm2a',
    },
    {
      sheetName: sheetName,
    },
  );
export const importRowChangeLabel = (change?: Dynamic) => {
  switch (change) {
    case 'added':
      return translateMessage({
        defaultMessage: 'New',
        id: 'beRcxrFyjU',
      });
    case 'changed':
      return translateMessage({
        defaultMessage: 'Updated',
        id: 'hV1ifnGjpV',
      });
    case 'gone':
      return translateMessage({
        defaultMessage: 'Removed',
        id: 'XJtRP08k8J',
      });
  }
};
export const importCellWasLabel = (before?: Dynamic) =>
  before === ''
    ? translateMessage({
        defaultMessage: 'Was empty',
        id: 'xrNFgOG061',
      })
    : translateMessage(
        {
          defaultMessage: 'Was {before}',
          id: '6poHQVBU3J',
        },
        {
          before: before,
        },
      );
export const isImportChangeless = ({ addedCount: addedCount, changedCount: changedCount, goneCount: goneCount }: Dynamic) =>
  addedCount + changedCount + goneCount === 0;
export const importRowCountWords = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {# row} other {{count, number} rows}}',
      id: 'Jc0XtqqN8o',
    },
    {
      count: count,
    },
  );
export const currentRowsWords = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {the # current row} other {the {count, number} current rows}}',
      id: 'AA4pRpLMU7',
    },
    {
      count: count,
    },
  );
export const columnsNotImportedWords = (columnNames?: Dynamic, sheetName?: Dynamic) =>
  translateMessage(
    {
      defaultMessage:
        '{count, plural, one {{names} isn’t a column in {sheetName}, so it won’t be imported.} other {{names} aren’t columns in {sheetName}, so they won’t be imported.}}',
      id: '5IzfOMg148',
    },
    {
      count: columnNames.length,
      names: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE).format(columnNames),
      sheetName: sheetName,
    },
  );
export const MAX_COLUMNS_NAMED_IN_IMPORT_NOTES = 4;
export const importColumnNames = (columns?: Dynamic) =>
  columns.map(
    ({ letters: letters, name: name }: Dynamic) =>
      name ??
      translateMessage(
        {
          defaultMessage: 'column {letters}',
          id: '2/57AGYjYs',
        },
        {
          letters: letters,
        },
      ),
  );
export const MAX_OPTIONS_NAMED_IN_IMPORT_NOTES = 4;
export const quotedOptionLabel = (value?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '“{value}”',
      id: 'd1bsfuzx+j',
    },
    {
      value: value,
    },
  );
export const checkedStateWords = (isChecked?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{isChecked, select, true {Checked} other {Not checked}}',
      id: 'mjCtbKVuni',
    },
    {
      isChecked: String(isChecked),
    },
  );
