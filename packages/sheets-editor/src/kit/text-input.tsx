import * as React from 'react';
import { Input } from '@base-ui/react/input';
import { cn } from './cn.ts';

export type TextInputSize = 'sm';

type DataAttributes = { [attribute: `data-${string}`]: string | number | boolean | undefined };

export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, DataAttributes {
  size?: TextInputSize;
  /** Stretches across its container; on by default. */
  fullWidth?: boolean;
  /** Content inside the field after the text, such as a count or a small button. */
  slotEnd?: React.ReactNode;
}

const SHELL_CLASSES =
  'ui-reset h-control min-w-0 rounded-control bg-fill-field font-sans text-body text-primary shadow-field-ring transition-shadow duration-fast';

const RING_CLASSES =
  'hover:shadow-field-hover data-invalid:shadow-field-invalid aria-invalid:shadow-field-invalid focus-visible:shadow-focus [&[data-initial-focus]:focus]:shadow-focus data-invalid:focus-visible:shadow-focus-danger aria-invalid:focus-visible:shadow-focus-danger';

const WITHIN_RING_CLASSES =
  '[&:not(:focus-within)]:hover:shadow-field-hover has-[input[data-invalid]]:shadow-field-invalid has-[input[aria-invalid=true]]:shadow-field-invalid focus-within:shadow-focus has-[input[data-invalid]]:focus-within:shadow-focus-danger has-[input[aria-invalid=true]]:focus-within:shadow-focus-danger';

const DISABLED_CLASSES = 'disabled:opacity-disabled has-[input:disabled]:opacity-disabled';

/** Classes for a bare text input inside a field shell; the shell draws the box. */
export const BARE_INPUT_CLASSES = 'ui-input-bare h-full py-0 min-w-0 flex-1 placeholder:text-muted';

/** A single-line text field. Inside a `FieldRoot` it takes the field's label, description and invalid state. */
export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { size, fullWidth = true, slotEnd, className, dir = 'auto', ...props },
  ref,
) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const setRef = React.useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref !== null) ref.current = element;
    },
    [ref],
  );
  const hasSlot = slotEnd !== undefined && slotEnd !== null && slotEnd !== false;

  if (!hasSlot) {
    return (
      <Input
        ref={setRef as React.Ref<HTMLElement>}
        data-ui="TextInput"
        data-size={size}
        dir={dir}
        {...props}
        className={cn(
          SHELL_CLASSES,
          RING_CLASSES,
          DISABLED_CLASSES,
          'outline-none placeholder:text-muted ps-md pe-md',
          fullWidth && 'w-full',
          className,
        )}
      />
    );
  }

  return (
    <div
      data-ui="TextInput"
      data-size={size}
      className={cn(SHELL_CLASSES, WITHIN_RING_CLASSES, DISABLED_CLASSES, 'inline-flex items-center', fullWidth && 'w-full', className)}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || inputRef.current === null) return;
        event.preventDefault();
        inputRef.current.focus();
      }}
    >
      <Input ref={setRef as React.Ref<HTMLElement>} dir={dir} {...props} className={cn(BARE_INPUT_CLASSES, 'ps-md pe-[var(--ui-pad-xs)]')} />
      <span
        data-ui-end-slot=""
        className="flex h-full shrink-0 items-center gap-0.5 pe-[calc((var(--ui-h-control)-var(--ui-h-control-nested))/2)]"
      >
        {slotEnd}
      </span>
    </div>
  );
});
