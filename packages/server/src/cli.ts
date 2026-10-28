import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPatch } from './patch/createPatch.js';
import { repoRoot } from './patch/workspace.js';
import { liveRequest } from './live-client.js';

export async function main(args: string[]): Promise<number> {
  const apply = args.length === 2 && args[1] === '--apply';
  if (apply) args = args.slice(0, 1);
  if (args.length !== 1 || !args[0]?.trim()) {
    process.stderr.write('Usage: npm run patch -- "one game rule" [--apply]\n');
    return 2;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  const start = performance.now();
  try {
    const result = await createPatch(args[0], {
      signal: controller.signal,
      onEvent(event) {
        process.stdout.write(
          `[${((performance.now() - start) / 1000).toFixed(2)}s] ${event.phase}: ${event.text}\n`,
        );
      },
    });
    if (result.status === 'ok' && result.source && result.report) {
      const directory = resolve(repoRoot, 'mods/generated');
      await mkdir(directory, { recursive: true });
      const slug =
        args[0]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60) || 'rule';
      const name = `${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await writeFile(resolve(directory, `${name}.js`), result.source, { flag: 'wx' });
      await writeFile(
        resolve(directory, `${name}.report.json`),
        JSON.stringify(result.report, null, 2) + '\n',
        { flag: 'wx' },
      );
      process.stdout.write(`Saved mods/generated/${name}.js and ${name}.report.json\n`);
      if (apply) {
        const live = await liveRequest({
          type: 'applyRequest',
          source: result.source,
          author: 'Codex',
        });
        process.stdout.write(`Live hub: ${JSON.stringify(live)}\n`);
        if (!live.ok) return 1;
      }
    }
    // Source is saved above; keep terminal output short, with the complete independent report.
    const { source: _source, ...printable } = result;
    void _source;
    process.stdout.write(JSON.stringify(printable, null, 2) + '\n');
    return result.status === 'ok' ? 0 : result.status === 'timeout' ? 124 : 1;
  } finally {
    process.removeListener('SIGINT', stop);
  }
}
