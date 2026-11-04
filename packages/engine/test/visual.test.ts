import { expect, it } from 'vitest';
import { World } from '../src/index.js';

it('validates visual fields on commands and hook copies and keeps collision radius independent', () => {
  const w = new World(1, {
    onSpawn(_g, e) {
      if (e.kind === 'enemy') {
        e.shape = 'star';
        e.glow = 4;
      }
    },
  });
  w.applyCommands([{ type: 'spawn', kind: 'enemy', opts: { x: 100, y: 100 } }]);
  expect(w.snapshot().entities[1]).toMatchObject({ shape: 'star', glow: 1, radius: 12 });
  expect(
    w.applyCommands([
      { type: 'setEntity', id: 1, fields: { shape: 'octopus' } },
      { type: 'setEntity', id: 1, fields: { glow: NaN } },
      { type: 'setEntity', id: 1, fields: { shape: 'diamond', glow: -1 } },
    ]),
  ).toEqual([false, false, true]);
  expect(w.snapshot().player).toMatchObject({ shape: 'diamond', glow: 0 });
});
it('caps bursts across calls, hooks and drains at 120 per tick and resets on the next tick', () => {
  const w = new World(1, {
    onTick(g) {
      g.fx.burst(50, 50, '#ff0000', 1000);
    },
  });
  const burst = { type: 'burst', x: -1, y: 9999, color: '#abcdef', count: 99.9 };
  expect(w.applyCommands([burst, burst, burst, burst])).toEqual([true, true, true, false]);
  expect(w.drainEvents()).toEqual(
    Array(3).fill({ type: 'burst', x: 0, y: 640, color: '#abcdef', count: 40 }),
  );
  expect(w.applyCommands([burst])).toEqual([false]);
  w.tick();
  expect(w.drainEvents()).toEqual([{ type: 'burst', x: 50, y: 50, color: '#ff0000', count: 40 }]);
  expect(
    w.applyCommands([
      { ...burst, x: NaN },
      { ...burst, count: Infinity },
      { ...burst, color: 'red' },
    ]),
  ).toEqual([false, false, false]);
  const before = w.snapshot().rngState;
  w.applyCommands([burst]);
  expect(w.snapshot().rngState).toBe(before);
});
