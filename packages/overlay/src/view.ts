import type { Arena, Vec } from '@patch-notes-live/engine';

export const CANVAS_WIDTH = 840;
export const CANVAS_HEIGHT = 560;

export function arenaView(arena: Arena) {
  const scale = Math.min(CANVAS_WIDTH / arena.width, CANVAS_HEIGHT / arena.height);
  return {
    scale,
    x: (CANVAS_WIDTH - arena.width * scale) / 2,
    y: (CANVAS_HEIGHT - arena.height * scale) / 2,
  };
}

export function aimAt(
  point: Vec,
  bounds: { left: number; top: number; width: number; height: number },
  arena: Arena,
): Vec {
  const view = arenaView(arena);
  return {
    x: (((point.x - bounds.left) / bounds.width) * CANVAS_WIDTH - view.x) / view.scale,
    y: (((point.y - bounds.top) / bounds.height) * CANVAS_HEIGHT - view.y) / view.scale,
  };
}

export function readOptions(search: string) {
  const params = new URLSearchParams(search);
  const rawSeed = params.get('seed');
  const value = rawSeed === null || rawSeed.trim() === '' ? 1 : Number(rawSeed);
  return {
    seed: Number.isFinite(value) ? Math.trunc(value) >>> 0 : 1,
    bot: params.get('bot') === '1',
    obs: params.get('obs') === '1',
  };
}
