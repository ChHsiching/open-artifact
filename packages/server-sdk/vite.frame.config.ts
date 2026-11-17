/**
 * Builds the frame shell's comment views (src/frame/client/comments-ui) into
 * frame-host's client folder as one classic script and one stylesheet:
 * `comments.js` (sets `window.__openArtifactFrameComments`) and `comments.css`.
 * scripts/build.mjs runs it after the plain client scripts.
 */

import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [tailwindcss()],
  // A library build leaves `process.env.NODE_ENV` to the bundler; React reads it.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: process.env.OPEN_ARTIFACT_FRAME_CLIENT_OUT || fileURLToPath(new URL('../../dist/daemon/frame-host/client', import.meta.url)),
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 3000,
    lib: {
      entry: fileURLToPath(new URL('src/frame/client/comments-ui/main.tsx', import.meta.url)),
      formats: ['iife'],
      name: 'OpenArtifactFrameComments',
      fileName: () => 'comments.js',
      cssFileName: 'comments',
    },
    rollupOptions: {
      onwarn(warning, warn) {
        // Base UI marks its modules "use client"; meaningless in a client bundle.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
});
