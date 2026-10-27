import { describe, expect, it } from 'vitest';
import { IDLE_INTENT, World } from '../src/index.js';
import type { Entity } from '../src/index.js';

describe('Step 1 review regressions', () => {
  it('gravity.y=300 moves an idle player at least 100px in 60 ticks', () => {
    const w = new World(1);
    const start = w.snapshot().player.y;
    w.applyCommands([{ type: 'setPhysics', physics: { gravity: { x: 0, y: 300 } } }]);
    for (let i = 0; i < 60; i++) w.tick(IDLE_INTENT);
    expect(w.snapshot().tick).toBe(60);
    expect(w.snapshot().player.y - start).toBeGreaterThanOrEqual(100);
    expect(w.snapshot().player.y - start).toBeCloseTo(113.75);
    expect(w.snapshot().player.vy).toBeCloseTo(150);
  });

  it('can climb at least 40px against sustained gravity after 10 seconds at the floor', () => {
    const w = new World(1, { onHit: () => ({ cancel: true }) });
    w.applyCommands([{ type: 'setPhysics', physics: { gravity: { x: 0, y: 300 } } }]);
    for (let i = 0; i < 600; i++) w.tick(IDLE_INTENT);
    const floor = w.snapshot().player.y;
    expect(floor).toBe(w.snapshot().arena.height - w.snapshot().player.radius);
    for (let i = 0; i < 60; i++) w.tick({ ...IDLE_INTENT, moveY: -1 });
    expect(w.snapshot().tick).toBe(660);
    expect(floor - w.snapshot().player.y).toBeGreaterThanOrEqual(40);
  });

  it('steers player and enemies gradually; friction reduces both movement and gravity drift', () => {
    const simulate = (friction: number, gravity: number) => {
      const w = new World(1);
      w.applyCommands([
        { type: 'spawn', kind: 'enemy', opts: { x: 100, y: 100, speed: 100 } },
        { type: 'setPhysics', physics: { friction, gravity: { x: 0, y: gravity } } },
      ]);
      w.tick({ ...IDLE_INTENT, moveX: 1 });
      expect(w.snapshot().player.vx).toBeGreaterThan(0);
      expect(w.snapshot().player.vx).toBeLessThan(200);
      const firstEnemy = w.snapshot().entities.find((e) => e.id === 2)!;
      expect(Math.hypot(firstEnemy.vx, firstEnemy.vy)).toBeLessThan(100);
      for (let i = 1; i < 60; i++) w.tick({ ...IDLE_INTENT, moveX: 1 });
      return { player: w.snapshot().player, enemy: w.snapshot().entities.find((e) => e.id === 2)! };
    };
    const normal = simulate(0, 0),
      friction = simulate(5, 0);
    expect(friction.player.x).toBeLessThan(normal.player.x);
    expect(friction.enemy.x).toBeLessThan(normal.enemy.x);
    const gravity = simulate(0, 300),
      drag = simulate(5, 300);
    expect(gravity.enemy.y - normal.enemy.y).toBeGreaterThan(100);
    expect(drag.player.y).toBeLessThan(gravity.player.y);
    expect(drag.enemy.y).toBeLessThan(gravity.enemy.y);
  });

  it('commits onSpawn radius=40 and speed=300, and onTick player.speed=50', () => {
    const w = new World(1, {
      onSpawn(_g, e) {
        if (e.kind === 'enemy') {
          e.radius = 40;
          e.speed = 300;
          Object.assign(e, { customModProperty: 'ignored' });
        }
      },
      onTick(g) {
        g.player.speed = 50;
      },
    });
    w.tick();
    expect(w.snapshot().player.speed).toBe(50);
    const enemies = w.snapshot().entities.filter((e) => e.kind === 'enemy');
    expect(enemies).toHaveLength(5);
    for (const enemy of enemies) {
      expect(enemy).toMatchObject({ radius: 40, speed: 300 });
      expect(enemy).not.toHaveProperty('customModProperty');
    }
  });

  it('tracks spawn return values, aliases from entity lists, tags, and explicit g.set', () => {
    let retained: Entity | undefined;
    const w = new World(1, {
      onStart(g) {
        retained = g.spawn('enemy', { x: 100, y: 100 });
        retained.radius = 40;
        retained.tags.push('spawned');
        g.set(retained, { speed: 300 });
      },
      onSpawn(_g, e) {
        if (e.id === 2) {
          expect(e.radius).toBe(40);
          expect(e.speed).toBe(300);
        }
      },
      onTick(g) {
        const enemy = g.enemies().find((e) => e.id === 2)!;
        enemy.radius = 45;
        const alias = g.entities().find((e) => e.id === 2)!;
        expect(alias).toBe(enemy);
        alias.tags.push('listed');
        g.set(alias, { speed: 250 });
        alias.speed = 275;
        g.set(g.player, { speed: 50 });
      },
    });
    retained!.radius = 1;
    expect(w.snapshot().entities.find((e) => e.id === 2)!.radius).toBe(40);
    w.tick();
    expect(w.snapshot().player.speed).toBe(50);
    expect(w.snapshot().entities.find((e) => e.id === 2)).toMatchObject({
      radius: 45,
      speed: 275,
      tags: ['spawned', 'listed'],
    });
  });

  it('tracks onHit and onKill arguments through validation, preserving entity identity', () => {
    const w = new World(1, {
      onHit(g, { attacker, target }) {
        expect(target).toBe(g.player);
        attacker.radius = 40;
        target.speed = 9999;
        target.id = 999;
        target.kind = 'enemy';
        Object.assign(target, { extra: true });
        return { damage: 100 };
      },
      onKill(_g, { killer, victim }) {
        killer!.color = '#123456';
        victim.tags.push('dead');
      },
    });
    w.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    w.tick();
    expect(w.snapshot().player).toMatchObject({
      id: 1,
      kind: 'player',
      speed: 400,
      hp: 0,
      tags: ['dead'],
    });
    expect(w.snapshot().entities.find((e) => e.id === 2)).toMatchObject({
      radius: 40,
      color: '#123456',
    });
    expect(w.snapshot().player).not.toHaveProperty('extra');
  });

  it('rejects invalid hook field changes and does not resurrect removed spawns', () => {
    const w = new World(1, {
      onStart(g) {
        g.player.speed = NaN;
        const e = g.spawn('enemy', {});
        e.radius = 40;
        g.remove(e);
        g.set(g.player, { radius: Infinity });
      },
    });
    expect(w.snapshot().player).toMatchObject({ speed: 200, radius: 12 });
    expect(w.snapshot().entities).toHaveLength(1);
  });

  it('retains between-tick toasts and tints until drainEvents, with a 32-event cap', () => {
    const w = new World(1);
    w.tick();
    w.applyCommands([
      { type: 'toast', text: 'between ticks' },
      { type: 'tint', color: '#112233', ms: 1000 },
    ]);
    w.tick();
    const expected = [
      { type: 'toast', text: 'between ticks' },
      { type: 'tint', color: '#112233', ms: 1000 },
    ];
    expect(w.snapshot().events).toEqual(expected);
    expect(w.snapshot().events).toEqual(expected);
    expect(w.drainEvents()).toEqual(expected);
    expect(w.drainEvents()).toEqual([]);
    expect(w.snapshot().events).toEqual([]);
    w.applyCommands(Array.from({ length: 40 }, (_, i) => ({ type: 'toast', text: String(i) })));
    w.tick();
    expect(w.snapshot().events).toHaveLength(32);
    expect(w.drainEvents()).toEqual(
      Array.from({ length: 32 }, (_, i) => ({ type: 'toast', text: String(i + 8) })),
    );
  });
});
