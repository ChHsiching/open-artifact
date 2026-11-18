/** The bar over a selected picture: Crop, and a menu to copy it, describe it, size it, replace it or delete it. */
import { Card, ChromeDivider, ChromeMenu, ChromeMenuItem, ChromeMenuSeparator, ChromeSubmenu, TipButton } from '@open-artifact/editor-kit/react';
import { Copy, Crop, Ellipsis, ImageUp, Maximize2, Trash2, Type } from 'lucide-react';
import { type FocusEvent, type MouseEvent, type ReactNode, useEffect, useState } from 'react';
import { copyImage, deleteImage, findTarget, openAltText, setImageSize, startCrop } from './actions.ts';
import { IMAGE_SIZES, sizeOf } from './geometry.ts';
import { type ImageTarget, getImages } from './store.ts';
import { canAddImages, replaceImage } from './upload.ts';
import type { MediaBox } from './useMediaBox.ts';

/** Height of the bar and its gap to the picture. */
const BAR_HEIGHT = 36;
const GAP = 8;

/** Keeps the editor's selection (and its keyboard) while a button of the bar is pressed. */
const keepSelection = (event: MouseEvent) => event.preventDefault();

export function ImageToolbar({ target, box, writable, onMenu }: { target: ImageTarget; box: MediaBox; writable: boolean; onMenu: (open: boolean) => void }): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const found = findTarget(target);
  const node = found?.node ?? null;
  const size = sizeOf(node?.attrs.width);
  const below = box.top < BAR_HEIGHT + GAP;
  const style = {
    left: box.left + box.width / 2,
    top: below ? box.top + box.height + GAP : box.top - GAP,
    transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
  };
  // The bar stays up while its menu is open or a part of it has the keyboard, as the editor then doesn't.
  useEffect(() => {
    onMenu(menuOpen || focusWithin);
    return () => onMenu(false);
  }, [menuOpen, focusWithin, onMenu]);
  const openMenu = (open: boolean) => {
    setMenuOpen(open);
    if (open) return;
    // Once the menu has closed, the keyboard goes back to the picture, unless what was chosen opened a place of its own.
    setTimeout(() => {
      const images = getImages();
      if (!images.alt && !images.crop) findTarget(target)?.view.focus();
    });
  };
  const leave = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setFocusWithin(false);
  };

  return (
    <Card className="doc-image-bar absolute z-30 p-1" style={style} role="toolbar" aria-label="Image actions" onMouseDown={keepSelection} onFocus={() => {
        setFocusWithin(true);
        onMenu(true);
      }} onBlur={leave} data-image-bar="">
      {writable ? (
        <>
          <TipButton tip="Crop" aria-label="Crop image" square onClick={() => startCrop(target)}>
            <Crop className="size-4" strokeWidth={1.75} />
          </TipButton>
          <ChromeDivider />
        </>
      ) : null}
      <ChromeMenu
        open={menuOpen}
        onOpenChange={openMenu}
        align="end"
        mark="data-image-bar"
        trigger={
          <TipButton tip="More actions" aria-label="More actions" square pressed={menuOpen}>
            <Ellipsis className="size-4" strokeWidth={1.75} />
          </TipButton>
        }
      >
        <ChromeMenuItem icon={<Copy className="size-4" />} onSelect={() => copyImage(target)}>
          Copy image
        </ChromeMenuItem>
        {writable ? (
          <>
            <ChromeMenuItem icon={<Type className="size-4" />} onSelect={() => openAltText(target)}>
              Edit alt text
            </ChromeMenuItem>
            <ChromeSubmenu label="Set image size" icon={<Maximize2 className="size-4" />} mark="data-image-bar">
              {IMAGE_SIZES.map(item => (
                <ChromeMenuItem key={item.width} checked={size === item.width} onSelect={() => setImageSize(target, item.width)}>
                  {item.label}
                </ChromeMenuItem>
              ))}
            </ChromeSubmenu>
            {canAddImages() ? (
              <ChromeMenuItem icon={<ImageUp className="size-4" />} onSelect={() => void replaceImage(found?.pos ?? target.pos)}>
                Replace image
              </ChromeMenuItem>
            ) : null}
            <ChromeMenuSeparator />
            <ChromeMenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => deleteImage(target)}>
              Delete image
            </ChromeMenuItem>
          </>
        ) : null}
      </ChromeMenu>
    </Card>
  );
}
