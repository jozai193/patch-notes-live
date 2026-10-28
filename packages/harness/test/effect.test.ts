import { readFile, readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { World } from '@patch-notes-live/engine';
import { EffectTracker, emptyEffect, visible } from '../src/effect.js';
import { verify } from '../src/index.js';

it('uses the exact visible thresholds and does not count HP, RNG or tiny changes', () => {
  expect(
    visible({
      ...emptyEffect(),
      playerMaxOffset: 39.99,
      meanEnemyOffset: 19.99,
      maxEntityCountDifference: 2,
      maxRadiusDifference: 1.99,
    }),
  ).toBe(false);
  for (const value of [
    { playerMaxOffset: 40 },
    { meanEnemyOffset: 20 },
    { maxEntityCountDifference: 3 },
    { colorChanged: true },
    { maxRadiusDifference: 2 },
    { physicsChanged: true },
    { arenaChanged: true },
    { uiEvents: 1 },
  ])
    expect(visible({ ...emptyEffect(), ...value })).toBe(true);
  const baseline = new World(1).snapshot();
  const actual = structuredClone(baseline);
  actual.player.hp--;
  actual.rngState++;
  actual.entities[0]!.radius += 0.01;
  const effect = new EffectTracker();
  effect.observe(actual, baseline, 0, 1);
  expect(visible(effect.metrics)).toBe(false);
});

it('averages matched enemy offsets over all observations rather than just the largest offset', () => {
  const world = new World(1);
  world.applyCommands([{ type: 'spawn', kind: 'enemy', opts: { x: 100, y: 100 } }]);
  const baseline = world.snapshot(),
    actual = structuredClone(baseline);
  actual.entities.find((entity) => entity.kind === 'enemy')!.x += 60;
  const effect = new EffectTracker();
  effect.observe(actual, baseline, 0, 1);
  effect.observe(baseline, baseline, 0, 2);
  expect(effect.metrics.meanEnemyOffset).toBe(30);
  expect(effect.metrics.ticksObserved).toBe(2);
});

it('rejects an imperceptible velocity mod with all measured numbers and a repair hint', async () => {
  const report = await verify(
    `export default { name:'tiny push',description:'imperceptible',hooks:{onTick(g){g.player.vx += 0.0001;}}}`,
  );
  const check = report.checks.find((check) => check.id === 'effect')!;
  expect(check.ok).toBe(false);
  for (const term of [
    'player max offset',
    'mean enemy offset',
    'count difference',
    'radius difference',
    'within 10 seconds',
    'stronger',
  ])
    expect(check.detail).toContain(term);
  expect(Object.keys(report.stats.visibleEffectBySeed)).toEqual(['1', '2', '3']);
  for (const effect of Object.values(report.stats.visibleEffectBySeed))
    expect(effect.ticksObserved).toBe(900);
});

it('counts initialization toasts and still hashes identically with renderer-style event draining', async () => {
  const report = await verify(
    `export default {name:'toast',description:'a toast',hooks:{onStart(g){g.ui.toast('Gravity online');}}}`,
  );
  expect(report.ok).toBe(true);
  expect(report.stats.visibleEffectBySeed[1]?.uiEvents).toBe(1);
});

const generated = new URL('../../../mods/generated/', import.meta.url);
const files = (await readdir(generated)).filter((file) => file.endsWith('.js'));
it.each(files)(
  'rechecks generated %s against visible-effect thresholds',
  async (file) => {
    const report = await verify(await readFile(new URL(file, generated), 'utf8'));
    const effect = report.checks.find((check) => check.id === 'effect')!;
    if (file.startsWith('enemies-split')) expect(report.ok).toBe(true);
    else if (!effect.ok)
      expect(effect.detail).toContain('make the effect stronger and visible within 10 seconds');
    expect(report.checks.filter((check) => !check.ok && check.id !== 'effect')).toEqual([]);
    console.log(`GENERATED ${file}: ${report.ok ? 'PASS' : 'FAIL'}; ${effect.detail}`);
  },
  30_000,
);
