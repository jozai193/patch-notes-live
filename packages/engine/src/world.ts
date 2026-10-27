import { Random } from './random.js';
import { collisionPairs } from './grid.js';
import { HookEntities } from './hook-entities.js';
import { Motion } from './motion.js';
import { clamp, cloneEntity, color, fields, finite, record } from './validation.js';
import type {
  Arena,
  Command,
  Entity,
  Game,
  Intent,
  ModHost,
  Physics,
  Snapshot,
  SpawnKind,
  SpawnOpts,
  UIEvent,
} from './types.js';

export const DT = 1 / 60;
export const ENTITY_CAP = 300;
export const IDLE_INTENT: Intent = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, fire: false };
const defaults = (id: number, kind: string, x: number, y: number): Entity => ({
  id,
  kind,
  x,
  y,
  vx: 0,
  vy: 0,
  radius: kind === 'projectile' ? 4 : 12,
  hp: kind === 'player' ? 100 : 20,
  maxHp: kind === 'player' ? 100 : 20,
  speed: kind === 'player' ? 200 : kind === 'enemy' ? 65 : 0,
  color: kind === 'player' ? '#77ddff' : '#ff7755',
  tags: [],
});

export class World {
  private readonly rng: Random;
  private readonly host: ModHost;
  private readonly all = new Map<number, Entity>();
  private readonly expiry = new Map<number, number>();
  private readonly hitAt = new Map<number, number>();
  private readonly motion = new Motion();
  private readonly state: Record<string, unknown> = {};
  private arena: Arena = { width: 960, height: 640, wrap: false };
  private physics: Physics = { gravity: { x: 0, y: 0 }, friction: 0, timeScale: 1 };
  private events: UIEvent[] = [];
  private nextId = 1;
  private ticks = 0;
  private wave = 0;
  private nextWaveAt = 1;
  private clearedAt: number | undefined;
  private score = 0;
  private lastShot = -15;
  private readonly player: Entity;
  private spawnEvents: Entity[] = [];
  private flushing = false;

  constructor(seed = 1, host: ModHost = {}) {
    this.rng = new Random(seed);
    this.host = host;
    this.player = defaults(this.nextId++, 'player', 480, 320);
    this.all.set(this.player.id, this.player);
    this.invoke((g) => this.host.onStart?.(g));
    this.spawnEvents.push(cloneEntity(this.player));
    this.flushSpawns();
  }

  snapshot(): Snapshot {
    return {
      tick: this.ticks,
      time: this.ticks * DT,
      rngState: this.rng.state,
      wave: this.wave,
      score: this.score,
      gameOver: this.player.hp <= 0,
      player: cloneEntity(this.player),
      entities: [...this.all.values()].map(cloneEntity),
      physics: { ...this.physics, gravity: { ...this.physics.gravity } },
      arena: { ...this.arena },
      events: this.events.map((e) => ({ ...e })),
    };
  }

