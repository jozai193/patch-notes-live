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
    visibleEffectBySeed: Record<number, VisibleEffect>;
  };
  durationMs: number;
}
export interface VisibleEffect {
  playerMaxOffset: number;
  meanEnemyOffset: number;
  maxEntityCountDifference: number;
  colorChanged: boolean;
  shapeChanged: boolean;
  glowChanged: boolean;
  maxRadiusDifference: number;
  physicsChanged: boolean;
  arenaChanged: boolean;
  uiEvents: number;
  ticksObserved: number;
}
export interface VerifyOptions {
  signal?: AbortSignal;
}
