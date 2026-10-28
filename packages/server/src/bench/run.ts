import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { createPatch as CreatePatch } from '../patch/createPatch.js';
import { isQuotaError } from '../patch/quota.js';
import type { PatchResult } from '../patch/types.js';
import { BENCH_CASES } from './cases.js';
import { summarize, summaryText, type CaseResult } from './stats.js';

export interface BenchOptions {
  indices: readonly number[];
  concurrency: number;
  directory: string;
  createPatch: typeof CreatePatch;
  log?: (line: string) => void;
  signal?: AbortSignal;
}

export async function runBenchmark(options: BenchOptions) {
  const { indices, concurrency, directory, createPatch } = options;
  if (
    !indices.length ||
    new Set(indices).size !== indices.length ||
    indices.some((index) => !Number.isInteger(index) || !BENCH_CASES[index])
  )
    throw new Error('Invalid benchmark selection.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > BENCH_CASES.length)
    throw new Error('Invalid benchmark concurrency.');
  await mkdir(directory, { recursive: true });
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const results: CaseResult[] = [],
    started = new Set<number>();
  const logs: string[] = [];
  const log = (line: string) => {
    logs.push(line);
    options.log?.(line);
  };
  const startedAt = new Date().toISOString();
  let cursor = 0,
    stoppedOnQuota = false,
    quotaCase: number | null = null;
  let completedAt: string | null = null;
  let writes = Promise.resolve();
  const snapshot = () => ({
    startedAt,
    completedAt,
    selected: [...indices],
    concurrency,
    stoppedOnQuota,
    quotaCase,
    aborted: controller.signal.aborted && !stoppedOnQuota,
    unstarted: indices.filter((index) => !started.has(index)),
    running: [...started].filter((index) => !results.some((result) => result.index === index)),
    results: [...results].sort((a, b) => a.index - b.index),
    stats: summarize(results),
  });
  const persist = () => {
    const data = JSON.stringify(snapshot(), null, 2) + '\n';
    writes = writes.then(async () => {
      await writeFile(join(directory, 'summary.json.tmp'), data);
      await rename(join(directory, 'summary.json.tmp'), join(directory, 'summary.json'));
      await writeFile(join(directory, 'output.log'), logs.join('\n') + '\n');
    });
    return writes;
  };
  const worker = async () => {
    while (!controller.signal.aborted && cursor < indices.length) {
      const test = BENCH_CASES[indices[cursor++]!]!;
      started.add(test.index);
      log(`[case ${test.index}] START expected=${test.expected}: ${test.request}`);
      const start = performance.now();
      let patch: PatchResult;
      try {
        patch = await createPatch(test.request, {
          signal: controller.signal,
          onEvent(event) {
            log(
              `[case ${test.index} +${((performance.now() - start) / 1000).toFixed(2)}s] ${event.phase}: ${event.text}`,
            );
          },
        });
      } catch (error) {
        patch = {
          status: isQuotaError(error) ? 'quota' : 'failed',
          reason: error instanceof Error ? error.message : 'Benchmark runner error.',
          durationMs: performance.now() - start,
          attempts: 0,
          threadId: null,
        };
      }
      if (patch.status === 'quota' && !stoppedOnQuota) {
        stoppedOnQuota = true;
        quotaCase = test.index;
        controller.abort();
        log(
          `STOP: quota reported by case ${test.index}. Aborting active cases; no more cases will start.`,
        );
      }
      const prefix = String(test.index).padStart(2, '0');
      const sourceFile = patch.source !== undefined ? `${prefix}.js` : null;
      const reportFile = patch.report ? `${prefix}.report.json` : null;
      if (sourceFile) await writeFile(join(directory, sourceFile), patch.source!, { flag: 'wx' });
      if (reportFile)
        await writeFile(join(directory, reportFile), JSON.stringify(patch.report, null, 2) + '\n', {
          flag: 'wx',
        });
      const result: CaseResult = {
        ...test,
        status: patch.status,
        matchedExpected: patch.status === test.expected,
        durationMs: patch.durationMs,
        attempts: patch.attempts,
        firstFailedCheck: patch.report?.checks.find((check) => !check.ok) ?? null,
        visibleEffectBySeed: patch.report?.stats.visibleEffectBySeed ?? null,
        reason: patch.reason ?? null,
        threadId: patch.threadId,
        sourceFile,
        reportFile,
        cancelled:
          controller.signal.aborted &&
          patch.status === 'failed' &&
          patch.reason === 'Patch cancelled by caller.',
      };
      results.push(result);
      log(
        `[case ${test.index}] ${patch.status} ${result.matchedExpected ? 'MATCH' : 'MISMATCH'} expected=${test.expected} duration=${(patch.durationMs / 1000).toFixed(2)}s attempts=${patch.attempts} firstFailedCheck=${result.firstFailedCheck?.id ?? 'none'}${result.cancelled ? ' (cancelled)' : ''}`,
      );
      if (result.reason) log(`[case ${test.index}] reason: ${result.reason}`);
      if (result.firstFailedCheck) log(`[case ${test.index}] ${result.firstFailedCheck.detail}`);
      log(`[case ${test.index}] visibleEffectBySeed=${JSON.stringify(result.visibleEffectBySeed)}`);
      await persist();
    }
  };
  log(`Benchmark cases ${indices.join(',')}; concurrency ${concurrency}. Results: ${directory}`);
  try {
    await persist();
    await Promise.all(
      Array.from({ length: Math.min(concurrency, indices.length) }, () => worker()),
    );
    completedAt = new Date().toISOString();
    log(summaryText(results));
    if (stoppedOnQuota)
      log(
        `INCOMPLETE: quota stopped this run. Unstarted cases: ${snapshot().unstarted.join(',') || 'none'}. No GO/NO-GO conclusion.`,
      );
    else if (controller.signal.aborted) log('INCOMPLETE: benchmark cancelled by caller.');
    await persist();
    return snapshot();
  } finally {
    controller.abort();
    options.signal?.removeEventListener('abort', abort);
  }
}
