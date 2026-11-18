/**
 * Pictures from the insert menus: the file picker opens here, and what is chosen goes to the picture feature, which
 * sets itself as the picker. Without one, the menus offer no Image item.
 */
import type { EditorView } from 'prosemirror-view';
import { create } from 'zustand';

/** Puts the chosen picture files in at the view's caret. */
export type ImagePicker = (files: File[], view: EditorView) => void;

const useImagePickerStore = create<{ picker: ImagePicker | null }>(() => ({ picker: null }));

/** Sets (or, with null, clears) what the Image item hands its chosen files to. */
export function setImagePicker(picker: ImagePicker | null): void {
  useImagePickerStore.setState({ picker });
}

export const canPickImage = (): boolean => useImagePickerStore.getState().picker !== null;

export const useCanPickImage = (): boolean => useImagePickerStore(state => state.picker !== null);

/** Opens the file picker for pictures; what is chosen is put in at the caret. */
export function chooseImage(view: EditorView): void {
  const picker = useImagePickerStore.getState().picker;
  if (!picker) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener(
    'change',
    () => {
      const files = [...(input.files ?? [])];
      if (files.length) picker(files, view);
    },
    { once: true },
  );
  input.click();
}
