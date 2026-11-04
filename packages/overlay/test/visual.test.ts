import { expect, it } from 'vitest';
import { World } from '@patch-notes-live/engine';
import { Effects } from '../src/effects.js';
import { entityShape } from '../src/sprites.js';
it('uses distinct default silhouettes while honoring mod overrides', () => {
  const player = new World().snapshot().player;
  expect(entityShape(player)).toBe('ship');
  expect(entityShape({ ...player, kind: 'enemy', radius: 8 })).toBe('triangle');
  expect(entityShape({ ...player, kind: 'enemy', radius: 9 })).toBe('hex');
  expect(entityShape({ ...player, kind: 'hazard' })).toBe('pool');
  expect(entityShape({ ...player, kind: 'pickup' })).toBe('diamond');
  expect(entityShape({ ...player, shape: 'square' })).toBe('square');
});
it('keeps hit, particle and glitch state entirely outside snapshots and the simulation RNG', () => {
  const w = new World(1),
    previous = w.snapshot();
  w.applyCommands([{ type: 'setEntity', id: 1, fields: { hp: 75 } }]);
  const current = w.snapshot();
  const json = JSON.stringify([previous, current]);
  const effects = new Effects();
  effects.observe(previous, current);
  effects.kill({ ...current.player, kind: 'enemy' });
  effects.accept([{ type: 'burst', x: 10, y: 20, color: '#ffffff', count: 40 }]);
  effects.rewrite('Neon');
  expect(effects.isHit(1)).toBe(true);
  expect(effects.rewriting).toBe(true);
  effects.update(0.61);
  effects.offset();
  expect(effects.rewriting).toBe(false);
  expect(JSON.stringify([previous, current])).toBe(json);
  expect(w.snapshot().rngState).toBe(previous.rngState);
});
