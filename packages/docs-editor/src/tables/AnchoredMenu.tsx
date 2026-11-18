/** A chrome menu opened at a point of the page rather than from a button. */
import { ChromeMenu, type ChromeSide } from '@open-artifact/editor-kit/react';
import type { ReactNode } from 'react';

export interface AnchoredMenuProps {
  left: number;
  top: number;
  open: boolean;
  onClose(): void;
  side?: ChromeSide;
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
}

export function AnchoredMenu({ left, top, open, onClose, side = 'bottom', align = 'start', children }: AnchoredMenuProps): ReactNode {
  return (
    <div className="pointer-events-none absolute size-0" style={{ left, top }}>
      <ChromeMenu
        open={open}
        onOpenChange={next => {
          if (!next) onClose();
        }}
        side={side}
        align={align}
        sideOffset={2}
        trigger={<button type="button" tabIndex={-1} aria-hidden="true" className="block size-0 opacity-0" />}
      >
        {children}
      </ChromeMenu>
    </div>
  );
}
