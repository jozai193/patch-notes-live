import { describe, expect, it } from 'vitest';
import { botIntent, composeHosts, World } from '../src/index.js';

describe('bot pickups, wave pacing and host composition', () => {
  it('seeks the nearest pickup below 60% HP and avoids an enemy within 150px of the path', () => {
    const w = new World();
    w.applyCommands([
      { type: 'setEntity', id: 1, fields: { hp: 15 } },
      { type: 'spawn', kind: 'pickup', opts: { x: 700, y: 320 } },
      { type: 'spawn', kind: 'pickup', opts: { x: 850, y: 500 } },
    ]);
    expect(botIntent(w.snapshot())).toMatchObject({ moveX: 1, moveY: 0 });
    w.applyCommands([{ type: 'spawn', kind: 'enemy', opts: { x: 600, y: 400 } }]);
    expect(botIntent(w.snapshot()).moveX).toBeLessThan(0);
  });

  it('collects healing pickups while continuing to fire', () => {
    const w = new World(1, { onHit: () => ({ cancel: true }) });
    w.tick();
    w.applyCommands(
      w
        .snapshot()
        .entities.filter((e) => e.kind === 'enemy')
        .map((e) => ({ type: 'remove', id: e.id })),
    );
    w.applyCommands([
      { type: 'setEntity', id: 1, fields: { hp: 15 } },
      { type: 'spawn', kind: 'pickup', opts: { x: 540, y: 320 } },
    ]);
    for (let i = 0; i < 60; i++) w.tick(botIntent(w.snapshot()));
    expect(w.snapshot().player.hp).toBe(30);
  });

  it('starts the next wave 120 ticks after a clear, with a 600-tick maximum gap', () => {
    const w = new World(1, { onHit: () => ({ cancel: true }) });
    w.tick();
    w.applyCommands(
      w
        .snapshot()
        .entities.filter((e) => e.kind === 'enemy')
        .map((e) => ({ type: 'remove', id: e.id })),
    );
    for (let i = 0; i < 119; i++) w.tick();
    expect(w.snapshot().wave).toBe(1);
    w.tick();
    expect(w.snapshot().wave).toBe(2);
    for (let i = 0; i < 600; i++) w.tick();
    expect(w.snapshot().wave).toBe(3);
  });

  it('calls hosts in order, chains damage, and keeps any cancellation', () => {
    const order: string[] = [],
      damages: number[] = [];
    const w = new World(
      1,
      composeHosts(
        {
          onStart() {
            order.push('a');
          },
          onHit(_g, e) {
            damages.push(e.damage);
            return { damage: 4, cancel: true };
          },
        },
        {
          onStart() {
            order.push('b');
          },
          onHit(_g, e) {
            damages.push(e.damage);
            return { damage: e.damage * 2, cancel: false };
          },
        },
      ),
    );
    w.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    w.tick();
    expect(order).toEqual(['a', 'b']);
    expect(damages).toEqual([10, 4]);
    expect(w.snapshot().player.hp).toBe(100);
    const damage = new World(
      1,
      composeHosts(
        { onHit: () => ({ damage: 4 }) },
        { onHit: (_g, e) => ({ damage: e.damage * 2 }) },
      ),
    );
    damage.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    damage.tick();
    expect(damage.snapshot().player.hp).toBe(92);
  });
});
