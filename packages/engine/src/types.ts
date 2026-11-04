export interface Vec {
  x: number;
  y: number;
}
export interface Entity {
  id: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  color: string;
  tags: string[];
  shape?: 'circle' | 'triangle' | 'square' | 'hex' | 'star' | 'diamond' | undefined;
  glow?: number | undefined;
}
export interface Intent {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire: boolean;
}
export interface Physics {
  gravity: Vec;
  friction: number;
  timeScale: number;
}
export interface Arena {
  width: number;
  height: number;
  wrap: boolean;
}
export type SpawnKind = 'enemy' | 'pickup' | 'hazard';
export type EntityFields = Partial<Omit<Entity, 'id' | 'kind'>>;
export type SpawnOpts = EntityFields;
export type Command =
  | { type: 'spawn'; kind: SpawnKind; opts: SpawnOpts }
  | { type: 'remove'; id: number }
  | { type: 'setEntity'; id: number; fields: EntityFields }
  | { type: 'setPhysics'; physics: Partial<Physics> }
  | { type: 'setArena'; arena: Partial<Arena> }
  | { type: 'toast'; text: string }
  | { type: 'tint'; color: string; ms: number }
  | { type: 'burst'; x: number; y: number; color: string; count: number };
export interface Game {
  time: number;
  rand(): number;
  player: Entity;
  enemies(): Entity[];
  entities(): Entity[];
  spawn(kind: SpawnKind, opts: SpawnOpts): Entity;
  remove(e: Entity): void;
  set(entity: Entity, fields: EntityFields): void;
  physics: Physics;
  arena: Arena;
  ui: { toast(text: string): void; tint(color: string, ms: number): void };
  fx: { burst(x: number, y: number, color: string, count: number): void };
  state: Record<string, unknown>;
}
export interface ModHost {
  onStart?(g: Game): void;
  onTick?(g: Game, dt: number): void;
  onHit?(
    g: Game,
    e: { attacker: Entity; target: Entity; damage: number },
  ): void | { damage?: number; cancel?: boolean };
  onSpawn?(g: Game, e: Entity): void;
  onKill?(g: Game, e: { killer?: Entity; victim: Entity }): void;
}
export type UIEvent =
  | { type: 'toast'; text: string }
  | { type: 'tint'; color: string; ms: number }
  | { type: 'burst'; x: number; y: number; color: string; count: number };
export interface Snapshot {
  tick: number;
  time: number;
  rngState: number;
  wave: number;
  score: number;
  gameOver: boolean;
  player: Entity;
  entities: Entity[];
  physics: Physics;
  arena: Arena;
  events: UIEvent[];
}
