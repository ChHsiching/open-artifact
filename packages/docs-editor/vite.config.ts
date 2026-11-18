/** Builds the Docs editor into the type server's asset folder. */

import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Served under /docs/<token>/, so every URL must be relative.
  base: './',
  plugins: [tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/server/editors/docs', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
});
