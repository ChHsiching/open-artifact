import * as React from 'react';
import { cn } from './cn.ts';
import { watchInputOf } from './focus-origin.ts';
import { DensityContext, useDensity, useThemeMode, type Density } from './theme.tsx';

export interface PopupScopeProps {
  density?: Density;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * Carries the root's tokens into a portalled popup, which renders outside the root's
 * element and would otherwise lose its density and light or dark mode.
 */
export function PopupScope({ density, className, style, children }: PopupScopeProps): React.ReactElement {
  const outer = useDensity();
  const resolved = density ?? outer;
  const mode = useThemeMode();
  return (
    <div
      ref={watchInputOf}
      className={cn('ui-root pointer-events-auto', className)}
      style={style}
      data-ui-portal=""
      data-density={resolved}
      data-mode={mode}
    >
      <DensityContext.Provider value={resolved}>{children}</DensityContext.Provider>
    </div>
  );
}

/** Renders its children in dark mode, as tooltips always are. */
export function DarkScope({ children }: { children?: React.ReactNode }): React.ReactElement {
  return (
    <div className="ui-dark-scope contents" data-mode="dark">
      {children}
    </div>
  );
}
