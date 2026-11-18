import * as React from 'react';
import { useRender } from '@base-ui/react/use-render';
import { cn } from './cn.ts';
import { Icon, ICON_METRICS, isIconName, useIconSize, type IconName, type IconSize, type IconSizeChoice } from './icon.tsx';
import { isApplePlatform } from './platform.ts';
import { parseSingleShortcut, Shortcut } from './shortcut.tsx';
import { Spinner } from './spinner.tsx';
import { DisabledReasonTooltip, Tooltip, useInsideTooltip, type TooltipSide } from './tooltip.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'onContent' | 'onAccent';
export type ButtonSize = 'xxs' | 'xs' | 'sm' | 'lg';
export type ButtonFlush = boolean | 'start' | 'end' | 'both';

const FOCUS_RING = 'focus-visible:shadow-focus [&[data-initial-focus]:focus]:shadow-focus';
const DANGER_FOCUS_RING = 'focus-visible:shadow-focus-danger [&[data-initial-focus]:focus]:shadow-focus-danger';
const ON_CONTENT_TEXT =
  'text-primary font-medium font-control focus-visible:shadow-[0_0_0_2px_var(--ui-page-bg),0_0_0_4px_var(--ui-fill-accent)] [&[data-initial-focus]:focus]:shadow-[0_0_0_2px_var(--ui-page-bg),0_0_0_4px_var(--ui-fill-accent)]';

const BASE_CLASSES =
  'ui-reset group/btn relative isolate inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap select-none cursor-[var(--ui-cursor-interactive)] aria-disabled:cursor-default data-[disabled]:cursor-default border-0 outline-none focus-visible:outline-hidden [&[data-initial-focus]:focus]:outline-hidden rounded h-control font-sans text-body [&:disabled:not([aria-busy])]:opacity-disabled disabled:pointer-events-none transition-shadow duration-fast';

const TEXT_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  primary: `text-on-primary font-medium font-control [--ui-shortcut-cap-ink:currentColor] ${FOCUS_RING}`,
  secondary: `text-primary font-normal font-control aria-pressed:text-accent ${FOCUS_RING}`,
  ghost: `text-primary font-normal font-control aria-pressed:text-accent ${FOCUS_RING}`,
  danger: `text-on-danger font-medium font-control [--ui-shortcut-cap-ink:currentColor] ${DANGER_FOCUS_RING}`,
  accent: `text-primary font-normal font-control aria-pressed:text-accent ${FOCUS_RING}`,
  onContent: ON_CONTENT_TEXT,
  onAccent: ON_CONTENT_TEXT,
};

const OPEN_TRIGGER = 'group-[[aria-haspopup][aria-expanded=true]]/btn';
const SECONDARY_FILL = `bg-fill-secondary group-hover/btn:bg-fill-secondary-hover ${OPEN_TRIGGER}:bg-fill-secondary-hover`;
const ON_CONTENT_FILL = `bg-[var(--ui-button-on-content)] backdrop-blur-md shadow-[inset_0_0_0_1px_var(--ui-button-on-content-ring)] group-focus-visible/btn:!shadow-[inset_0_0_0_1px_var(--ui-button-on-content-ring)] group-[[data-initial-focus]:focus]/btn:!shadow-[inset_0_0_0_1px_var(--ui-button-on-content-ring)] group-hover/btn:bg-[var(--ui-button-on-content-hover)] ${OPEN_TRIGGER}:bg-[var(--ui-button-on-content-hover)]`;

const FILL_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  primary: `bg-fill-primary group-hover/btn:bg-fill-primary-hover ${OPEN_TRIGGER}:bg-fill-primary-hover`,
  secondary: SECONDARY_FILL,
  ghost: `bg-transparent group-hover/btn:bg-fill-ghost-hover ${OPEN_TRIGGER}:bg-fill-ghost-hover`,
  danger: `bg-fill-danger group-hover/btn:bg-fill-danger-hover ${OPEN_TRIGGER}:bg-fill-danger-hover`,
  accent: SECONDARY_FILL,
  onContent: ON_CONTENT_FILL,
  onAccent: ON_CONTENT_FILL,
};

const FILL_BASE =
  'absolute inset-0 rounded-[inherit] transition-[background-color,box-shadow,color] duration-fast ease-out group-focus-visible/btn:shadow-[inset_0_0_0_1px_var(--ui-page-bg)] group-[[data-initial-focus]:focus]/btn:shadow-[inset_0_0_0_1px_var(--ui-page-bg)]';
const PRESSED_FILL = 'group-aria-pressed/btn:bg-accent-tint group-hover/btn:group-aria-pressed/btn:bg-accent-tint';
const FIELD_EDGE =
  'shadow-field group-aria-pressed/btn:shadow-field-pressed group-focus-visible/btn:group-aria-pressed/btn:shadow-[inset_0_0_0_1px_var(--ui-page-bg)]';

