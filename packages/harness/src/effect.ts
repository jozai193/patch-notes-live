import type { Snapshot } from '@patch-notes-live/engine';
import type { VisibleEffect } from './types.js';

export function emptyEffect(): VisibleEffect {
  return {
    playerMaxOffset: 0,
    meanEnemyOffset: 0,
    maxEntityCountDifference: 0,
    colorChanged: false,
    maxRadiusDifference: 0,
    physicsChanged: false,
    arenaChanged: false,
    uiEvents: 0,
    ticksObserved: 0,
  };
}

export function visible(effect: VisibleEffect): boolean {
  return (
    effect.playerMaxOffset >= 40 ||
    effect.meanEnemyOffset >= 20 ||
    effect.maxEntityCountDifference >= 3 ||
    effect.colorChanged ||
    effect.maxRadiusDifference >= 2 ||
    effect.physicsChanged ||
    effect.arenaChanged ||
    effect.uiEvents > 0
  );
}

/** Compare visible properties only, matching entity IDs and kinds across identical-input runs. */
export class EffectTracker {
  readonly metrics = emptyEffect();
  private enemyDistance = 0;
  private enemySamples = 0;

  observe(actual: Snapshot, baseline: Snapshot, uiEvents: number, tick: number): void {
    const m = this.metrics;
    m.ticksObserved = tick;
    m.playerMaxOffset = Math.max(
      m.playerMaxOffset,
      Math.hypot(actual.player.x - baseline.player.x, actual.player.y - baseline.player.y),
    );
    m.maxEntityCountDifference = Math.max(
      m.maxEntityCountDifference,
      Math.abs(actual.entities.length - baseline.entities.length),
    );
    const original = new Map(baseline.entities.map((entity) => [entity.id, entity]));
    for (const entity of actual.entities) {
      const other = original.get(entity.id);
      if (!other || other.kind !== entity.kind) continue;
      if (entity.kind === 'enemy') {
        this.enemyDistance += Math.hypot(entity.x - other.x, entity.y - other.y);
        this.enemySamples++;
      }
      m.colorChanged ||= entity.color !== other.color;
      m.maxRadiusDifference = Math.max(
        m.maxRadiusDifference,
        Math.abs(entity.radius - other.radius),
      );
    }
    m.meanEnemyOffset = this.enemyDistance / Math.max(1, this.enemySamples);
    m.physicsChanged ||= JSON.stringify(actual.physics) !== JSON.stringify(baseline.physics);
    m.arenaChanged ||= JSON.stringify(actual.arena) !== JSON.stringify(baseline.arena);
    m.uiEvents += uiEvents;
  }
}

export function effectDetail(m: VisibleEffect): string {
  return `player max offset ${m.playerMaxOffset.toFixed(2)}px, mean enemy offset ${m.meanEnemyOffset.toFixed(2)}px, count difference ${m.maxEntityCountDifference}, radius difference ${m.maxRadiusDifference.toFixed(2)}px, color ${m.colorChanged}, physics ${m.physicsChanged}, arena ${m.arenaChanged}, UI events ${m.uiEvents}`;
}
