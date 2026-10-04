/// <reference types="vitest/config" />
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes the app-shell file list into dist/sw.js so the service worker
 * precaches everything needed to start with no signal. The list changes with
 * every build, so each deploy also installs a fresh service worker.
 */
function precacheShell(): Plugin {
  let outDir = 'dist';
  return {
    name: 'precache-shell',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const full = join(dir, f);
          const rel = relative(outDir, full).split('\\').join('/');
          if (statSync(full).isDirectory()) {
            // Data comes from offline packs; models and the ONNX runtime only matter online (scanning needs imagery).
            if (!['data', 'models', 'ort', 'bears/fine'].includes(rel)) walk(full);
          } else if (!/\.(wasm|map)$/.test(f) && rel !== 'sw.js') files.push(rel);
        }
      };
      walk(outDir);
      const sw = join(outDir, 'sw.js');
      writeFileSync(sw, readFileSync(sw, 'utf8').replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(files.sort())};`));
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; CI sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  worker: { format: 'es' },
  plugins: [precacheShell()],
  build: {
    target: ['es2022', 'safari16'],
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
