import { resolve } from 'node:path';
import { createPatch } from '../patch/createPatch.js';
import { repoRoot } from '../patch/workspace.js';
import { parseArgs } from './cases.js';
import { runBenchmark } from './run.js';

export async function main(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  try {
    const directory = resolve(
      repoRoot,
      'bench-results',
      new Date().toISOString().replace(/[:.]/g, '-'),
    );
    const result = await runBenchmark({
      ...parsed,
      directory,
      createPatch,
      signal: controller.signal,
      log: (line) => process.stdout.write(line + '\n'),
    });
    process.stdout.write(`Summary saved to ${resolve(directory, 'summary.json')}\n`);
    return result.stoppedOnQuota
      ? 75
      : result.aborted
        ? 130
        : result.results.every((row) => row.matchedExpected)
          ? 0
          : 1;
  } finally {
    process.removeListener('SIGINT', stop);
  }
}
