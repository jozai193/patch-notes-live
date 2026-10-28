import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { botIntent, DT, IDLE_INTENT, World } from '../src/index.js';
import { collisionPairs } from '../src/grid.js';
import type { Entity, Intent } from '../src/index.js';

const hash = (world: World) =>
  createHash('sha256').update(JSON.stringify(world.snapshot())).digest('hex');
const removeEnemies = (w: World) =>
  w.applyCommands(
    w
      .snapshot()
      .entities.filter((e) => e.kind === 'enemy')
      .map((e) => ({ type: 'remove', id: e.id })),
  );

describe('deterministic simulation', () => {
  it('hashes identically for the same seed and 3600 identical intents, differently for another seed', () => {
    const intents: Intent[] = [];
    const source = new World(1);
    for (let i = 0; i < 3600; i++) {
      const intent = botIntent(source.snapshot());
      intents.push(intent);
      source.tick(intent);
    }
    const a = new World(1),
      b = new World(1),
      c = new World(2);
    for (const intent of intents) {
      a.tick(intent);
      b.tick(intent);
      c.tick(intent);
    }
    expect(hash(a)).toBe(hash(b));
    expect(hash(a)).toBe(hash(source));
    expect(hash(c)).not.toBe(hash(a));
    // Exercise all 3600 ticks even if ordinary gameplay ends sooner.
    const immortal = () => new World(1, { onHit: () => ({ cancel: true }) });
    const d = immortal(),
      e = immortal();
    for (const intent of intents) {
      d.tick(intent);
      e.tick(intent);
    }
    expect(d.snapshot().tick).toBe(3600);
    expect(hash(d)).toBe(hash(e));
    console.log(`3600-tick SHA-256: ${hash(d)} (both runs identical)`);
  });

  it('escalates wave size and speed; an idle player eventually dies', () => {
    const w = new World(1, { onHit: () => ({ cancel: true }) });
    w.tick();
    const first = w.snapshot().entities.filter((e) => e.kind === 'enemy');
    removeEnemies(w);
    for (let i = 0; i < 600; i++) w.tick();
    const second = w.snapshot().entities.filter((e) => e.kind === 'enemy');
    expect(w.snapshot().wave).toBe(2);
    expect(second.length).toBeGreaterThan(first.length);
    expect(second[0]!.speed).toBeGreaterThan(first[0]!.speed);
    const idle = new World(1);
    for (let i = 0; i < 3600; i++) idle.tick();
    expect(idle.snapshot().gameOver).toBe(true);
    expect(idle.snapshot().time).toBeGreaterThan(5);
  });

  it('the scripted bot survives at least 20 seconds on seed 1', () => {
    const w = new World(1);
    for (let i = 0; i < 1200; i++) w.tick(botIntent(w.snapshot()));
    expect(w.snapshot().tick).toBe(1200);
    expect(w.snapshot().player.hp).toBeGreaterThan(0);
    expect(w.snapshot().score).toBeGreaterThan(0);
    console.log(
      `Bot seed 1: ${w.snapshot().time}s, HP ${w.snapshot().player.hp}, score ${w.snapshot().score}`,
    );
  });
});

