import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { botIntent, World } from '@patch-notes-live/engine';
import type { Patch } from '@patch-notes-live/mod-api/protocol';
import { PatchManager } from '../src/patch-manager.js';
import { arenaView } from '../src/view.js';
import { reconnectDelay } from '../src/connection.js';
const source = `export default {name:'test',description:'test',hooks:{onStart(g){g.player.color='#ff8800';g.ui.toast('start');}}}`;
const patch = (id: string): Patch => ({
  patchId: id,
  name: id,
  description: 'test',
  author: 'viewer',
  source,
});

it('adds, limits to three, expires by lifetime, and versions each apply', async () => {
  let now = 0;
  const reverted: string[][] = [],
    applied: string[] = [];
  const manager = await PatchManager.create(
    { applied: (_p, v) => applied.push(v), reverted: (id, reason) => reverted.push([id, reason]) },
    { clock: () => now, lifetimeMs: 2000 },
  );
  try {
    const world = new World(1, manager.host);
    for (const id of ['a', 'b', 'c']) {
      await manager.apply(patch(id));
      world.tick();
      manager.observeTick(world.snapshot().tick);
    }
    expect(manager.version).toBe('v1.3');
    expect(applied).toEqual(['v1.1', 'v1.2', 'v1.3']);
    await manager.apply(patch('d'));
    world.tick();
    manager.observeTick(world.snapshot().tick);
    expect(reverted).toContainEqual(['a', 'expired']);
    expect(manager.active.map((p) => p.patchId)).toEqual(['b', 'c', 'd']);
    now = 2001;
    manager.update();
    expect(manager.active).toHaveLength(0);
    expect(manager.version).toBe('v1.4');
  } finally {
    manager.dispose();
  }
});
it('restart keeps active patches, lifetime and version, with fresh state and onStart', async () => {
  let now = 0;
  const manager = await PatchManager.create({ applied() {}, reverted() {} }, { clock: () => now });
  try {
    await manager.apply(patch('a'));
    let world = new World(1, manager.host);
    world.tick();
    manager.observeTick(1);
    now = 5000;
    await manager.restart();
    world = new World(1, manager.host);
    expect(world.snapshot().player.color).toBe('#ff8800');
    expect(world.snapshot().events).toEqual([{ type: 'toast', text: 'start' }]);
    expect(manager.active[0]?.remainingSeconds).toBe(115);
    expect(manager.version).toBe('v1.1');
  } finally {
    manager.dispose();
  }
});
it('watchdog removes an auto-disabled mod with its first fault message', async () => {
  const reverted: string[] = [];
  const manager = await PatchManager.create({
    applied() {},
    reverted: (_id, reason) => reverted.push(reason),
  });
  try {
    const world = new World(1, manager.host);
    await manager.apply({
      ...patch('bad'),
      source: `export default {name:'bad',description:'bad',hooks:{onTick(){throw Error('first failure')}}}`,
    });
    for (let i = 0; i < 3; i++) {
      world.tick();
      manager.observeTick(world.snapshot().tick);
    }
    expect(reverted).toEqual(['first failure']);
    expect(manager.active).toHaveLength(0);
    expect(world.snapshot().tick).toBe(3);
  } finally {
    manager.dispose();
  }
});
it('watchdog requires a full three-second window before reverting fake slow timings', async () => {
  let now = 0;
  const reverted: string[] = [];
  const manager = await PatchManager.create(
    { applied() {}, reverted: (_id, reason) => reverted.push(reason) },
    { clock: () => now },
  );
  try {
    const world = new World(1, manager.host);
    await manager.apply(patch('slow'));
    for (let i = 1; i <= 182; i++) {
      now = (i * 1000) / 60;
      world.tick();
      manager.observeTick(
        i,
        manager.host.mods.map((mod) => ({ ...mod, timeThisTickMs: 5 })),
      );
      if (i <= 180) expect(reverted).toHaveLength(0);
    }
    expect(reverted).toEqual(['too slow']);
  } finally {
    manager.dispose();
  }
});
it('the valid time bomb survives the verifier horizon and is reverted live at about 70 seconds', async () => {
  const text = await readFile(
    new URL('../../../mods/samples/time-bomb.js', import.meta.url),
    'utf8',
  );
  const reverted: string[] = [];
  let now = 0;
  const manager = await PatchManager.create(
    { applied() {}, reverted: (_id, reason) => reverted.push(reason) },
    { clock: () => now },
  );
  try {
    const world = new World(1, manager.host);
    await manager.apply({ ...patch('bomb'), source: text });
    for (let i = 1; i <= 4205; i++) {
      now = (i * 1000) / 60;
      world.tick(botIntent(world.snapshot()));
      manager.observeTick(world.snapshot().tick);
    }
    expect(world.snapshot().tick).toBe(4205);
    expect(reverted).toEqual(['Time bomb: game time exceeded 70 seconds']);
  } finally {
    manager.dispose();
  }
});
it('keeps a fixed base scale for smaller arenas, scales down larger arenas and bounds reconnect backoff', () => {
  expect(arenaView({ width: 480, height: 320, wrap: false })).toEqual({
    scale: 0.875,
    x: 210,
    y: 140,
  });
  expect(arenaView({ width: 1920, height: 640, wrap: true }).scale).toBe(0.4375);
  expect([0, 1, 2, 20].map(reconnectDelay)).toEqual([500, 1000, 2000, 10000]);
});