const OUTSET_CLASSES = { start: 'ms-outset', end: 'me-outset', both: 'mx-outset' } as const;

const SHORTCUT_MARGIN = 'me-[calc((var(--ui-h-control)-1em-6px)/2-var(--ui-pad-md))]';
const BUSY_CURSOR = 'aria-disabled:cursor-[var(--ui-cursor-interactive)] data-[disabled]:cursor-[var(--ui-cursor-interactive)]';

/** Above this ratio of its height, a pressed button would visibly shrink too much. */
const PRESS_INSET_RATIO = 0.03125;
const PRESS_INSET_MIN = 0.5;
const PRESS_INSET_MAX = 1.5;
const PRESS_MIN_SCALE = 0.8;

/** Shrinks the press feedback so that every button moves inward by about the same distance. */
function setPressScale(fill: HTMLElement, height: number): void {
  const inset = Math.min(PRESS_INSET_MAX, Math.max(PRESS_INSET_MIN, height * PRESS_INSET_RATIO));
  const { offsetWidth: width, offsetHeight: tall } = fill;
  if (width <= 0 || tall <= 0) return;
  fill.style.setProperty('--ui-btn-press-sx', String(Math.max(PRESS_MIN_SCALE, 1 - (2 * inset) / width)));
  fill.style.setProperty('--ui-btn-press-sy', String(Math.max(PRESS_MIN_SCALE, 1 - (2 * inset) / tall)));
}

const isActivationKey = (event: React.KeyboardEvent): boolean => event.key === 'Enter' || event.key === ' ';
const isPlainActivationKey = (event: React.KeyboardEvent): boolean =>
  isActivationKey(event) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

const stop = (event: React.SyntheticEvent): void => {
  event.preventDefault();
  event.stopPropagation();
};

const TEXT_ENTRY_SELECTOR =
  "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";

/** Stops a double press on a button from selecting the text around it. */
function keepSelectionOnMultiPress(event: React.MouseEvent): void {
  if (event.detail <= 1 || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest(TEXT_ENTRY_SELECTOR)) return;
  event.preventDefault();
}

const BUSY_SELECTOR = '[aria-busy="true"][aria-disabled="true"]';
const busyButtons = new WeakSet<Element>();
const guardedDocuments = new WeakSet<Document>();

/**
 * A busy button ignores the pointer, so a press on it would land on what is behind and
 * steal focus from it. Holds focus on the button instead.
 */
function guardBusyFocus(button: HTMLElement): void {
  busyButtons.add(button);
  const doc = button.ownerDocument;
  if (guardedDocuments.has(doc)) return;
  guardedDocuments.add(doc);
  doc.addEventListener(
    'mousedown',
    (event) => {
      const active = doc.activeElement;
      if (event.button === 1 || !(active instanceof HTMLElement) || !active.matches(BUSY_SELECTOR)) return;
      if (!busyButtons.has(active) && !active.matches('[data-ui="Button"]')) return;
      const { style } = active;
      if (style.getPropertyPriority('pointer-events') === 'important') return;
      const hadStyle = active.hasAttribute('style');
      const before = style.getPropertyValue('pointer-events');
      let hit: Element | null;
      try {
        style.setProperty('pointer-events', 'auto');
        hit = doc.elementFromPoint(event.clientX, event.clientY);
      } finally {
        if (before === '') style.removeProperty('pointer-events');
        else style.setProperty('pointer-events', before);
        if (!hadStyle && active.getAttribute('style') === '') active.removeAttribute('style');
      }
      if (hit !== null && active.contains(hit)) event.preventDefault();
    },
    true,
  );
}

/** Says `label` through a live region beside the button, while it is busy. */
function BusyAnnouncement({ label, anchor }: { label: string; anchor: React.RefObject<HTMLElement | null> }): null {
  const region = React.useRef<HTMLSpanElement | null>(null);
  const latest = React.useRef(label);
  React.useLayoutEffect(() => {
    const at = anchor.current;
    if (at === null) return;
    const span = at.ownerDocument.createElement('span');
    span.setAttribute('role', 'status');
    span.setAttribute('aria-live', 'polite');
    span.className = 'sr-only';
    const lang = at.closest('[lang]')?.getAttribute('lang');
    if (lang) span.lang = lang;
    (at.closest('dialog') ?? at.ownerDocument.body).append(span);
    region.current = span;
    const timer = setTimeout(() => {
      span.textContent = latest.current;
    }, 100);
    return () => {
      clearTimeout(timer);
      span.remove();
    };
  }, [anchor]);
  React.useEffect(() => {
    latest.current = label;
    if (region.current?.textContent) region.current.textContent = label;
  }, [label]);
  return null;
}

