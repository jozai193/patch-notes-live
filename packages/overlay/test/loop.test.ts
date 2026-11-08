import { describe, expect, it } from 'vitest';
import { World } from '@patch-notes-live/engine';
import { interpolateSnapshots, planFrame, STEP } from '../src/loop.js';
import { aimAt, readOptions } from '../src/view.js';

describe('fixed-step frame planning', () => {
  it('accumulates fractional frames and renders halfway between completed ticks', () => {
    const first = planFrame(0, STEP / 2);
    expect(first.ticks).toBe(0);
    expect(first.alpha).toBeCloseTo(0.5);
    const second = planFrame(first.accumulator, STEP);
    expect(second.ticks).toBe(1);
    expect(second.alpha).toBeCloseTo(0.5);
    expect(second.accumulator).toBeCloseTo(STEP / 2);
  });

  it('produces exactly 60 ticks per second at 30, 60, 144, and uneven frame rates', () => {
    for (const fps of [30, 60, 144]) {
      let accumulator = 0,
        ticks = 0;
      for (let i = 0; i < fps; i++) {
        const result = planFrame(accumulator, 1 / fps);
        accumulator = result.accumulator;
        ticks += result.ticks;
      }
      expect(ticks).toBe(60);
      expect(accumulator).toBeCloseTo(0);
    }
    let accumulator = 0,
      ticks = 0;
    for (const elapsed of [0.01, 0.03, 0.02, 0.04]) {
      const result = planFrame(accumulator, elapsed);
      accumulator = result.accumulator;
      ticks += result.ticks;
    }
    expect(ticks).toBe(6);
    expect(accumulator).toBeCloseTo(0);
  });

  it('bounds catch-up to 15 ticks and ignores invalid elapsed values', () => {
    expect(planFrame(0, 30)).toMatchObject({ ticks: 15, accumulator: 0, alpha: 0 });
    for (const elapsed of [-1, NaN, Infinity]) expect(planFrame(0, elapsed).ticks).toBe(0);
  });
});

describe('snapshot interpolation', () => {
  it('interpolates positions by ID while taking current HP, spawns, and removals', () => {
    const w = new World(1);
    w.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 100, y: 100 } }]);
    const previous = w.snapshot();
    w.applyCommands([
      { type: 'setEntity', id: 1, fields: { x: 600, y: 400, hp: 70 } },
      { type: 'remove', id: 2 },
      { type: 'spawn', kind: 'pickup', opts: { x: 200, y: 200 } },
    ]);
    const current = w.snapshot();
    const original = JSON.stringify([previous, current]);
    const result = interpolateSnapshots(previous, current, 0.5);
    expect(result.player).toMatchObject({ x: 540, y: 360, hp: 70 });
    expect(result.entities.map((e) => e.id)).toEqual([1, 3]);
    expect(result.entities[1]).toMatchObject({ x: 200, y: 200 });
    expect(interpolateSnapshots(previous, current, 0).player.x).toBe(480);
    expect(interpolateSnapshots(previous, current, 1).player.x).toBe(600);
    expect(JSON.stringify([previous, current])).toBe(original);
  });

  it('uses the short path across a wrapping boundary', () => {
    const w = new World(1);
    w.applyCommands([
      { type: 'setArena', arena: { wrap: true } },
      { type: 'setEntity', id: 1, fields: { x: 958 } },
    ]);
    const previous = w.snapshot();
    w.applyCommands([{ type: 'setEntity', id: 1, fields: { x: 2 } }]);
    expect(interpolateSnapshots(previous, w.snapshot(), 0.5).player.x).toBe(0);
  });
});

describe('query options and scaled mouse aim', () => {
  it('maps window coordinates back through the scaled, letterboxed arena', () => {
    const arena = { width: 960, height: 640, wrap: false };
    expect(
      aimAt({ x: 220, y: 160 }, { left: 10, top: 20, width: 420, height: 280 }, arena),
    ).toEqual({ x: 480, y: 320 });
    const wide = { ...arena, width: 1920 };
    expect(aimAt({ x: 220, y: 160 }, { left: 10, top: 20, width: 420, height: 280 }, wide)).toEqual(
      { x: 960, y: 320 },
    );
  });

  it('reads reproducible seeds and independent bot/OBS flags', () => {
    expect(readOptions('')).toEqual({ seed: 1, bot: false, obs: false, perf: false, play: false });
    expect(readOptions('?seed=42&bot=1&obs=1&perf=1')).toEqual({
      seed: 42,
      bot: true,
      obs: true,
      perf: true,
      play: false,
    });
    expect(readOptions('?seed=garbage&bot=0&obs=0')).toEqual({
      seed: 1,
      bot: false,
      obs: false,
      perf: false,
      play: false,
    });
    expect(readOptions('?play=1').play).toBe(true);
  });
});
