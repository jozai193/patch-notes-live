import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@patch-notes-live/mod-api/archive': fileURLToPath(new URL('../mod-api/src/archive.ts', import.meta.url)),
      '@patch-notes-live/mod-api/protocol': fileURLToPath(
        new URL('../mod-api/src/protocol.ts', import.meta.url),
      ),
      '@patch-notes-live/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@patch-notes-live/mod-api': fileURLToPath(
        new URL('../mod-api/src/index.ts', import.meta.url),
      ),
    },
  },
});
