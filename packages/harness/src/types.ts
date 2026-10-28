export type CheckId =
  'load' | 'stability' | 'budget' | 'runaway' | 'winnable' | 'effect' | 'determinism';
export interface Check {
  id: CheckId;
  ok: boolean;
  detail: string;
}
export interface Report {
  ok: boolean;
  checks: Check[];
  stats: {
    survivalSecondsBySeed: Record<number, number>;
    maxEntities: number;
    peakBudgetPct: number;
    sandboxMsP95: number;
  };
  durationMs: number;
}
export interface VerifyOptions {
  signal?: AbortSignal;
}
