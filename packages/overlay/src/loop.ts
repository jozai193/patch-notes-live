import type { Entity, Snapshot } from '@patch-notes-live/engine';

export const STEP = 1 / 60;
export const MAX_FRAME_SECONDS = 0.25;

/** Pure scheduling: cap catch-up after stalls; retain the fractional tick for interpolation. */
export function planFrame(accumulator: number, elapsed: number) {
  const safeElapsed = Number.isFinite(elapsed)
    ? Math.max(0, Math.min(MAX_FRAME_SECONDS, elapsed))
    : 0;
  const total = accumulator + safeElapsed;
  const ticks = Math.floor((total + 1e-10) / STEP);
  const remainder = Math.max(0, total - ticks * STEP);
  return { ticks, accumulator: remainder, alpha: remainder / STEP };
}

function interpolateAxis(from: number, to: number, alpha: number, size: number, wrap: boolean) {
  let delta = to - from;
  if (wrap && Math.abs(delta) > size / 2) delta -= Math.sign(delta) * size;
  const value = from + delta * alpha;
  return wrap ? ((value % size) + size) % size : value;
}

/** Interpolate positions only; health, deaths and newly spawned entities use the current tick. */
export function interpolateSnapshots(
  previous: Snapshot,
  current: Snapshot,
  fraction: number,
): Snapshot {
  const alpha = Math.max(0, Math.min(1, fraction));
  const old = new Map(previous.entities.map((e) => [e.id, e]));
  const interpolate = (entity: Entity): Entity => {
    const from = old.get(entity.id);
    if (!from) return { ...entity, tags: [...entity.tags] };
    return {
      ...entity,
      tags: [...entity.tags],
      x: interpolateAxis(from.x, entity.x, alpha, current.arena.width, current.arena.wrap),
      y: interpolateAxis(from.y, entity.y, alpha, current.arena.height, current.arena.wrap),
    };
  };
  const entities = current.entities.map(interpolate);
  return {
    ...current,
    entities,
    player: entities.find((e) => e.id === current.player.id) ?? interpolate(current.player),
  };
}
