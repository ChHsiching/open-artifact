import { Fragment, type ReactNode } from 'react';
import { type SlotName, slotViews } from '../app/slots.ts';

/** The views filling a slot, in order; `only` keeps those whose keys it names. */
export function Slot({ name, only }: { name: SlotName; only?: readonly string[] }): ReactNode {
  return slotViews(name)
    .filter(({ key }) => !only || only.includes(key))
    .map(({ key, view: View }) => (
      <Fragment key={key}>
        <View />
      </Fragment>
    ));
}
