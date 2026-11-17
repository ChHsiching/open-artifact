/**
 * Builds the daemon's pages. This file builds the Shell (`/a/<id>`) into
 * `dist/daemon/shell/`; `vite.home.config.ts` builds the home page (`/`)
 * into `dist/daemon/home/` from the same {@link pageConfig}.
 *
 * In dev (`vite -c …`), `/api` is proxied to the daemon at `OPEN_ARTIFACT_DAEMON_URL`
 * (default `http://127.0.0.1:4800`).
 */

import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig, type UserConfig } from 'vite';

/** One of the daemon's pages. */
export type DaemonPage = 'shell' | 'home';

/** The Vite config of one daemon page: served under `/_open-artifact/<page>/`, built into `dist/daemon/<page>/`. */
export function pageConfig(page: DaemonPage): UserConfig {
  const daemon = process.env.OPEN_ARTIFACT_DAEMON_URL ?? 'http://127.0.0.1:4800';
  return {
    root: fileURLToPath(new URL(`./src/${page}`, import.meta.url)),
    base: `/_open-artifact/${page}/`,
    plugins: [tailwindcss()],
    server: {
      port: page === 'shell' ? 5180 : 5181,
      proxy: {
        '/api': {
          target: daemon,
          changeOrigin: true,
          // The daemon takes writes from its own origin only: speak as it.
          configure(proxy) {
            proxy.on('proxyReq', (request) => {
              if (request.getHeader('origin')) request.setHeader('origin', daemon);
            });
          },
        },
      },
    },
    build: {
      outDir: fileURLToPath(new URL(`../../dist/daemon/${page}`, import.meta.url)),
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        onwarn(warning, warn) {
          // Base UI marks its modules "use client"; meaningless in a client bundle.
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
  };
}

export default defineConfig(pageConfig('shell'));
