import type { Dynamic } from '../dynamic.ts';
import { foldLabelCase } from '../chips/dropdown-options.ts';
import { toolUnavailableText } from '../i18n/chip-labels.ts';
import { dropdownPaneMessages } from '../i18n/format-labels.ts';
import { insertSearchWords, toolLabelWithValue } from './search-words.ts';
import { shortcutKeysFor } from '../keys/shortcut-list.ts';
export function withDropdownCost(set?: Dynamic, setMeets?: Dynamic, tool?: Dynamic) {
  if (setMeets === null) return tool;
  let setLabels = new (Set as Dynamic)(set.options.map(({ label: label }: Dynamic) => foldLabelCase(label)));
  let otherCount: Dynamic = setMeets.otherCount;
  for (let [said, saidCount] of setMeets.said as Dynamic) if (!setLabels.has(said)) otherCount += saidCount;
  if (otherCount > 0)
    return {
      ...tool,
      cost: {
        kind: 'clears',
        count: otherCount + setMeets.formulaCount,
      },
    };
  return setMeets.formulaCount > 0
    ? {
        ...tool,
        cost: {
          kind: 'replaces',
          count: setMeets.formulaCount,
        },
      }
    : tool;
}
export function insertTools(selectionTools?: Dynamic, options?: Dynamic) {
  if (selectionTools.viewOnlyBecause !== null) return [];
  let { onDayChosen: onDayChosen } = options;
  let offers = flattenOffers(selectionTools.offers);
  let dropdownInsert = selectionTools.inserts.find(({ what: what }: Dynamic) => what === 'dropdown');
  let canInsertDropdown = (dropdownInsert?.fits ?? true) && (selectionTools.setMeets?.isTaken ?? true);
  let whyNoDropdown =
    selectionTools.whyNoToolForCells ??
    (canInsertDropdown ? (dropdownInsert?.whyNotNow ?? null) : toolUnavailableText(dropdownPaneMessages.dropdown()));
  return [
    ...offers
      .filter((input?: Dynamic) => input.kind === 'day')
      .flatMap(({ label: label, day: day }: Dynamic, dayIndex?: Dynamic) => {
        let dayKey = DAY_OFFER_KEYS[dayIndex];
        if (dayKey === undefined) return [];
        let dayTool = {
          id: `at.${dayKey}`,
          label: label,
          otherWords: insertSearchWords(dayKey),
          icon: 'Calendar',
          actsOn: 'activeCell',
          whyNot: selectionTools.whyNoToolForCells,
          isWeighty: true,
        };
        if (dayKey === 'today')
          return [
            {
              ...dayTool,
              keys: shortcutKeysFor('enterToday'),
              run: () =>
                options.dispatch({
                  kind: 'keyPressed',
                  key: ';',
                  isShiftHeld: false,
                  isModifierHeld: true,
                  isAltHeld: false,
                  isRepeat: false,
                  today: day,
                }),
            },
          ];
        return onDayChosen === null
          ? []
          : [
              {
                ...dayTool,
                run: () => onDayChosen(day),
              },
            ];
      }),
    ...offers
      .filter((input?: Dynamic) => input.kind === 'dropdownOfSet')
      .map(
        ({ label: label, set: set }: Dynamic) =>
          withDropdownCost(set, selectionTools.setMeets, {
            id: `bar.insert.dropdown.${set.key}`,
            label: toolLabelWithValue(dropdownPaneMessages.dropdown(), label),
            otherWords: [...insertSearchWords(set.key), ...insertSearchWords('dropdownOfSet')],
            icon: 'Dropdown',
            actsOn: 'cells',
            whyNot: whyNoDropdown,
            isWeighty: true,
            run: () =>
              options.onFormatChosen({
                dropdown: true,
                firstSet: set,
                isReadySetPicked: true,
                replacesFormulas: true,
                thenOpens: 'list',
              }),
          }),
      ),
  ];
}
export const DAY_OFFER_KEYS = ['today', 'tomorrow', 'yesterday'];
export const flattenOffers = (offers?: Dynamic) =>
  offers.flatMap((offer?: Dynamic) => (offer.kind === 'several' ? flattenOffers(offer.offers) : [offer]));
