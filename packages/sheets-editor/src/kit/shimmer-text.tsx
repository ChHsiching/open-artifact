import * as React from 'react';
import { cn } from './cn.ts';

export type ShimmerTextVariant = 'primary' | 'secondary';

export interface ShimmerTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** `secondary` for quieter text, such as a hint under a title. */
  variant?: ShimmerTextVariant;
  /** Whether the sheen runs; the text stays put either way. */
  active?: boolean;
}

/** Text with a light passing over it, while the work it describes is under way. */
export const ShimmerText = React.forwardRef<HTMLSpanElement, ShimmerTextProps>(function ShimmerText(
  { variant = 'primary', active = true, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      data-ui="ShimmerText"
      data-variant={variant}
      data-shimmering={active ? 'true' : 'false'}
      {...rest}
      className={cn('inline-block', className)}
    >
      {children}
    </span>
  );
});
