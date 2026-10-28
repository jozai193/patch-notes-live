import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { botIntent, ENTITY_CAP, World } from '@patch-notes-live/engine';
import type { Intent, Snapshot } from '@patch-notes-live/engine';
import { SandboxHost } from '@patch-notes-live/mod-api';
import type { Fault } from '@patch-notes-live/mod-api';
import type { VerifyOptions } from './types.js';
import type { VisibleEffect } from './types.js';
import { EffectTracker } from './effect.js';

export const TICKS = 3600;
export const EFFECT_TICKS = 900;
export interface Run {
  seed: number;
  hash: string;
  intents: Intent[];
  survival: number;
  maxEntities: number;
  maxPolls: number;
  maxCappedTicks: number;
  samples: number[];
  firstFault: Fault | undefined;
  budgetFault: Fault | undefined;
  loaded: boolean;
  disabled: boolean;
  visibleEffect: VisibleEffect;
}

export async function run(
  source: string,
  seed: number,
  options: VerifyOptions,
  replay?: readonly Intent[],
  compareBaseline = false,
): Promise<Run> {
  options.signal?.throwIfAborted();
  const host = await SandboxHost.create([source]);
  const loaded = !host.faults.some((f) => f.hook === 'load');
  const effect = new EffectTracker();
  let snapshot: Snapshot;
  const result: Run = {
    seed,
    hash: '',
    intents: [],
    survival: 0,
    maxEntities: 0,
    maxPolls: 0,
    maxCappedTicks: 0,
    samples: [],
    firstFault: undefined,
    budgetFault: undefined,
    loaded,
    disabled: false,
    visibleEffect: effect.metrics,
  };
  try {
    const world = new World(seed, host);
    let baseline = compareBaseline ? new World(seed) : undefined;
    snapshot = world.snapshot();
    result.maxPolls = host.mods[0]!.maxInterruptsPerTick;
    result.disabled = host.mods[0]!.disabled;
    result.maxEntities = snapshot.entities.length;
    const initialEvents = world.drainEvents().length;
    if (baseline) effect.observe(snapshot, baseline.snapshot(), initialEvents, 0);
    let cappedTicks = 0;
    for (let i = 0; i < TICKS; i++) {
      const intent = replay?.[i] ?? botIntent(snapshot);
      if (!replay) result.intents.push(intent);
      const alive = !snapshot.gameOver;
      world.tick(intent);
      snapshot = world.snapshot();
      const uiEvents = world.drainEvents().length;
      if (alive) {
        const mod = host.mods[0]!;
        result.samples.push(mod.timeThisTickMs);
        result.maxPolls = Math.max(
          result.maxPolls,
          mod.interruptsThisTick,
          mod.maxInterruptsPerTick,
        );
        result.disabled ||= mod.disabled;
        cappedTicks = snapshot.entities.length >= ENTITY_CAP ? cappedTicks + 1 : 0;
        result.maxCappedTicks = Math.max(result.maxCappedTicks, cappedTicks);
        result.maxEntities = Math.max(result.maxEntities, snapshot.entities.length);
      }
      if (baseline && i < EFFECT_TICKS) {
        baseline.tick(intent);
        effect.observe(snapshot, baseline.snapshot(), uiEvents, i + 1);
        if (i + 1 === EFFECT_TICKS) baseline = undefined;
      }
      if ((i + 1) % 600 === 0) {
        options.signal?.throwIfAborted();
        await setImmediate();
      }
    }
    result.survival = snapshot.time;
    result.hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  } finally {
    host.dispose();
    result.firstFault = host.faults[0];
    result.budgetFault = host.faults.find((f) => f.kind === 'interrupt');
    result.disabled ||= host.mods[0]!.disabled;
  }
  return result;
}
