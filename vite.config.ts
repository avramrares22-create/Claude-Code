/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  worker: { format: 'es' },
  build: {
    target: ['es2022', 'safari16'],
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
