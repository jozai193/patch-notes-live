import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { verify } from '../src/index.js';
import type { CheckId } from '../src/index.js';
import { literalLoops } from '../src/static.js';
import { World } from '@patch-notes-live/engine';
import { SandboxHost } from '@patch-notes-live/mod-api';

const sample = async (name: string) =>
  readFile(new URL(`../../../mods/samples/${name}.js`, import.meta.url), 'utf8');
const good = [
  'split-on-hit',
  'gravity-flip-every-10s',
  'floor-is-lava',
  'enemies-tiny-and-fast',
  'heal-on-kill',
];
const bad: [string, CheckId][] = [
  ['infinite-loop', 'budget'],
  ['throws-on-tick', 'stability'],
  ['unbounded-spawner', 'runaway'],
  ['does-nothing', 'effect'],
  ['instant-death', 'winnable'],
];

describe('real sample modules through the independent verifier', () => {
  it.each(good)(
    '%s passes all seven checks',
    async (name) => {
      const report = await verify(await sample(name));
      expect(report.checks).toHaveLength(7);
      expect(report.checks.filter((c) => !c.ok)).toEqual([]);
      expect(report.ok).toBe(true);
      expect(report.stats.maxEntities).toBeLessThanOrEqual(300);
      expect(report.stats.peakBudgetPct).toBeLessThanOrEqual(100);
      expect(Object.values(report.stats.survivalSecondsBySeed).some((t) => t >= 20)).toBe(true);
      expect(report.durationMs).toBeLessThan(5000);
      console.log(
        `VERIFY ${name}: PASS in ${report.durationMs.toFixed(1)}ms, sandbox p95 ${report.stats.sandboxMsP95.toFixed(3)}ms`,
      );
    },
    15000,
  );

  it.each(bad)(
    '%s fails %s with a repair instruction',
    async (name, id) => {
      const report = await verify(await sample(name));
      expect(report.ok).toBe(false);
      expect(report.checks.find((c) => c.id === id)).toMatchObject({
        ok: false,
        detail: expect.stringContaining('Fix:'),
      });
      for (const check of report.checks.filter((c) => !c.ok))
        expect(check.detail).toContain('Fix:');
      console.log(`VERIFY ${name}: FAIL ${id} in ${report.durationMs.toFixed(1)}ms`);
    },
    15000,
  );
});

it('preserves the hook, TypeError and exact QuickJS mod.js location for patch feedback', async () => {
  const report = await verify(await sample('throws-on-tick'));
  const detail = report.checks.find((c) => c.id === 'stability')!.detail;
  expect(detail).toContain('onTick');
  expect(detail).toContain('TypeError');
  expect(detail).toMatch(/mod\.js:\d+:\d+/);
  expect(detail).toContain('check its length before indexing');
});

it('rejects UTF-8 sources over 8KB without executing them', async () => {
  const report = await verify('é'.repeat(4097));
  expect(report.ok).toBe(false);
  expect(report.checks[0]).toMatchObject({
    id: 'load',
    ok: false,
    detail: expect.stringContaining('8194 bytes'),
  });
  expect(report.stats.maxEntities).toBe(0);
});

it('rejects invalid export schemas and keeps all check IDs in the report', async () => {
  const report = await verify('export default {hooks:{}}');
  expect(report.checks.map((c) => c.id)).toEqual([
    'load',
    'stability',
    'budget',
    'runaway',
    'winnable',
    'effect',
    'determinism',
  ]);
  expect(report.checks[0]!.ok).toBe(false);
});

it('does not mistake comments/strings for literal while(true) loops', () => {
  expect(literalLoops('// while(true){}\nconst text="while(true){}";')).toEqual([]);
  expect(literalLoops('\nwhile (true) {}')).toEqual([{ line: 2, column: 1 }]);
});

it('supports caller cancellation without reporting a mod as broken', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    verify(await sample('does-nothing'), { signal: controller.signal }),
  ).rejects.toThrow();
});

it('does not certify an effect that first appears after tick 900', async () => {
  const report = await verify(
    `export default {name:'late',description:'late effect',hooks:{onTick(g){if(g.time>15)g.player.color='#aaaaaa';}}}`,
  );
  expect(report.checks.find((c) => c.id === 'effect')).toMatchObject({ ok: false });
  expect(report.checks.find((c) => c.id === 'stability')).toMatchObject({ ok: true });
});

it('the heal-on-kill sample actually restores HP, not just a visual effect', async () => {
  const host = await SandboxHost.create([await sample('heal-on-kill')]);
  try {
    const world = new World(1, host);
    world.applyCommands([
      { type: 'setEntity', id: 1, fields: { hp: 40 } },
      { type: 'spawn', kind: 'enemy', opts: { x: 510, y: 320, speed: 0 } },
    ]);
    for (let i = 0; i < 5; i++)
      world.tick({ moveX: 0, moveY: 0, aimX: 510, aimY: 320, fire: true });
    expect(world.snapshot().player.hp).toBe(45);
    expect(host.faults).toEqual([]);
  } finally {
    host.dispose();
  }
});
