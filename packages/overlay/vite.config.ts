import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@patch-notes-live/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@patch-notes-live/mod-api': fileURLToPath(
        new URL('../mod-api/src/index.ts', import.meta.url),
      ),
    },
  },
});
