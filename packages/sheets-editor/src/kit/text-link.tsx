import * as React from 'react';
import { cn } from './cn.ts';

export interface TextLinkProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Takes the colour of the text around it instead of the accent. */
  inheritColor?: boolean;
}

/** An action that reads as a link inside running text. */
export const TextLink = React.forwardRef<HTMLButtonElement, TextLinkProps>(function TextLink(
  { inheritColor = false, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-ui="TextLink"
      data-inherit-color={inheritColor ? '' : undefined}
      {...rest}
      className={cn(
        'inline cursor-pointer rounded-[2px] border-0 bg-transparent p-0 text-start underline underline-offset-[3px] outline-none',
        'decoration-[color-mix(in_srgb,currentColor_40%,transparent)] hover:decoration-current focus-visible:decoration-current focus-visible:shadow-focus',
        'disabled:cursor-default disabled:no-underline disabled:opacity-50 forced-colors:text-[LinkText]',
        inheritColor ? 'text-inherit' : 'text-accent',
        className,
      )}
    >
      {children}
    </button>
  );
});
