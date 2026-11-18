/** The bar under the top bar: which tab is open, and the page's own controls (on a phone, only which tab). */
import { type ReactNode } from 'react';
import { useDocShell } from '../app/shell.ts';
import { DocTitle, AccessBadge } from '../topbar/DocTitle.tsx';
import { useTopBar } from '../topbar/store.ts';
import { PHONE_QUERY, useMedia } from '../app/media.ts';
import { slotViews } from '../app/slots.ts';
import { Slot } from './Slot.tsx';

const ON_PHONE = ['tabs-picker'];

export function PageBar(): ReactNode {
  const framed = useDocShell(state => state.draws.has('formats'));
  const renaming = useTopBar(state => state.renaming);
  const phone = useMedia(PHONE_QUERY);
  const views = slotViews('pageBar').filter(({ key }) => !phone || ON_PHONE.includes(key));
  if (!views.length) return null;
  return (
    <div inert={phone && framed && !renaming} data-doc-phone-bar={(phone && framed && !renaming) || undefined} className="flex h-10 flex-none items-center gap-1 overflow-x-auto bg-ground px-3" role="toolbar" aria-label="Page">
      <Slot name="pageBar" only={phone ? ON_PHONE : undefined} />
      {framed && <>
        <div className="flex-1" />
        {renaming ? <DocTitle /> : <AccessBadge />}
        <Slot name="topBar" only={['presence', 'more']} />
      </>}
    </div>
  );
}
