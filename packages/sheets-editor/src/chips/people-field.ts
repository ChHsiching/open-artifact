import { Avatar } from '../kit/avatar.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { FieldOfChips } from './field-of-chips.ts';
import { peoplePickerMessages } from '../i18n/chip-labels.ts';
export function PeopleField({ people: people, chipGoneTo: chipGoneTo, onPersonRemoved: onPersonRemoved, ...fieldProps }: Dynamic) {
  let peopleShown = people ?? NO_PEOPLE;
  let chips = React.useMemo(
    () =>
      peopleShown.map(
        ({ userId: userId, name: name, avatarUrl: avatarUrl }: Dynamic) => ({
          key: userId,
          name: name,
          isGoneTo: userId === chipGoneTo,
          chip: {
            optionPaints: null,
            showsPeople: true,
            before: jsx(Avatar, {
              name: name,
              src: avatarUrl,
              size: 'xs',
              'aria-hidden': true,
            }),
            children: name,
          },
        }),
      ),
    [peopleShown, chipGoneTo],
  );
  let removeChip = React.useCallback(
    (chipKey?: Dynamic) => {
      let person = peopleShown.find(({ userId: userId }: Dynamic) => userId === chipKey);
      if (person !== undefined) onPersonRemoved(person.userId);
    },
    [peopleShown, onPersonRemoved],
  );
  return jsx(FieldOfChips, {
    mostWidth: PEOPLE_FIELD_MOST_WIDTH,
    chips: chips,
    hint: addPeopleHint(peopleShown),
    onChipRemoved: removeChip,
    ...fieldProps,
  });
}
export const PEOPLE_FIELD_MOST_WIDTH = 480;
export const NO_PEOPLE: Dynamic = [];
export const addPeopleHint = (people?: Dynamic) =>
  people.length === 0 ? peoplePickerMessages.addPeople() : peoplePickerMessages.addMore();