function iconSizeFor(size: ButtonSize | undefined): IconSizeChoice {
  if (size === 'xs' || size === 'xxs') return 'auto-sm';
  return size === 'lg' ? 'md' : 'auto';
}

const iconPadding = (size: IconSize): string => `calc((var(--ui-h-control) - ${ICON_METRICS[size].px}px * var(--ui-rem-scale, 1)) / 2)`;

function WithIndicator({ indicator, className, children }: { indicator: React.ReactNode; className?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <span className={cn('grid', className)}>
      <span className="col-start-1 row-start-1">{children}</span>
      <span aria-hidden data-ui-part="indicator" className="relative col-start-1 row-start-1 -me-px -mt-px self-start justify-self-end">
        {indicator}
      </span>
    </span>
  );
}

type RenderProp = Parameters<typeof useRender>[0]['render'];

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon name, or an element to show in its place. */
  icon?: IconName | React.ReactNode;
  /** Shows only the icon; `aria-label` then names the button and becomes its tooltip. */
  iconOnly?: boolean;
  iconPosition?: 'start' | 'end';
  /** The icon-only tooltip: text in place of `aria-label`, or `false` for none. */
  tooltip?: boolean | string;
  tooltipSide?: TooltipSide;
  /** A small mark, such as an unread dot, on the icon's corner. */
  indicator?: React.ReactNode;
  shortcut?: string;
  /** Keeps the shortcut's room but does not show it. */
  hideShortcut?: boolean;
  /** Shows a spinner in place of the content and ignores presses. */
  busy?: boolean;
  /** Announced while the button is busy. */
  busyLabel?: string;
  pressed?: boolean;
  /** Lines a ghost button's content up with the content around it, outside its padding. */
  flush?: ButtonFlush;
  /** Why the button is disabled; shown in a tooltip from a wrapper that stays focusable. */
  disabledReason?: React.ReactNode;
  disabledReasonSide?: TooltipSide;
  href?: string;
  target?: string;
  rel?: string;
  download?: boolean | string;
  /** Element to render as the button, keeping its own props. */
  render?: RenderProp;
  children?: React.ReactNode;
}