  /** Consume queued UI events independently of simulation ticks and snapshots. */
  drainEvents(): UIEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Hooks see copies. Mutator methods enqueue commands, never expose live entities. */
  private invoke<T>(fn: (g: Game, copy: (entity: Entity) => Entity) => T): T {
    const queued: Command[] = [];
    const entities = new HookEntities();
    const physics = { ...this.physics, gravity: { ...this.physics.gravity } };
    const arena = { ...this.arena };
    const originalPhysics = JSON.stringify(physics),
      originalArena = JSON.stringify(arena);
    const g: Game = {
      time: this.ticks * DT,
      rand: () => this.rng.next(),
      player: entities.copy(this.player),
      enemies: () => [...this.all.values()].filter((e) => e.kind === 'enemy').map(entities.copy),
      entities: () => [...this.all.values()].map(entities.copy),
      spawn: (kind, opts) => {
        // Reserve an ID so a following remove in the same hook can refer to it.
        const id = this.nextId++;
        const safe = fields(opts);
        if (!safe || !['enemy', 'pickup', 'hazard'].includes(kind))
          throw new Error('Invalid spawn');
        const entity = { ...defaults(id, kind, this.player.x, this.player.y), ...safe };
        pendingSpawns.set(queued.length, id);
        queued.push({ type: 'spawn', kind, opts: safe });
        return entities.copy(entity);
      },
      set: entities.set,
      remove: (e) => {
        queued.push({ type: 'remove', id: e.id });
      },
      physics,
      arena,
      ui: {
        toast: (text) => {
          queued.push({ type: 'toast', text });
        },
        tint: (color, ms) => {
          queued.push({ type: 'tint', color, ms });
        },
      },
      state: this.state,
    };
    const pendingSpawns = new Map<number, number>();
    const result = fn(g, entities.copy);
    queued.push(...entities.commands());
    if (JSON.stringify(physics) !== originalPhysics) queued.push({ type: 'setPhysics', physics });
    if (JSON.stringify(arena) !== originalArena) queued.push({ type: 'setArena', arena });
    for (let i = 0; i < Math.min(queued.length, 1000); i++)
      this.applyOne(queued[i], pendingSpawns.get(i));
    return result;
  }

  private flushSpawns(): void {
    if (this.flushing) return;
    this.flushing = true;
    try {
      // Bound hook-generated spawn chains even when a hook removes and respawns itself.
      for (let i = 0; this.spawnEvents.length && i < 1000; i++) {
        const e = this.spawnEvents.shift()!;
        this.invoke((g, copy) => this.host.onSpawn?.(g, copy(this.all.get(e.id) ?? e)));
      }
      this.spawnEvents = [];
    } finally {
      this.flushing = false;
    }
  }

  /** Accept unknown at the sandbox boundary; return one acceptance flag per command. */
  applyCommands(cmds: readonly unknown[]): boolean[] {
    const results = cmds.map((cmd, i) => i < 1000 && this.applyOne(cmd));
    this.flushSpawns();
    return results;
  }

