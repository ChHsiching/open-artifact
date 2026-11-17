/**
 * A link on the board that does not get in the way of editing.
 *
 * A plain click on a link card, a linked picture or a link in text selects
 * it like any element; the link opens on a Mod-click, a click on its
 * open-arrow (`[data-wb-opens]`), or any click by a viewer who cannot
 * edit. A press that turned into a drag never opens it.
 */

import { useRef, type AnchorHTMLAttributes, type MouseEvent, type PointerEvent } from 'react';
import { maybeSession } from '../services/session.ts';

/** How far a press may move and still count as a click, in screen pixels. */
const CLICK_SLOP = 4;

/** Props of {@link PassiveLink}: an anchor's props with a required `href`. */
export interface PassiveLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/** Whether a click on a board link should follow it. */
export function shouldFollowLink(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'target'>, canEdit: boolean): boolean {
  if (event.metaKey || event.ctrlKey || !canEdit) return true;
  return event.target instanceof Element && event.target.closest('[data-wb-opens]') !== null;
}

/** A board link that opens only when meant to (see the module comment). */
export function PassiveLink({ href, children, onClick, onPointerDown, ...rest }: PassiveLinkProps) {
  const pressed = useRef<{ x: number; y: number } | null>(null);
  const down = (event: PointerEvent<HTMLAnchorElement>) => {
    pressed.current = { x: event.clientX, y: event.clientY };
    onPointerDown?.(event);
  };
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const start = pressed.current;
    pressed.current = null;
    const dragged = start !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP;
    if (dragged || event.defaultPrevented || !shouldFollowLink(event, maybeSession()?.canEdit ?? false)) event.preventDefault();
  };
  return (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer" title={rest.title ?? href} draggable={false} onPointerDown={down} onClick={click}>
      {children}
    </a>
  );
}
