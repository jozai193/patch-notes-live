import { expect, it, vi } from 'vitest';
import { IDLE_INTENT, World } from '@patch-notes-live/engine';
import { SandboxHost } from '../src/index.js';
import { ModRuntime } from '../src/runtime.js';

it('starts a newly added runtime only at the next tick, once, and preserves world progress', async () => {
  const host = await SandboxHost.create([]);
  try {
    const world = new World(1, host);
    for (let i = 0; i < 30; i++) world.tick(IDLE_INTENT);
    const before = world.snapshot();
    await host.addMod(
      'live',
      `export default {name:'live',description:'live',hooks:{onStart(g){g.state.started=(g.state.started||0)+1;g.player.radius=40;g.ui.toast(String(g.time));},onTick(g){if(g.state.started!==1)throw Error('start count');}}}`,
    );
    expect(world.snapshot()).toEqual(before);
    world.tick(IDLE_INTENT);
    expect(world.snapshot().tick).toBe(31);
    expect(world.snapshot().player.radius).toBe(40);
    expect(world.snapshot().events[0]?.type).toBe('toast');
    const toast = world.snapshot().events[0];
    expect(Number(toast?.type === 'toast' ? toast.text : NaN)).toBeCloseTo(31 / 60);
    for (let i = 0; i < 10; i++) world.tick(IDLE_INTENT);
    const runtime = host.mods[0]!;
    const dispose = vi.spyOn(ModRuntime.prototype, 'dispose');
    expect(host.removeMod('live')).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
    expect(host.mods).toHaveLength(0);
    world.tick(IDLE_INTENT);
    expect(world.snapshot().player.radius).toBe(12);
    expect(world.snapshot().tick).toBe(42);
    expect(host.faults.filter((f) => f.modId === runtime.id)).toEqual([]);
  } finally {
    host.dispose();
  }
});

it('can cancel an in-flight module addition without leaving a runtime behind', async () => {
  const host = await SandboxHost.create([]);
  try {
    const adding = host.addMod(
      'cancel',
      `export default {name:'cancel',description:'cancel',hooks:{}}`,
    );
    expect(host.removeMod('cancel')).toBe(true);
    await expect(adding).rejects.toThrow('cancelled');
    expect(host.mods).toHaveLength(0);
  } finally {
    host.dispose();
  }
});

it('reverts layered physics and owned spawns without resetting other mods', async () => {
  const host = await SandboxHost.create([]);
  try {
    const world = new World(1, host);
    await host.addMod(
      'a',
      `export default {name:'a',description:'a',hooks:{onStart(g){g.physics.gravity.y=100;g.player.speed=250;g.spawn('hazard',{x:100,y:100});}}}`,
    );
    world.tick();
    await host.addMod(
      'b',
      `export default {name:'b',description:'b',hooks:{onStart(g){g.physics.gravity.y=-100;g.player.speed=300;}}}`,
    );
    world.tick();
    host.removeMod('a');
    world.tick();
    expect(world.snapshot().physics.gravity.y).toBe(-100);
    expect(world.snapshot().player.speed).toBe(300);
    expect(world.snapshot().entities.some((e) => e.kind === 'hazard')).toBe(false);
    host.removeMod('b');
    world.tick();
    expect(world.snapshot().physics.gravity.y).toBe(0);
    expect(world.snapshot().player.speed).toBe(200);
  } finally {
    host.dispose();
  }
});