  private applyOne(cmd: unknown, reservedId?: number): boolean {
    if (!record(cmd)) return false;
    switch (cmd.type) {
      case 'spawn': {
        const safe = fields(cmd.opts);
        if (
          !safe ||
          !['enemy', 'pickup', 'hazard'].includes(String(cmd.kind)) ||
          this.all.size >= ENTITY_CAP
        )
          return false;
        this.spawn(cmd.kind as SpawnKind, safe, reservedId);
        return true;
      }
      case 'remove': {
        if (!finite(cmd.id) || cmd.id === this.player.id || !this.all.has(cmd.id)) return false;
        this.remove(cmd.id);
        return true;
      }
      case 'setEntity': {
        const e = finite(cmd.id) ? this.all.get(cmd.id) : undefined,
          safe = fields(cmd.fields);
        if (!e || !safe) return false;
        Object.assign(e, safe);
        if (safe.vx !== undefined) this.motion.reset(e.id, 'x');
        if (safe.vy !== undefined) this.motion.reset(e.id, 'y');
        e.hp = Math.min(e.hp, e.maxHp);
        this.bound(e);
        return true;
      }
      case 'setPhysics': {
        const p = cmd.physics;
        if (
          !record(p) ||
          Object.keys(p).some((k) => !['gravity', 'friction', 'timeScale'].includes(k))
        )
          return false;
        if ('gravity' in p && (!record(p.gravity) || !finite(p.gravity.x) || !finite(p.gravity.y)))
          return false;
        if (('friction' in p && !finite(p.friction)) || ('timeScale' in p && !finite(p.timeScale)))
          return false;
        if (record(p.gravity))
          this.physics.gravity = {
            x: clamp(p.gravity.x as number, -300, 300),
            y: clamp(p.gravity.y as number, -300, 300),
          };
        if (finite(p.friction)) this.physics.friction = clamp(p.friction, 0, 10);
        if (finite(p.timeScale)) this.physics.timeScale = clamp(p.timeScale, 0.1, 2);
        return true;
      }
      case 'setArena': {
        const a = cmd.arena;
        if (!record(a) || Object.keys(a).some((k) => !['width', 'height', 'wrap'].includes(k)))
          return false;
        if (
          ('width' in a && !finite(a.width)) ||
          ('height' in a && !finite(a.height)) ||
          ('wrap' in a && typeof a.wrap !== 'boolean')
        )
          return false;
        if (finite(a.width)) this.arena.width = clamp(a.width, 256, 4096);
        if (finite(a.height)) this.arena.height = clamp(a.height, 256, 4096);
        if (typeof a.wrap === 'boolean') this.arena.wrap = a.wrap;
        for (const e of this.all.values()) this.bound(e);
        return true;
      }
      case 'toast':
        if (typeof cmd.text !== 'string') return false;
        this.events.push({
          type: 'toast',
          text: cmd.text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80),
        });
        break;
      case 'tint':
        if (!color(cmd.color) || !finite(cmd.ms)) return false;
        this.events.push({ type: 'tint', color: cmd.color, ms: clamp(cmd.ms, 0, 10000) });
        break;
      default:
        return false;
    }
    this.events = this.events.slice(-32);
    return true;
  }

  private spawn(kind: string, opts: SpawnOpts = {}, reservedId?: number): Entity {
    const e = {
      ...defaults(reservedId ?? this.nextId++, kind, this.player.x, this.player.y),
      ...opts,
    };
    e.tags = [...e.tags];
    e.hp = Math.min(e.hp, e.maxHp);
    this.bound(e);
    this.all.set(e.id, e);
    if (kind === 'enemy') this.clearedAt = undefined;
    this.spawnEvents.push(cloneEntity(e));
    return e;
  }
  private remove(id: number): void {
    const wasEnemy = this.all.get(id)?.kind === 'enemy';
    this.all.delete(id);
    if (wasEnemy && ![...this.all.values()].some((e) => e.kind === 'enemy'))
      this.clearedAt = this.ticks;
    this.expiry.delete(id);
    this.hitAt.delete(id);
    this.motion.reset(id);
  }

  private bound(e: Entity): void {
    for (const [axis, size] of [
      ['x', this.arena.width],
      ['y', this.arena.height],
    ] as const) {
      if (this.arena.wrap) e[axis] = ((e[axis] % size) + size) % size;
      else {
        const next = clamp(e[axis], e.radius, size - e.radius);
        if (next !== e[axis]) {
          e[axis === 'x' ? 'vx' : 'vy'] = 0;
          this.motion.reset(e.id, axis);
        }
        e[axis] = next;
      }
    }
  }

  tick(intent: Intent = IDLE_INTENT): void {
    if (this.player.hp <= 0) return;
    this.ticks++;
    this.invoke((g) => this.host.onTick?.(g, DT));
    this.flushSpawns();
    if (this.player.hp <= 0) return;
    if (this.ticks >= Math.min(this.nextWaveAt, (this.clearedAt ?? Infinity) + 120)) {
      this.wave++;
      this.nextWaveAt = this.ticks + 600;
      this.clearedAt = undefined;
      for (let i = 0; i < 3 + this.wave * 2 && this.all.size < ENTITY_CAP; i++) {
        const side = Math.floor(this.rng.next() * 4),
          t = this.rng.next();
        this.spawn('enemy', {
          x: side < 2 ? (side ? this.arena.width - 16 : 16) : t * this.arena.width,
          y: side >= 2 ? (side === 2 ? 16 : this.arena.height - 16) : t * this.arena.height,
          speed: Math.min(150, 55 + this.wave * 7),
        });
      }
      this.flushSpawns();
    }
    const mx = finite(intent.moveX) ? clamp(intent.moveX, -1, 1) : 0,
      my = finite(intent.moveY) ? clamp(intent.moveY, -1, 1) : 0;
    const norm = Math.max(1, Math.hypot(mx, my));
    if (
      intent.fire &&
      finite(intent.aimX) &&
      finite(intent.aimY) &&
      this.ticks - this.lastShot >= 12 &&
      this.all.size < ENTITY_CAP
    ) {
      const dx = intent.aimX - this.player.x,
        dy = intent.aimY - this.player.y,
        d = Math.hypot(dx, dy);
      if (d > 0) {
        const e = this.spawn('projectile', {
          x: this.player.x,
          y: this.player.y,
          vx: (dx / d) * 480,
          vy: (dy / d) * 480,
        });
        this.expiry.set(e.id, this.ticks + 120);
        this.lastShot = this.ticks;
        this.flushSpawns();
      }
    }
    const dt = DT * this.physics.timeScale;
    for (const e of [...this.all.values()]) {
      if (e.hp <= 0 && e !== this.player) {
        this.kill(e);
        continue;
      }
      if ((this.expiry.get(e.id) ?? Infinity) <= this.ticks) {
        this.remove(e.id);
        continue;
      }
      let desired;
      if (e === this.player) desired = { x: (mx / norm) * e.speed, y: (my / norm) * e.speed };
      else if (e.kind === 'enemy') {
        const dx = this.player.x - e.x,
          dy = this.player.y - e.y,
          d = Math.hypot(dx, dy);
        desired = { x: d ? (dx / d) * e.speed : 0, y: d ? (dy / d) * e.speed : 0 };
      }
      this.motion.integrate(e, desired, this.physics, dt);
      this.bound(e);
    }
    for (const [a, b] of collisionPairs([...this.all.values()])) {
      if (this.player.hp <= 0) break;
      if (
        !this.all.has(a.id) ||
        !this.all.has(b.id) ||
        Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius
      )
        continue;
      if (a.kind === 'projectile' && b.kind === 'enemy') this.projectileHit(a, b);
      else if (b.kind === 'projectile' && a.kind === 'enemy') this.projectileHit(b, a);
      else if (a === this.player || b === this.player) {
        const other = a === this.player ? b : a;
        if (other.kind === 'pickup') {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 15);
          this.remove(other.id);
        } else if (
          ['enemy', 'hazard'].includes(other.kind) &&
          this.ticks >= (this.hitAt.get(other.id) ?? 0)
        ) {
          this.hitAt.set(other.id, this.ticks + 30);
          this.damage(other, this.player, 10);
        }
      }
    }
    this.flushSpawns();
    if (this.clearedAt === undefined && ![...this.all.values()].some((e) => e.kind === 'enemy'))
      this.clearedAt = this.ticks;
  }

  private projectileHit(projectile: Entity, enemy: Entity): void {
    this.damage(projectile, enemy, 20);
    this.remove(projectile.id);
  }
  private damage(attacker: Entity, target: Entity, damage: number): void {
    const response = this.invoke((g, copy) =>
      this.host.onHit?.(g, { attacker: copy(attacker), target: copy(target), damage }),
    );
    if (response?.cancel === true || !this.all.has(target.id)) return;
    const amount = finite(response?.damage) ? clamp(response.damage, 0, 1000) : damage;
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp <= 0) this.kill(target, attacker);
  }
  private kill(victim: Entity, killer?: Entity): void {
    if (victim.kind === 'enemy') this.score += 10;
    if (victim !== this.player) this.remove(victim.id);
    this.invoke((g, copy) =>
      this.host.onKill?.(g, { victim: copy(victim), ...(killer ? { killer: copy(killer) } : {}) }),
    );
    if (victim.kind === 'enemy' && this.rng.next() < 0.2 && this.all.size < ENTITY_CAP)
      this.spawn('pickup', { x: victim.x, y: victim.y, color: '#55ff88' });
  }
}
