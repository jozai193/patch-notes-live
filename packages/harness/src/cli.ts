import { readFile } from 'node:fs/promises';
import { verify } from './verify.js';
import type { Report } from './types.js';

export function summary(report: Report): string {
  const lines = [
    `${report.ok ? 'PASS' : 'FAIL'} — ${report.checks.filter((c) => c.ok).length}/${report.checks.length} checks (${(report.durationMs / 1000).toFixed(3)} s)`,
  ];
  for (const c of report.checks) lines.push(`${c.ok ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
  lines.push(
    `Max entities ${report.stats.maxEntities}; peak budget ${report.stats.peakBudgetPct.toFixed(2)}%; sandbox p95 ${report.stats.sandboxMsP95.toFixed(3)} ms/tick.`,
  );
  return lines.join('\n');
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'verify') args = args.slice(1);
  const json = args.includes('--json');
  const files = args.filter((a) => a !== '--json');
  if (files.length !== 1 || files[0]!.startsWith('--')) {
    process.stderr.write(
      'Usage: npm run verify -- <file> [--json]\nOr: node /absolute/path/packages/harness/verify.mjs <file> [--json]\n',
    );
    return 2;
  }
  try {
    const source = await readFile(files[0]!, 'utf8');
    const report = await verify(source);
    if (json) {
      process.stdout.write(JSON.stringify(report) + '\n');
      process.stderr.write(summary(report) + '\n');
    } else process.stdout.write(summary(report) + '\n');
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown harness error';
    process.stderr.write(
      `Harness error: ${message}. Fix: check the input path, Node 24 installation, and workspace dependencies, then retry.\n`,
    );
    return 2;
  }
}