/** A button in one of the page's variants, with an optional icon, shortcut and tooltip. */
export const Button = React.forwardRef<HTMLElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size,
    icon,
    iconOnly = false,
    iconPosition = 'start',
    tooltip,
    tooltipSide,
    indicator,
    shortcut,
    hideShortcut = false,
    busy = false,
    busyLabel,
    pressed,
    flush = false,
    style,
    disabled,
    disabledReason,
    disabledReasonSide,
    type,
    href,
    target,
    rel,
    download,
    render,
    className,
    children,
    'aria-label': ariaLabel,
    ...rest
  },
  forwardedRef,
) {
  const isNativeButton = href === undefined && render === undefined;
  const blocksPresses = isNativeButton && busy;
  const fill = React.useRef<HTMLSpanElement | null>(null);
  const iconSize = useIconSize(iconSizeFor(size));
  const insideTooltip = useInsideTooltip();
  const isApple = isApplePlatform();

  const outset = flush === true ? 'start' : flush === false ? undefined : flush;
  const outsetSide = outset !== undefined && variant === 'ghost' ? outset : undefined;
  const hasFieldEdge = variant === 'secondary' || variant === 'accent';

  const iconElement = (extra?: string): React.ReactNode =>
    isIconName(icon) ? (
      <Icon name={icon} size={iconSize} className={extra} />
    ) : (
      <span className={extra === undefined ? 'flex' : cn(extra, 'inline-flex')}>{icon}</span>
    );

  const sideIcon = (at: 'start' | 'end'): React.ReactNode => {
    if (icon === undefined || icon === null || icon === false || iconPosition !== at) return null;
    const nudge = at === 'start' ? '-ms-1' : '-me-1';
    return indicator ? (
      <WithIndicator indicator={indicator} className={nudge}>
        {iconElement()}
      </WithIndicator>
    ) : (
      iconElement(nudge)
    );
  };

  const content =
    iconOnly && icon ? (
      indicator ? (
        <WithIndicator indicator={indicator}>{iconElement()}</WithIndicator>
      ) : (
        iconElement()
      )
    ) : (
      <>
        {sideIcon('start')}
        {children}
        {sideIcon('end')}
        {shortcut && (
          <Shortcut keys={shortcut} aria-hidden className={cn('pointer-coarse:hidden ms-1', hideShortcut && 'invisible', SHORTCUT_MARGIN)} />
        )}
      </>
    );

  const body = (
    <>
      <span aria-hidden className={cn('absolute -z-[1] rounded-[inherit] ui-btn-squish', variant === 'primary' || variant === 'danger' ? 'inset-[0.5px]' : 'inset-0')}>
        <span
          ref={fill}
          data-ui-part="paint"
          className={cn(FILL_BASE, FILL_CLASSES[variant], PRESSED_FILL, hasFieldEdge && FIELD_EDGE)}
        />
      </span>
      <span className={cn('inline-flex min-w-0 items-center gap-1', busy && 'opacity-0')}>{content}</span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size="sm" inheritColor />
        </span>
      )}
    </>
  );

  const pressFeedback = (element: HTMLElement): void => {
    const paint = fill.current?.parentElement;
    if (paint) setPressScale(paint, element.offsetHeight);
  };

  const { onClick, onKeyDown, onKeyUp, onFocus, onMouseDown, onPointerDownCapture } = rest;
  const handlers = {
    onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => {
      onMouseDown?.(event);
      keepSelectionOnMultiPress(event);
    },
    onClick: blocksPresses ? stop : onClick,
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      if (isNativeButton) guardBusyFocus(event.currentTarget);
      onFocus?.(event);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (isActivationKey(event)) {
        if (blocksPresses && isPlainActivationKey(event)) {
          stop(event);
          return;
        }
        if (event.key === ' ' && !event.repeat) pressFeedback(event.currentTarget);
        if (event.repeat && isNativeButton) event.preventDefault();
      }
      const popup = rest['aria-haspopup'];
      const opensPopup = popup !== undefined && String(popup) !== 'false' && String(rest['aria-expanded']) !== 'true';
      if (blocksPresses && opensPopup && (event.key === 'Enter' || event.key.trim() === '' || event.key.startsWith('Arrow'))) return;
      onKeyDown?.(event);
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (blocksPresses && isPlainActivationKey(event)) {
        stop(event);
        return;
      }
      onKeyUp?.(event);
    },
    onPointerDownCapture: (event: React.PointerEvent<HTMLButtonElement>) => {
      pressFeedback(event.currentTarget);
      onPointerDownCapture?.(event);
    },
  };

  const outsetStyle: React.CSSProperties | undefined =
    outsetSide === undefined
      ? undefined
      : ({ '--ui-outset-x': iconOnly ? iconPadding(iconSize) : 'var(--ui-pad-md)' } as React.CSSProperties);

  const element = useRender({
    render:
      render ??
      (href !== undefined
        ? (props) => <a {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)} />
        : (props) => <button type={type ?? 'button'} disabled={disabled} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)} />),
    ref: forwardedRef,
    props: {
      'data-ui': 'Button',
      ...(iconOnly ? { 'data-ui-icon-only': '' } : undefined),
      ...(variant === 'ghost' ? { 'data-ui-ghost': '' } : undefined),
      ...(size === 'xxs' ? { 'data-step': '1' } : size === undefined ? undefined : { 'data-size': size }),
      className: cn(
        BASE_CLASSES,
        TEXT_CLASSES[variant],
        iconOnly ? 'aspect-square w-control px-0' : 'px-md',
        blocksPresses && 'pointer-events-none',
        busy && BUSY_CURSOR,
        outsetSide !== undefined && OUTSET_CLASSES[outsetSide],
        className,
      ),
      style: outsetStyle === undefined ? style : { ...outsetStyle, ...style },
      'aria-pressed': href === undefined ? pressed : undefined,
      'aria-label': ariaLabel,
      'aria-keyshortcuts': shortcut && !hideShortcut ? parseSingleShortcut(shortcut, isApple) : undefined,
      children: body,
      ...rest,
      ...(busy ? { 'aria-busy': true } : undefined),
      ...(blocksPresses ? { 'aria-disabled': true } : undefined),
      ...handlers,
      ...(href !== undefined ? { href, target, rel, download } : undefined),
    },
  });

  const showsTooltip = iconOnly && Boolean(ariaLabel) && tooltip !== false;
  const explainsDisabled = href === undefined && Boolean(disabled) && Boolean(disabledReason);
  const withTooltip = showsTooltip ? (
    <Tooltip
      side={tooltipSide}
      content={insideTooltip || explainsDisabled ? undefined : typeof tooltip === 'string' ? tooltip : ariaLabel}
      shortcut={hideShortcut ? undefined : shortcut}
    >
      {element}
    </Tooltip>
  ) : (
    element
  );

  return (
    <>
      {disabledReason === undefined || href !== undefined ? (
        withTooltip
      ) : (
        <DisabledReasonTooltip side={disabledReasonSide} reason={explainsDisabled ? disabledReason : undefined}>
          {withTooltip}
        </DisabledReasonTooltip>
      )}
      {busy && busyLabel && <BusyAnnouncement label={busyLabel} anchor={fill} />}
    </>
  );
});
