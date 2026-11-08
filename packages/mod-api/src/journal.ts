import type { Entity, Game } from '@patch-notes-live/engine';

type Value = number | string | boolean | string[] | undefined;
interface Layer {
  base: Value;
  owners: Map<number, Value>;
  entity?: number;
  field: string;
}
const RULE_FIELDS = ['radius', 'speed', 'color', 'tags', 'maxHp', 'shape', 'glow'] as const;
const copy = (v: Value): Value => (Array.isArray(v) ? [...v] : v);
const same = (a: Value, b: Value) => JSON.stringify(a) === JSON.stringify(b);

/** Restore owned rule settings and remove owned spawns without rewinding gameplay history. */
export class RuleJournal {
  private readonly layers = new Map<string, Layer>();
  private readonly spawns = new Map<number, Set<number>>();
  private readonly removed = new Set<number>();

  spawnedBy(entityId: number): number | undefined {
    for (const [owner, ids] of this.spawns)
      if (!this.removed.has(owner) && ids.has(entityId)) return owner;
  }

  remove(owner: number): void {
    this.removed.add(owner);
  }

  flush(g: Game): void {
    if (!this.removed.size) return;
    const entities = new Map(g.entities().map((e) => [e.id, e]));
    for (const [key, layer] of this.layers) {
      let changed = false;
      for (const owner of this.removed) changed = layer.owners.delete(owner) || changed;
      if (!changed) continue;
      const value = layer.owners.size ? [...layer.owners.values()].at(-1) : layer.base;
      if (layer.entity !== undefined) {
        const entity = entities.get(layer.entity);
        if (entity) g.set(entity, { [layer.field]: copy(value) });
      } else if (key.startsWith('gravity.'))
        g.physics.gravity[layer.field as 'x' | 'y'] = value as number;
      else if (key.startsWith('physics.')) Object.assign(g.physics, { [layer.field]: value });
      else Object.assign(g.arena, { [layer.field]: value });
      if (!layer.owners.size) this.layers.delete(key);
    }
    for (const owner of this.removed) {
      for (const id of this.spawns.get(owner) ?? []) {
        const e = entities.get(id);
        if (e) g.remove(e);
      }
      this.spawns.delete(owner);
    }
    this.removed.clear();
    for (const [key, layer] of this.layers)
      if (layer.entity !== undefined && !entities.has(layer.entity)) this.layers.delete(key);
  }

  invoke<T>(owner: number, g: Game, event: unknown, fn: (g: Game) => T): T {
    const tracked = new Map<number, { entity: Entity; before: Entity }>();
    const track = (entity: Entity): Entity => {
      if (!tracked.has(entity.id))
        tracked.set(entity.id, { entity, before: { ...entity, tags: [...entity.tags] } });
      return entity;
    };
    track(g.player);
    if (event && typeof event === 'object') {
      const e = event as Record<string, unknown>;
      for (const value of [e, e.attacker, e.target, e.killer, e.victim])
        if (value && typeof value === 'object' && 'id' in value && 'tags' in value)
          track(value as unknown as Entity);
    }
    const physics = { ...g.physics, gravity: { ...g.physics.gravity } },
      arena = { ...g.arena };
    const game: Game = {
      ...g,
      player: g.player,
      enemies: () => g.enemies().map(track),
      entities: () => g.entities().map(track),
      spawn: (kind, opts) => {
        const entity = g.spawn(kind, opts);
        const ids = this.spawns.get(owner) ?? new Set<number>();
        ids.add(entity.id);
        this.spawns.set(owner, ids);
        return track(entity);
      },
      set: (entity, fields) => {
        track(entity);
        g.set(entity, fields);
      },
    };
    const result = fn(game);
    const remember = (key: string, before: Value, after: Value, field: string, entity?: number) => {
      if (same(before, after)) return;
      const layer = this.layers.get(key) ?? {
        base: copy(before),
        owners: new Map<number, Value>(),
        field,
        ...(entity !== undefined ? { entity } : {}),
      };
      layer.owners.set(owner, copy(after));
      this.layers.set(key, layer);
    };
    for (const { entity, before } of tracked.values())
      for (const field of RULE_FIELDS)
        remember(`${entity.id}.${field}`, before[field], entity[field], field, entity.id);
    for (const axis of ['x', 'y'] as const)
      remember(`gravity.${axis}`, physics.gravity[axis], g.physics.gravity[axis], axis);
    for (const field of ['friction', 'timeScale'] as const)
      remember(`physics.${field}`, physics[field], g.physics[field], field);
    for (const field of ['width', 'height', 'wrap'] as const)
      remember(`arena.${field}`, arena[field], g.arena[field], field);
    return result;
  }
}
