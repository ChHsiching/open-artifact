/** Builds the Sheets editor into the type server's asset folder. */

import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { chartFramePage } from './chart-frame-page.ts';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Served under /sheets/<token>/, so every URL must be relative.
  base: './',
  plugins: [tailwindcss(), chartFramePage()],
  worker: { format: 'es' },
  build: {
    outDir: fileURLToPath(new URL('../../dist/server/editors/sheets', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    // The workbook engine is a file of its own, fetched by the worker.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      onwarn(warning, warn) {
        // Base UI marks its modules "use client"; meaningless in a client bundle.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
});
