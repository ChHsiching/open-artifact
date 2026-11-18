/** The page bar's own controls: fonts and page width. */
import { fillSlot } from '../app/slots.ts';
import { FontControl } from './FontControl.tsx';
import { WidthControl } from './WidthControl.tsx';

fillSlot('pageBar', 'page-fonts', FontControl, 10);
fillSlot('pageBar', 'page-width', WidthControl, 20);
