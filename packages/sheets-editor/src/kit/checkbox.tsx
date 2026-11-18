import * as React from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { cn } from './cn.ts';
import { Icon } from './icon.tsx';
import { DisabledReasonTooltip } from './tooltip.tsx';

/** The box is sized by `--ui-checkbox`, `--ui-checkbox-glyph`, `--ui-checkbox-radius` and `--ui-checkbox-edge`. */
const BOX_CLASSES =
  'relative flex size-[var(--ui-checkbox)] shrink-0 items-center justify-center rounded-[var(--ui-checkbox-radius)] border border-[color:var(--ui-checkbox-edge)] bg-transparent text-on-accent';

const BOX_ON_CLASSES = 'border-transparent bg-fill-accent';

const GLYPH_STYLE: React.CSSProperties = { fontSize: 'var(--ui-checkbox-glyph)' };

function CheckGlyph({ indeterminate, className }: { indeterminate: boolean; className?: string }): React.ReactElement {
  return <Icon name={indeterminate ? 'Minus' : 'Check'} size="sm" bold style={GLYPH_STYLE} className={className} />;
}

export interface CheckboxProps extends Omit<BaseCheckbox.Root.Props, 'className' | 'children' | 'onCheckedChange' | 'render'> {
  label?: React.ReactNode;
  className?: string;
  /** Wipes the tick in and out. */
  animated?: boolean;
  /** Why the checkbox is disabled, shown on hover or focus. */
  disabledReason?: React.ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}

/** A checkbox, with an optional label beside it. */
export const Checkbox = React.forwardRef<HTMLElement, CheckboxProps>(function Checkbox(
  { label, className, animated = false, disabledReason, onCheckedChange, indeterminate = false, disabled, ...props },
  ref,
) {
  const hasLabel = label !== undefined && label !== null && label !== false && label !== '';
  const checkbox = (
    <BaseCheckbox.Root
      ref={ref}
      data-ui="Checkbox"
      {...props}
      disabled={disabled}
      indeterminate={indeterminate}
      onCheckedChange={(checked) => onCheckedChange?.(checked)}
      className={cn(
        'ui-reset group/cb inline-flex gap-xs border-0 text-start font-sans text-body font-normal text-primary outline-none select-none focus-visible:outline-hidden data-[disabled]:opacity-disabled',
        hasLabel ? 'items-start' : 'items-center',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          BOX_CLASSES,
          'group-hover/cb:border-[color:var(--ui-checkbox-edge-hover)] group-data-[checked]/cb:border-transparent group-data-[checked]/cb:bg-fill-accent group-data-[indeterminate]/cb:border-transparent group-data-[indeterminate]/cb:bg-fill-accent group-data-[disabled]/cb:group-hover/cb:border-[color:var(--ui-checkbox-edge)] group-focus-visible/cb:shadow-focus',
          animated && 'transition-colors duration-fast ease-out motion-reduce:transition-none',
          hasLabel && 'mt-[calc((1lh-var(--ui-checkbox))/2)]',
        )}
      >
        <span
          className={cn(
            'flex [clip-path:inset(0_100%_0_0)] group-data-[checked]/cb:[clip-path:inset(0)] group-data-[indeterminate]/cb:[clip-path:inset(0)]',
            animated && 'transition-[clip-path] duration-snap ease-out motion-reduce:transition-none',
          )}
        >
          <CheckGlyph indeterminate={indeterminate} />
        </span>
      </span>
      {hasLabel && <span className="min-w-0">{label}</span>}
    </BaseCheckbox.Root>
  );
  if (disabled && disabledReason !== undefined && disabledReason !== null) {
    return <DisabledReasonTooltip reason={disabledReason}>{checkbox}</DisabledReasonTooltip>;
  }
  return checkbox;
});

export interface CheckboxMarkProps {
  checked?: boolean;
  indeterminate?: boolean;
  className?: string;
}

/** A checkbox drawn for show, inside a row that is itself the control (such as a listbox option). */
export function CheckboxMark({ checked = false, indeterminate = false, className }: CheckboxMarkProps): React.ReactElement {
  const isOn = checked || indeterminate;
  return (
    <span
      aria-hidden
      data-ui="CheckboxMark"
      data-checked={checked && !indeterminate ? '' : undefined}
      data-indeterminate={indeterminate ? '' : undefined}
      data-unchecked={isOn ? undefined : ''}
      className={cn(BOX_CLASSES, isOn && BOX_ON_CLASSES, className)}
    >
      {isOn && <CheckGlyph indeterminate={indeterminate} />}
    </span>
  );
}
