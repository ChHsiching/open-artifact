import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { cn } from './cn.ts';

export type SwitchSize = 'sm';

export interface SwitchProps extends Omit<BaseSwitch.Root.Props, 'className' | 'children' | 'onCheckedChange' | 'render'> {
  size?: SwitchSize;
  className?: string;
  onCheckedChange?: (checked: boolean) => void;
}

/** An on/off switch. Inside a `FieldRoot` or a `PropertyRow` it is named by the row's label. */
export const Switch = React.forwardRef<HTMLElement, SwitchProps>(function Switch({ size, className, onCheckedChange, onKeyDown, ...props }, ref) {
  return (
    <BaseSwitch.Root
      ref={ref}
      data-ui="Switch"
      data-size={size}
      {...props}
      onCheckedChange={(checked) => onCheckedChange?.(checked)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter' && event.repeat) event.preventDefault();
      }}
      className={cn(
        'ui-reset group/sw relative inline-flex shrink-0 items-center rounded-full border-0 p-0.5 outline-none focus-visible:outline-hidden',
        size === 'sm' ? '[--ui-switch-size:var(--ui-switch-h-sm)]' : '[--ui-switch-size:var(--ui-switch-h)]',
        'h-[var(--ui-switch-size)] w-[calc(var(--ui-switch-size)*1.8)]',
        'bg-[var(--ui-switch-track)] hover:bg-[var(--ui-switch-track-hover)] data-[checked]:bg-fill-accent data-[checked]:hover:bg-fill-accent',
        'transition-[background-color,box-shadow] duration-fast ease-out motion-reduce:transition-none',
        'focus-visible:shadow-focus data-[disabled]:opacity-disabled data-[disabled]:hover:bg-[var(--ui-switch-track)] data-[disabled]:data-[checked]:hover:bg-fill-accent',
        className,
      )}
    >
      <BaseSwitch.Thumb
        className={cn(
          'block aspect-square h-full rounded-full bg-[var(--ui-switch-knob)] shadow-[var(--ui-switch-knob-shadow)]',
          'transition-transform duration-snap ease-out motion-reduce:transition-none',
          'data-[checked]:translate-x-[calc(var(--ui-switch-size)*0.8)] rtl:data-[checked]:-translate-x-[calc(var(--ui-switch-size)*0.8)]',
        )}
      />
    </BaseSwitch.Root>
  );
});
