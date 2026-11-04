import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repoRoot } from './patch/workspace.js';
import type { ArchivedMod, ArchiveEntry } from '@patch-notes-live/mod-api/archive';
export async function loadArchive(): Promise<ArchivedMod[]> {
  const directory = resolve(repoRoot, 'mods/archive');
  const entries = JSON.parse(
    await readFile(resolve(directory, 'index.json'), 'utf8'),
  ) as ArchiveEntry[];
  if (!Array.isArray(entries)) throw Error('Invalid archive index');
  return Promise.all(
    entries.map(async (entry) => {
      if (!/^[a-z0-9-]+\.js$/.test(entry.file)) throw Error('Invalid archive filename');
      return { ...entry, source: await readFile(resolve(directory, entry.file), 'utf8') };
    }),
  );
}
