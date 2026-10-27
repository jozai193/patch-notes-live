import { createHash } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { botIntent, composeHosts, World } from '@patch-notes-live/engine';
import { loadQuickJS, SandboxHost } from '../src/index.js';

const hosts: SandboxHost[] = [];
beforeAll(async () => {
  await loadQuickJS();
});
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
});
const source = (hooks: string, name = 'test') =>
  `export default { name: ${JSON.stringify(name)}, description: 'test fixture', hooks: { ${hooks} } }`;
async function make(sources: string[]) {
  const host = await SandboxHost.create(sources);
  hosts.push(host);
  return host;
}

describe('sandbox contract and engine integration', () => {
  it('fetches entity lists lazily and caches each list within a hook', async () => {
    let reads = 0;
    const count = {
      onTick(g: import('@patch-notes-live/engine').Game) {
        const enemies = g.enemies.bind(g);
        g.enemies = () => {
          reads++;
          return enemies();
        };
      },
    };
    const quiet = await make([source('onTick(g){g.player.speed=100;}')]);
    new World(1, composeHosts(count, quiet)).tick();
    expect(reads).toBe(0);
    const lazy = await make([source('onTick(g){g.enemies();g.enemies();}')]);
    new World(1, composeHosts(count, lazy)).tick();
    expect(reads).toBe(1);
    expect(lazy.faults).toEqual([]);
  });
  it('applies gravity, onSpawn mutations, and g.set through the engine validation', async () => {
    const host = await make([
      source('onStart(g){ g.physics.gravity.y = 300; }', 'gravity'),
      source(
        "onSpawn(g,e){if(e.kind === 'enemy') {e.radius = 40; e.speed = 300; e.custom = true;}}",
        'resize',
      ),
      source('onTick(g){g.set(g.player,{speed:50});}', 'set'),
    ]);
    const w = new World(1, host);
    w.tick();
    expect(w.snapshot().physics.gravity.y).toBe(300);
    expect(w.snapshot().player.speed).toBe(50);
    for (const e of w.snapshot().entities.filter((e) => e.kind === 'enemy')) {
      expect(e.radius).toBe(40);
      expect(e.speed).toBe(300);
      expect(e).not.toHaveProperty('custom');
    }
    expect(host.faults).toEqual([]);
    expect(host.isHealthy('resize')).toBe(true);
  });

  it('chains onHit damage, cancellation, and event mutations across mods and hosts', async () => {
    const host = await make([
      source('onHit(g,e){e.attacker.radius=30; return {damage:3}}'),
      source('onHit(g,e){return {damage:e.damage*2}}', 'double'),
    ]);
    const w = new World(1, composeHosts(host, { onHit: (_g, e) => ({ damage: e.damage + 1 }) }));
    w.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    w.tick();
    expect(w.snapshot().player.hp).toBe(93);
    expect(w.snapshot().entities.find((e) => e.kind === 'hazard')!.radius).toBe(30);
    const cancel = await make([source('onHit(){return {cancel:true}}')]);
    const protectedWorld = new World(1, cancel);
    protectedWorld.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    protectedWorld.tick();
    expect(protectedWorld.snapshot().player.hp).toBe(100);
    expect(host.faults).toEqual([]);
    expect(cancel.faults).toEqual([]);
  });

  it('preserves per-mod state and lazily fetches lists with coherent aliases', async () => {
    const host = await make([
      source(`onStart(g){const e=g.spawn('hazard',{x:100,y:100});e.radius=25;g.state.entity=e;},
      onTick(g){g.state.n=(g.state.n||0)+1;g.set(g.state.entity,{speed:g.state.n});
        const p=g.entities().find(e=>e.id===g.player.id);if(p!==g.player)throw Error('alias');
        g.player.tags=['count:'+g.state.n];}`),
      source("onTick(g){if(g.state.n)throw Error('shared state');}", 'isolated'),
    ]);
    const w = new World(1, host);
    for (let i = 0; i < 5; i++) w.tick();
    expect(w.snapshot().player.tags).toEqual(['count:5']);
    expect(w.snapshot().entities.find((e) => e.kind === 'hazard')).toMatchObject({
      radius: 25,
      speed: 5,
    });
    expect(host.faults).toEqual([]);
  });

  it('runs representative split, gravity-flip, lava, tiny-fast, and heal hooks', async () => {
    const fixtures = [
      source(
        "onHit(g,e){if(e.target.kind==='enemy'&&!e.target.tags.includes('split')){g.spawn('enemy',{x:e.target.x,y:e.target.y,tags:['split']});e.target.tags.push('split');}}",
        'split',
      ),
      source('onTick(g){g.physics.gravity.y = Math.floor(g.time / 10) % 2 ? -100 : 100;}', 'flip'),
      source("onStart(g){g.spawn('hazard',{x:100,y:100,color:'#ff0000'});}", 'lava'),
      source("onSpawn(g,e){if(e.kind==='enemy'){e.radius=5;e.speed=150;}}", 'tiny'),
      source('onKill(g){g.player.hp += 5;}', 'heal'),
    ];
    for (const fixture of fixtures) {
      const host = await make([fixture]);
      const w = new World(1, host);
      for (let i = 0; i < 120; i++) w.tick(botIntent(w.snapshot()));
      expect(host.faults).toEqual([]);
    }
  });
});

