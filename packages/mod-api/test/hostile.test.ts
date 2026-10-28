import { describe, expect, it } from 'vitest';
import { botIntent, World } from '@patch-notes-live/engine';
import { SandboxHost } from '../src/index.js';

const cases = [
  [
    'Object.prototype.toJSON',
    'onTick(g){Object.prototype.toJSON=function(){return {commands:[],result:null}};}',
  ],
  ['Array.prototype.map', 'onTick(){Array.prototype.map=function(){throw Error("hijacked")};}'],
  ['infinite recursion', 'onTick(){function recurse(){return recurse()}recurse();}'],
  ['catastrophic regexp', "onTick(){/^(a+)+$/.test('a'.repeat(40)+'!');}"],
  ['5 MB toast', "onTick(g){g.ui.toast('x'.repeat(5*1024*1024));}"],
  ['onSpawn storm', "onSpawn(g){for(let i=0;i<50;i++)g.spawn('enemy',{});}"],
  ['remove player', 'onTick(g){g.remove(g.player);}'],
  ['NaN/Infinity physics', 'onTick(g){g.physics.gravity.y=NaN;g.physics.friction=Infinity;}'],
  ['async hook', 'async onTick(g){g.player.hp=0;}'],
  ['hook getter', 'get onTick(){while(true){}}'],
  [
    'capability probes',
    `onTick(g){
    const types=[typeof fetch,typeof require,typeof process,typeof setTimeout,typeof WebAssembly];
    if(types.some(t=>t!=='undefined'))throw Error('host capability present');
    g.player.tags=types;
  }`,
  ],
] as const;

describe('hostile mods remain isolated through ticking and disposal', () => {
  it.each(cases)(
    '%s',
    async (name, hooks) => {
      const host = await SandboxHost.create([
        `export default {name:${JSON.stringify(name)},description:'hostile regression',hooks:{${hooks}}}`,
      ]);
      const w = new World(1, host);
      try {
        for (let i = 0; i < 120; i++) expect(() => w.tick(botIntent(w.snapshot()))).not.toThrow();
        expect(w.snapshot().tick).toBe(120);
        expect(w.snapshot().player.hp).toBeGreaterThan(0);
        expect(w.snapshot().entities.length).toBeLessThanOrEqual(300);
        if (host.faults.length) {
          expect(host.mods[0]!.disabled).toBe(true);
          expect(host.faults.some((f) => f.kind === 'disabled')).toBe(true);
        } else {
          expect(name).toBe('capability probes');
          expect(w.snapshot().player.tags).toEqual(Array(5).fill('undefined'));
        }
      } finally {
        expect(() => host.dispose()).not.toThrow();
        expect(() => host.dispose()).not.toThrow();
        expect(host.faults.filter((f) => f.kind === 'dispose')).toEqual([]);
        expect(host.mods[0]!.disposed).toBe(true);
      }
    },
    10000,
  );

  it('never invokes a thrown object’s toJSON or message getter while reporting errors', async () => {
    const host = await SandboxHost.create([
      `export default {name:'error-object',description:'error transport',hooks:{
      onTick(){throw {toJSON(){while(true){}},get message(){while(true){}},get stack(){while(true){}}};}
    }}`,
    ]);
    try {
      const world = new World(1, host);
      for (let i = 0; i < 120; i++) world.tick(botIntent(world.snapshot()));
      expect(world.snapshot().tick).toBe(120);
      expect(host.mods[0]!.faultCount).toBe(3);
      expect(host.mods[0]!.disabled).toBe(true);
      expect(host.faults[0]).toMatchObject({
        kind: 'throw',
        message: 'Mod threw a non-string error',
      });
    } finally {
      expect(() => host.dispose()).not.toThrow();
    }
  });

  it('disables after ten nonconsecutive faults while successful calls reset the consecutive count', async () => {
    const host = await SandboxHost.create([
      `export default {name:'intermittent',description:'threshold',hooks:{
      onTick(g){g.state.n=(g.state.n||0)+1;if(g.state.n%2)throw Error('odd tick');}
    }}`,
    ]);
    try {
      const world = new World(1, host);
      for (let i = 0; i < 120; i++) world.tick(botIntent(world.snapshot()));
      expect(world.snapshot().tick).toBe(120);
      expect(host.mods[0]).toMatchObject({ faultCount: 10, consecutiveFaults: 1, disabled: true });
      expect(host.faults.at(-1)).toMatchObject({ kind: 'disabled', tick: 19 });
    } finally {
      host.dispose();
    }
  });
});
