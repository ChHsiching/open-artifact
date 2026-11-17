/** Builds the daemon's home page (`/`) into `dist/daemon/home/`. See `vite.config.ts`. */

import { defineConfig } from 'vite';
import { pageConfig } from './vite.config.ts';

export default defineConfig(pageConfig('home'));
