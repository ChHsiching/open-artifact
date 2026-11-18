/** Pictures: pasting, dropping and picking them, the bar over a selected one, its alt text, size, crop and width. */
import { fillSlot } from '../app/slots.ts';
import { addEditorExtension } from '../editor/DocEditor.tsx';
import { setImagePicker } from '../insert/image.ts';
import { AltTextDialog } from './AltTextDialog.tsx';
import { ImageLayer } from './ImageLayer.tsx';
import { imagePlugins } from './plugin.ts';
import { addImageFiles } from './upload.ts';
import './images.css';

export { canAddImages, pickImage } from './upload.ts';

addEditorExtension({ plugins: imagePlugins });
fillSlot('layer', 'images', ImageLayer, 30);
fillSlot('overlay', 'images-alt-text', AltTextDialog, 30);
setImagePicker((files, view) => {
  addImageFiles(view, files);
});
