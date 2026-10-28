import { expect, it } from 'vitest';
import { botIntent, IDLE_INTENT, World } from '../src/index.js';

it('a single +300 vx enemy push adds at least 60px over a second and then fades', () => {
  const baseline = new World(1, { onHit: () => ({ cancel: true }) });
  const pushed = new World(1, { onHit: () => ({ cancel: true }) });
  for (const world of [baseline, pushed])
    world.applyCommands([{ type: 'spawn', kind: 'enemy', opts: { x: 200, y: 100, speed: 0 } }]);
  pushed.applyCommands([{ type: 'setEntity', id: 2, fields: { vx: 300 } }]);
  const enemy = (world: World) => world.snapshot().entities.find((entity) => entity.id === 2)!;
  expect(enemy(pushed).vx).toBe(150);
  for (let i = 0; i < 60; i++) for (const world of [baseline, pushed]) world.tick(IDLE_INTENT);
  expect(enemy(pushed).x - enemy(baseline).x).toBeGreaterThanOrEqual(60);
  expect(enemy(pushed).vx).toBeLessThan(50);
  for (let i = 0; i < 240; i++) pushed.tick(IDLE_INTENT);
  expect(enemy(pushed).vx).toBeLessThan(1);
});

it('hook mutations and g.set both push steered entities without cancelling their controls', () => {
  for (const explicit of [false, true]) {
    const baseline = new World(1);
    const pushed = new World(1, {
      onTick(g) {
        if (g.time > 1 / 60) return;
        if (explicit) g.set(g.player, { vx: g.player.vx + 300 });
        else g.player.vx += 300;
      },
    });
    for (let i = 0; i < 60; i++) for (const world of [baseline, pushed]) world.tick(IDLE_INTENT);
    expect(pushed.snapshot().player.x - baseline.snapshot().player.x).toBeGreaterThanOrEqual(60);
  }
});

it('preserves 20 seconds of bot survival on seed 1', () => {
  const world = new World(1);
  for (let i = 0; i < 1200; i++) world.tick(botIntent(world.snapshot()));
  expect(world.snapshot().tick).toBe(1200);
  expect(world.snapshot().gameOver).toBe(false);
});
