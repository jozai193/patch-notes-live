import type { Entity, EntityFields } from './types.js';
export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));
export const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const color = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const cloneEntity = (e: Entity): Entity => ({ ...e, tags: [...e.tags] });
export function fields(value: unknown): EntityFields | undefined {
  if (!record(value)) return;
  const output: EntityFields = {};
  const ranges = {
    x: [-4096, 4096],
    y: [-4096, 4096],
    vx: [-600, 600],
    vy: [-600, 600],
    radius: [1, 64],
    hp: [0, 1000],
    maxHp: [1, 1000],
    speed: [0, 400],
  } as const;
  for (const [key, v] of Object.entries(value)) {
    if (key in ranges && Object.hasOwn(ranges, key)) {
      if (!finite(v)) return;
      const k = key as keyof typeof ranges;
      output[k] = clamp(v, ranges[k][0], ranges[k][1]);
    } else if (key === 'color' && color(v)) output.color = v;
    else if (key === 'tags' && Array.isArray(v) && v.every((t) => typeof t === 'string'))
      output.tags = v.slice(0, 16).map((t) => t.slice(0, 32));
    else return;
  }
  return output;
}
