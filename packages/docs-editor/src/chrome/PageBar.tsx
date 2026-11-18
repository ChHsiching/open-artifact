/** The bar under the top bar: which tab is open, and the page's own controls (on a phone, only which tab). */
import { type ReactNode } from 'react';
import { PHONE_QUERY, useMedia } from '../app/media.ts';
import { slotViews } from '../app/slots.ts';
import { Slot } from './Slot.tsx';

const ON_PHONE = ['tabs-picker'];

export function PageBar(): ReactNode {
  const phone = useMedia(PHONE_QUERY);
  const views = slotViews('pageBar').filter(({ key }) => !phone || ON_PHONE.includes(key));
  if (!views.length) return null;
  return (
    <div className="flex h-10 flex-none items-center gap-1 overflow-x-auto bg-ground px-3" role="toolbar" aria-label="Page">
      <Slot name="pageBar" only={phone ? ON_PHONE : undefined} />
    </div>
  );
}
