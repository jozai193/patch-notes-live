import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'font-licenses',
      generateBundle() {
        const names = ['bricolage-grotesque', 'dm-sans', 'ibm-plex-mono'];
        this.emitFile({
          type: 'asset',
          fileName: 'licenses/fonts.txt',
          source: names
            .map(
              (name) =>
                `${name}\n\n${readFileSync(new URL(`../../node_modules/@fontsource/${name}/LICENSE`, import.meta.url), 'utf8')}`,
            )
            .join('\n\n'),
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@patch-notes-live/mod-api/archive': fileURLToPath(
        new URL('../mod-api/src/archive.ts', import.meta.url),
      ),
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
