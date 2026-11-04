import { expect, it } from 'vitest';
import { World, botIntent } from '@patch-notes-live/engine';
import { SandboxHost } from '../src/index.js';
import { parseServerMessage } from '../src/protocol.js';
it('marshals visual mutations, g.set, capped bursts and bounded sanitized patch notes', async () => {
  const host = await SandboxHost.create([
    `export default {name:'Neon',description:'visual',patchNotes:'\\u0000Neon!\\n'+'x'.repeat(200),hooks:{onStart(g){g.player.shape='star';g.player.glow=4;g.fx.burst(10,20,'#abcdef',400);},onSpawn(g,e){if(e.kind==='enemy')g.set(e,{shape:'square',glow:.25});}}}`,
  ]);
  try {
    const w = new World(1, host);
    w.tick(botIntent(w.snapshot()));
    expect(host.mods[0]!.patchNotes).toBe(('Neon!' + 'x'.repeat(200)).slice(0, 140));
    expect(w.snapshot().player).toMatchObject({ shape: 'star', glow: 1 });
    expect(w.snapshot().entities.find((e) => e.kind === 'enemy')).toMatchObject({
      shape: 'square',
      glow: 0.25,
    });
    expect(w.drainEvents()).toEqual([{ type: 'burst', x: 10, y: 20, color: '#abcdef', count: 40 }]);
    expect(host.faults).toEqual([]);
  } finally {
    host.dispose();
  }
});
it('reverts optional visual fields to their absent defaults without changing entity IDs', async () => {
  const host = await SandboxHost.create([]);
  try {
    const w = new World(1, host);
    await host.addMod(
      'visual',
      `export default {name:'visual',description:'visual',hooks:{onStart(g){g.set(g.player,{shape:'triangle',glow:0});}}}`,
    );
    w.tick();
    expect(w.snapshot().player.shape).toBe('triangle');
    host.removeMod('visual');
    w.tick();
    expect(w.snapshot().player.shape).toBeUndefined();
    expect(w.snapshot().player.glow).toBeUndefined();
    expect(w.snapshot().player.id).toBe(1);
    expect(JSON.parse(JSON.stringify(w.snapshot()))).toEqual(w.snapshot());
  } finally {
    host.dispose();
  }
});
it.each([42, {}, null])('rejects invalid patchNotes metadata %s safely', async (value) => {
  const host = await SandboxHost.create([
    `export default {name:'invalid',description:'notes',patchNotes:${JSON.stringify(value)},hooks:{}}`,
  ]);
  try {
    expect(host.mods[0]!.disabled).toBe(true);
    expect(host.faults[0]!.message).toContain('patchNotes');
  } finally {
    host.dispose();
  }
});
it('accepts bounded patch notes on the wire and rejects controls and overlong notes', () => {
  const patch = {
    v: 1,
    type: 'applyPatch',
    patchId: 'x',
    name: 'Neon',
    description: 'd',
    author: 'a',
    source: 'export default {}',
    patchNotes: 'Very dramatic.',
  };
  expect(parseServerMessage(JSON.stringify(patch))).toBeDefined();
  for (const patchNotes of ['x'.repeat(141), 'bad\u0000text', 1])
    expect(parseServerMessage(JSON.stringify({ ...patch, patchNotes }))).toBeUndefined();
});