describe('fault containment and capabilities', () => {
  it('interrupts while(true) in under 50ms and lets the world keep ticking', async () => {
    const host = await make([source('onTick(){while(true){}}', 'loop')]);
    const w = new World(1, host);
    const start = performance.now();
    expect(() => w.tick()).not.toThrow();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(host.faults[0]).toMatchObject({
      modName: 'loop',
      hook: 'onTick',
      kind: 'interrupt',
      tick: 1,
    });
    w.tick();
    expect(w.snapshot().tick).toBe(2);
    expect(host.isHealthy('loop')).toBe(false);
    expect(host.mods[0]!.faultCount).toBeGreaterThanOrEqual(1);
  });

  it('logs throws and discards that call’s commands without throwing into the engine', async () => {
    const host = await make([
      source("onTick(g){g.player.speed=1;g.ui.toast('discard');throw Error('boom')}"),
    ]);
    const w = new World(1, host);
    for (let i = 0; i < 3; i++) expect(() => w.tick()).not.toThrow();
    expect(w.snapshot().tick).toBe(3);
    expect(w.snapshot().player.speed).toBe(200);
    expect(w.snapshot().events).toEqual([]);
    expect(host.faults[0]).toMatchObject({ kind: 'throw', message: 'boom' });
    expect(host.mods[0]!.faultCount).toBe(3);
  });

  it('contains a growing-array memory bomb at the 16MB memory limit', async () => {
    const host = await make([
      source('onTick(g){g.state.bomb=[];g.state.bomb.push(new Array(20000000).fill(1));}'),
    ]);
    const w = new World(1, host);
    expect(() => w.tick()).not.toThrow();
    expect(host.faults[0]).toMatchObject({ kind: 'memory' });
    expect(() => w.tick()).not.toThrow();
    expect(w.snapshot().tick).toBe(2);
  });

  it('exposes no fetch, timers, require, process, host objects, or host Function constructor', async () => {
    const host = await make([
      source(`onStart(g){
      for (const key of ['fetch','require','process','window','document','setTimeout','setInterval','__rand','__list','__log'])
        if(typeof globalThis[key]!=='undefined')throw Error('capability:'+key);
      if(g.rand.constructor('return typeof process')()!=='undefined')throw Error('host function');
      Object.prototype.hostPolluted=true; globalThis.hostPolluted=true;
      g.player.tags=['isolated'];
    }`),
    ]);
    const w = new World(1, host);
    expect(w.snapshot().player.tags).toEqual(['isolated']);
    expect(Object.hasOwn(Object.prototype, 'hostPolluted')).toBe(false);
    expect(Object.hasOwn(globalThis, 'hostPolluted')).toBe(false);
    expect(host.faults).toEqual([]);
  });

  it('rejects invalid returns and invalid commands; logs are capped', async () => {
    const host = await make([
      source("onTick(g){for(let i=0;i<200;i++)console.log('x'.repeat(1000));return {not:'valid'}}"),
    ]);
    const w = new World(1, host);
    w.tick();
    expect(host.logs.length).toBeLessThanOrEqual(100);
    expect(host.logs.every((log) => log.message.length <= 512)).toBe(true);
    expect(host.faults.length).toBeGreaterThan(0);
    const invalid = await make([source('onTick(g){g.player.speed=NaN;}')]);
    const bad = new World(1, invalid);
    bad.tick();
    expect(invalid.faults[0]).toMatchObject({ kind: 'invalid-result' });
    expect(bad.snapshot().player.speed).toBe(200);
  });

  it('handles load errors and synchronous-only hooks', async () => {
    const host = await make(['export default {}']);
    expect(host.faults[0]).toMatchObject({ hook: 'load', kind: 'invalid-result' });
    const async = await make([source('async onTick(){return 1;}')]);
    const w = new World(1, async);
    w.tick();
    expect(async.faults[0]).toMatchObject({ kind: 'invalid-result' });
  });

  it('uses a single cumulative budget across repeated hook calls in a tick', async () => {
    const host = await make([source('onHit(){for(let i=0;i<1000;i++){};return {cancel:true}}')]);
    const w = new World(
      1,
      composeHosts(
        {
          onTick(g) {
            for (let i = 0; i < 200; i++)
              host.onHit(g, { attacker: g.player, target: g.player, damage: 1 });
          },
        },
        host,
      ),
    );
    w.tick();
    expect(host.faults.some((f) => f.kind === 'interrupt' && f.tick === 1)).toBe(true);
    expect(host.mods[0]!.timeThisTickMs).toBeLessThan(50);
  });
});

it('hashes identically over 1200 ticks with deterministic Math.random and Date.now', async () => {
  const mod = source(`onTick(g){g.state.n=(g.state.n||0)+1;
    g.physics.gravity.x=Math.random()*2-1;g.player.tags=[String(Date.now()),String(new Date().getTime()),String(g.state.n)];},onHit(){return {cancel:true}}`);
  const a = await make([mod]),
    b = await make([mod]);
  const wa = new World(1, a),
    wb = new World(1, b);
  for (let i = 0; i < 1200; i++) {
    const intent = botIntent(wa.snapshot());
    wa.tick(intent);
    wb.tick(intent);
  }
  expect(wa.snapshot().tick).toBe(1200);
  const hash = (w: World) =>
    createHash('sha256').update(JSON.stringify(w.snapshot())).digest('hex');
  expect(hash(wa)).toBe(hash(wb));
  expect(a.faults).toEqual([]);
  expect(b.faults).toEqual([]);
});
