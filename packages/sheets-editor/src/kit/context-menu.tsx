import * as React from 'react';
import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { ContextMenuRoot, Menu, type MenuPopupProps } from './menu.tsx';

export type { ContextMenuRootProps } from './menu.tsx';

export type ContextMenuTriggerProps = BaseContextMenu.Trigger.Props;

const ContextMenuTrigger = React.forwardRef<HTMLDivElement, ContextMenuTriggerProps>(function ContextMenuTrigger(props, ref) {
  return <BaseContextMenu.Trigger ref={ref} {...props} />;
});

/** The popup of a context menu: at the pointer, at `anchor`, or as a sheet on a small touch screen. */
const ContextMenuPopup = React.forwardRef<HTMLDivElement, MenuPopupProps>(function ContextMenuPopup(props, ref) {
  return <Menu.Popup ref={ref} data-ui="ContextMenu" {...props} />;
});

ContextMenuTrigger.displayName = 'ContextMenu.Trigger';
ContextMenuPopup.displayName = 'ContextMenu.Popup';

export const ContextMenu = {
  Root: ContextMenuRoot,
  Trigger: ContextMenuTrigger,
  Popup: ContextMenuPopup,
  Item: Menu.Item,
  Separator: Menu.Separator,
  Group: Menu.Group,
  GroupLabel: Menu.GroupLabel,
  Header: Menu.Header,
  Submenu: Menu.Submenu,
  SubmenuTrigger: Menu.SubmenuTrigger,
  SubmenuPopup: Menu.Popup,
};
