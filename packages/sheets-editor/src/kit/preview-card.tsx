import * as React from 'react';
import { PreviewCard as BasePreviewCard } from '@base-ui/react/preview-card';
import { cn } from './cn.ts';
import { useOverlayLayer } from './layers.tsx';
import { POPUP_MOTION_CLASSES, POPUP_PADDING_CLASSES, POPUP_SURFACE_CLASSES, PopupLayerScope, type PopupPadding } from './popup-frame.tsx';

type PositionerProps = BasePreviewCard.Positioner.Props;
type OpenChangeDetails = BasePreviewCard.Root.ChangeEventDetails;

interface PreviewCardSettings {
  delay?: number;
  closeDelay?: number;
  hoverable: boolean;
}

const PreviewCardSettingsContext = React.createContext<PreviewCardSettings>({ hoverable: true });

export interface PreviewCardRootProps extends BasePreviewCard.Root.Props {
  /** Milliseconds the pointer rests on the trigger before the card opens. */
  delay?: number;
  /** Milliseconds before the card closes once the pointer leaves. */
  closeDelay?: number;
  /** Whether the pointer can move onto the card; when false, presses go through it to the page. */
  hoverable?: boolean;
  /** Keeps the card closed. */
  disabled?: boolean;
}

/** A card that previews what its trigger leads to, on hover or keyboard focus. */
function PreviewCardRoot({
  delay,
  closeDelay,
  hoverable = true,
  disabled = false,
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...rest
}: PreviewCardRootProps): React.ReactElement {
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen ?? false);
  const isOpen = !disabled && (open ?? ownOpen);
  React.useEffect(() => {
    if (disabled) setOwnOpen(false);
  }, [disabled]);
  const handleOpenChange = React.useCallback(
    (next: boolean, details: OpenChangeDetails) => {
      if (next && disabled) {
        details.cancel();
        return;
      }
      onOpenChange?.(next, details);
      if (!details.isCanceled) setOwnOpen(next);
    },
    [disabled, onOpenChange],
  );
  const settings = React.useMemo<PreviewCardSettings>(() => ({ delay, closeDelay, hoverable }), [delay, closeDelay, hoverable]);
  return (
    <PreviewCardSettingsContext.Provider value={settings}>
      <BasePreviewCard.Root {...rest} open={isOpen} onOpenChange={handleOpenChange}>
        {children}
      </BasePreviewCard.Root>
    </PreviewCardSettingsContext.Provider>
  );
}

export type PreviewCardTriggerProps = BasePreviewCard.Trigger.Props;

const PreviewCardTrigger = React.forwardRef<HTMLAnchorElement, PreviewCardTriggerProps>(function PreviewCardTrigger(props, ref) {
  const { delay, closeDelay } = React.useContext(PreviewCardSettingsContext);
  return <BasePreviewCard.Trigger ref={ref} delay={delay} closeDelay={closeDelay} {...props} />;
});

export interface PreviewCardPopupProps extends Omit<BasePreviewCard.Popup.Props, 'className'> {
  side?: PositionerProps['side'];
  align?: PositionerProps['align'];
  sideOffset?: PositionerProps['sideOffset'];
  alignOffset?: PositionerProps['alignOffset'];
  collisionPadding?: PositionerProps['collisionPadding'];
  padding?: PopupPadding;
  className?: string;
}

const PREVIEW_CARD_POPUP_CLASSES = `${POPUP_SURFACE_CLASSES} flex flex-col gap-1 min-w-[var(--preview-card-min-w,200px)] max-w-[var(--preview-card-max-w,360px)]`;

const PreviewCardPopup = React.forwardRef<HTMLDivElement, PreviewCardPopupProps>(function PreviewCardPopup(
  { side = 'bottom', align = 'start', sideOffset = 6, alignOffset, collisionPadding, padding = 'lg', className, onContextMenu, ...rest },
  ref,
) {
  const { hoverable } = React.useContext(PreviewCardSettingsContext);
  const layer = useOverlayLayer('popover');
  return (
    <BasePreviewCard.Portal>
      <PopupLayerScope layer={layer}>
        <BasePreviewCard.Positioner
          style={layer.style}
          className={hoverable ? undefined : 'pointer-events-none'}
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          collisionPadding={collisionPadding}
          positionMethod="fixed"
        >
          <BasePreviewCard.Popup
            data-ui="PreviewCard"
            ref={ref}
            {...rest}
            onContextMenu={(event) => {
              event.stopPropagation();
              onContextMenu?.(event);
            }}
            className={cn(PREVIEW_CARD_POPUP_CLASSES, POPUP_MOTION_CLASSES, POPUP_PADDING_CLASSES[padding], className)}
          />
        </BasePreviewCard.Positioner>
      </PopupLayerScope>
    </BasePreviewCard.Portal>
  );
});

PreviewCardTrigger.displayName = 'PreviewCard.Trigger';
PreviewCardPopup.displayName = 'PreviewCard.Popup';

export { PreviewCardRoot, PreviewCardTrigger, PreviewCardPopup };

export const PreviewCard = {
  Root: PreviewCardRoot,
  Trigger: PreviewCardTrigger,
  Popup: PreviewCardPopup,
};
