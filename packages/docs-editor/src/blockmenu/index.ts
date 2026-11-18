/** The element menu: a handle beside the block under the pointer. */
import { fillSlot } from '../app/slots.ts';
import { BlockHandle } from './BlockHandle.tsx';

fillSlot('layer', 'block-handle', BlockHandle, 5);
