import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  test: { fileParallelism: false, testTimeout: 15_000 },
  resolve: {
    alias: {
      '@patch-notes-live/mod-api/archive': fileURLToPath(new URL('../mod-api/src/archive.ts', import.meta.url)),
      '@patch-notes-live/mod-api/protocol': fileURLToPath(
        new URL('../mod-api/src/protocol.ts', import.meta.url),
      ),
      '@patch-notes-live/harness': fileURLToPath(
        new URL('../harness/src/index.ts', import.meta.url),
      ),
      '@patch-notes-live/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@patch-notes-live/mod-api': fileURLToPath(
        new URL('../mod-api/src/index.ts', import.meta.url),
      ),
    },
  },
});
