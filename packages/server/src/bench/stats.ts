import type { Check, VisibleEffect } from '@patch-notes-live/harness';
import type { PatchResult } from '../patch/types.js';
import type { BenchCase } from './cases.js';

export interface CaseResult extends BenchCase {
  status: PatchResult['status'];
  matchedExpected: boolean;
  durationMs: number;
  attempts: number;
  firstFailedCheck: Check | null;
  visibleEffectBySeed: Record<number, VisibleEffect> | null;
  reason: string | null;
  threadId: string | null;
  sourceFile: string | null;
  reportFile: string | null;
  cancelled: boolean;
}

export function summarize(results: readonly CaseResult[]) {
  // Quota and cancelled siblings are not completed quality/latency measurements.
  const completed = results.filter((result) => result.status !== 'quota' && !result.cancelled);
  const rules = completed.filter((result) => result.expected === 'ok');
  const rulesPassed = rules.filter((result) => result.status === 'ok').length;
  const invalid = completed.filter((result) => result.expected === 'rejected');
  const durations = completed.map((result) => result.durationMs).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  return {
    completed: completed.length,
    matched: completed.filter((result) => result.matchedExpected).length,
    gameRulesPassed: rulesPassed,
    gameRulesCompleted: rules.length,
    gameRulePassRate: rules.length ? rulesPassed / rules.length : null,
    correctRejections: invalid.filter((result) => result.status === 'rejected').length,
    rejectionCasesCompleted: invalid.length,
    falseRejections: rules.filter((result) => result.status === 'rejected').length,
    falseAcceptances: invalid.filter((result) => result.status === 'ok').length,
    medianDurationMs: durations.length
      ? durations.length % 2
        ? durations[middle]!
        : (durations[middle - 1]! + durations[middle]!) / 2
      : null,
    p90DurationMs: durations.length ? durations[Math.ceil(durations.length * 0.9) - 1]! : null,
    retriesUsed: results.reduce((count, result) => count + Math.max(0, result.attempts - 1), 0),
  };
}

export function summaryText(results: readonly CaseResult[]): string {
  const s = summarize(results);
  return [
    `Matched expected: ${s.matched}/${s.completed} completed cases.`,
    `Game-rule pass rate: ${s.gameRulesPassed}/${s.gameRulesCompleted} (${s.gameRulePassRate === null ? 'n/a' : (100 * s.gameRulePassRate).toFixed(1) + '%'}).`,
    `Correct rejections: ${s.correctRejections}/${s.rejectionCasesCompleted}; false rejections: ${s.falseRejections}; false acceptances: ${s.falseAcceptances}.`,
    `Duration median: ${s.medianDurationMs === null ? 'n/a' : (s.medianDurationMs / 1000).toFixed(2) + 's'}; p90: ${s.p90DurationMs === null ? 'n/a' : (s.p90DurationMs / 1000).toFixed(2) + 's'}; retries used: ${s.retriesUsed}.`,
  ].join('\n');
}