describe('hooks and command boundary', () => {
  it('orders start, spawn, tick, hit, kill and honors cancellation', () => {
    const calls: string[] = [];
    const w = new World(1, {
      onStart: () => {
        calls.push('start');
      },
      onSpawn: (_g, e) => {
        calls.push(`spawn:${e.kind}`);
      },
      onTick: (_g, dt) => {
        expect(dt).toBe(DT);
        calls.push('tick');
      },
      onHit: () => {
        calls.push('hit');
      },
      onKill: () => {
        calls.push('kill');
      },
    });
    expect(calls).toEqual(['start', 'spawn:player']);
    w.applyCommands([{ type: 'spawn', kind: 'enemy', opts: { x: 510, y: 320, speed: 0 } }]);
    w.tick({ ...IDLE_INTENT, aimX: 510, aimY: 320, fire: true });
    for (let i = 0; i < 4; i++) w.tick();
    expect(calls.indexOf('tick')).toBeLessThan(calls.indexOf('spawn:projectile'));
    expect(calls.indexOf('spawn:projectile')).toBeLessThan(calls.indexOf('hit'));
    expect(calls.indexOf('hit')).toBeLessThan(calls.indexOf('kill'));
    const cancel = new World(1, { onHit: () => ({ cancel: true }) });
    cancel.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    cancel.tick();
    expect(cancel.snapshot().player.hp).toBe(100);
    const modified = new World(1, { onHit: () => ({ damage: 3 }) });
    modified.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    modified.tick();
    expect(modified.snapshot().player.hp).toBe(97);
  });

  it('rejects malformed commands atomically, clamps ranges, protects identity and caps entities', () => {
    const w = new World();
    expect(
      w.applyCommands([
        null,
        { type: 'bogus' },
        { type: 'spawn', kind: 'player', opts: {} },
        { type: 'spawn', kind: 'enemy', opts: { x: NaN } },
        { type: 'setEntity', id: 1, fields: { id: 42 } },
        { type: 'setEntity', id: 1, fields: { speed: 20, hp: Infinity } },
        { type: 'remove', id: 1 },
        { type: 'setPhysics', physics: { gravity: { x: 0, y: NaN } } },
        { type: 'setArena', arena: { width: 300, wrap: 'yes' } },
        { type: 'tint', color: 'url(x)', ms: 1 },
      ]),
    ).toEqual(Array(10).fill(false));
    expect(w.snapshot().player.speed).toBe(200);
    expect(w.snapshot().arena.width).toBe(960);
    w.applyCommands([
      { type: 'setEntity', id: 1, fields: { radius: -1, speed: 9999, hp: 9999, maxHp: 200 } },
      {
        type: 'setPhysics',
        physics: { timeScale: 9, friction: -5, gravity: { x: -9999, y: 9999 } },
      },
      { type: 'setArena', arena: { width: 0, height: 99999 } },
      { type: 'toast', text: 'a'.repeat(100) },
      { type: 'tint', color: '#ffffff', ms: 99999 },
    ]);
    const s = w.snapshot();
    expect(s.player).toMatchObject({ radius: 1, speed: 400, hp: 200, maxHp: 200 });
    expect(s.physics).toEqual({ timeScale: 2, friction: 0, gravity: { x: -300, y: 300 } });
    expect(s.arena).toMatchObject({ width: 256, height: 4096 });
    expect(s.events).toEqual([
      { type: 'toast', text: 'a'.repeat(80) },
      { type: 'tint', color: '#ffffff', ms: 10000 },
    ]);
    const results = w.applyCommands(
      Array.from({ length: 400 }, () => ({ type: 'spawn', kind: 'enemy', opts: {} })),
    );
    expect(results.filter(Boolean)).toHaveLength(299);
    expect(w.snapshot().entities).toHaveLength(300);
    w.tick();
    expect(w.snapshot().entities.length).toBeLessThanOrEqual(300);
  });

  it('detaches snapshots while committing validated hook mutations', () => {
    const w = new World(1, {
      onStart(g) {
        g.player.hp = 1;
        const e = g.spawn('hazard', { x: 100, y: 100 });
        g.remove(e);
        g.physics.friction = 2;
        g.ui.toast('ready');
      },
    });
    expect(w.snapshot().player.hp).toBe(1);
    expect(w.snapshot().entities).toHaveLength(1);
    expect(w.snapshot().physics.friction).toBe(2);
    const before = hash(w),
      copy = w.snapshot();
    copy.player.hp = 0;
    copy.entities[0]!.tags.push('mutated');
    copy.physics.gravity.x = 123;
    expect(hash(w)).toBe(before);
    expect(JSON.parse(JSON.stringify(w.snapshot()))).toEqual(w.snapshot());
  });
});

describe('physics and collisions', () => {
  it('grid includes cross-cell and large-circle pairs without duplicates', () => {
    const base = new World().snapshot().player;
    const entities: Entity[] = [
      { ...base, id: 1, x: 63, y: 63, radius: 64 },
      { ...base, id: 2, x: 127, y: 63 },
      { ...base, id: 3, x: 900, y: 600 },
    ];
    expect(collisionPairs(entities).map(([a, b]) => [a.id, b.id])).toEqual([[1, 2]]);
  });
  it('applies arena clamp and wrap, gravity, friction, and time scaling', () => {
    const w = new World();
    w.applyCommands([{ type: 'setEntity', id: 1, fields: { x: 947, vx: 200 } }]);
    w.tick({ ...IDLE_INTENT, moveX: 1 });
    expect(w.snapshot().player.x).toBe(948);
    w.applyCommands([
      { type: 'setArena', arena: { wrap: true } },
      { type: 'setEntity', id: 1, fields: { x: 959, vx: 200 } },
    ]);
    w.tick({ ...IDLE_INTENT, moveX: 1 });
    // The command contributes capped external drift while control accelerates separately.
    const velocity = 200 / 6 + 150 * Math.exp(-1.3 / 60);
    expect(w.snapshot().player.x).toBeCloseTo(959 + velocity / 60 - 960);
    w.applyCommands([
      { type: 'spawn', kind: 'hazard', opts: { x: 100, y: 100, vx: 60 } },
      { type: 'setPhysics', physics: { timeScale: 2, friction: 1, gravity: { x: 0, y: 60 } } },
    ]);
    w.tick();
    const hazard = w.snapshot().entities.find((e) => e.kind === 'hazard')!;
    expect(hazard.vx).toBeCloseTo(60 * Math.exp(-2 / 60));
    expect(hazard.vy).toBeCloseTo(2 * Math.exp(-2 / 60));
    expect(hazard.x).toBeCloseTo(100 + (hazard.vx * 2) / 60);
  });
  it('hazards damage and pickups heal without exceeding max hp', () => {
    const w = new World();
    w.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    w.tick();
    expect(w.snapshot().player.hp).toBe(90);
    w.applyCommands([{ type: 'spawn', kind: 'pickup', opts: { x: 480, y: 320 } }]);
    w.tick();
    expect(w.snapshot().player.hp).toBe(100);
    expect(w.snapshot().entities.some((e) => e.kind === 'pickup')).toBe(false);
  });
});
