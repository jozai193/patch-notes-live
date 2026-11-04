// Mod API v1. Mods export default { name, description, patchNotes?, hooks }.
export interface Vec {
  x: number;
  y: number;
}
export type SpawnOpts = Partial<Omit<Entity, 'id' | 'kind'>>;
export interface Hooks {
  onStart?(g: Game): void;
  onTick?(g: Game, dt: number): void;
  onHit?(
    g: Game,
    e: { attacker: Entity; target: Entity; damage: number },
  ): void | { damage?: number; cancel?: boolean };
  onSpawn?(g: Game, e: Entity): void;
  onKill?(g: Game, e: { killer?: Entity; victim: Entity }): void;
}
export interface Game {
  time: number;
  rand(): number;
  player: Entity;
  enemies(): Entity[];
  entities(): Entity[];
  spawn(kind: 'enemy' | 'pickup' | 'hazard', opts: SpawnOpts): Entity;
  remove(e: Entity): void;
  set(entity: Entity, fields: Partial<Omit<Entity, 'id' | 'kind'>>): void;
  physics: { gravity: Vec; friction: number; timeScale: number };
  arena: { width: number; height: number; wrap: boolean };
  ui: { toast(text: string): void; tint(color: string, ms: number): void };
  /** Cosmetic only; at most 40 particles per call and 120 per tick across all mods. */
  fx: { burst(x: number, y: number, color: string, count: number): void };
  state: Record<string, unknown>;
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
  /** Glow intensity, clamped to 0..1. Omit for the kind default. */
  glow?: number | undefined;
}
export interface Mod {
  name: string;
  description: string;
  /** Dramatic, family-friendly notes; controls stripped and capped at 140 characters. */
  patchNotes?: string;
  hooks: Hooks;
}
