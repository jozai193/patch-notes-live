// Mod API v1. Mods export default { name, description, hooks }.
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
}
export interface Mod {
  name: string;
  description: string;
  hooks: Hooks;
}
