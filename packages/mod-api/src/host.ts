import { newQuickJSWASMModule, RELEASE_SYNC } from 'quickjs-emscripten';
import type { QuickJSWASMModule } from 'quickjs-emscripten';
import type { Entity, Game, ModHost } from '@patch-notes-live/engine';
import { ModRuntime } from './runtime.js';
import type { Fault, LogEntry, ModInfo } from './types.js';

let modulePromise: Promise<QuickJSWASMModule> | undefined;
export function loadQuickJS(): Promise<QuickJSWASMModule> {
  return (modulePromise ??= newQuickJSWASMModule(RELEASE_SYNC));
}

export class SandboxHost implements ModHost {
  readonly faults: Fault[] = [];
  readonly logs: LogEntry[] = [];
  private readonly runtimes: ModRuntime[];

  static async create(sources: string[]): Promise<SandboxHost> {
    return new SandboxHost(await loadQuickJS(), sources);
  }

  constructor(module: QuickJSWASMModule, sources: string[]) {
    if (sources.length > 3) throw new Error('At most 3 mods can be active');
    this.runtimes = sources.map(
      (source, index) =>
        new ModRuntime(
          module,
          source,
          index,
          (fault) => {
            this.faults.push(fault);
            if (this.faults.length > 256) this.faults.shift();
          },
          this.logs,
        ),
    );
  }

  get mods(): readonly ModInfo[] {
    return this.runtimes.map((r) => ({ ...r.info, hooks: [...r.info.hooks] }));
  }
  isHealthy(mod: string | number | ModInfo): boolean {
    const info = this.mods.find((m) =>
      typeof mod === 'number'
        ? m.id === mod
        : typeof mod === 'string'
          ? m.name === mod
          : m.id === mod.id,
    );
    return !!info && info.faultCount === 0;
  }
  onStart(g: Game): void {
    for (const mod of this.runtimes) mod.invoke('onStart', g);
  }
  onTick(g: Game, dt: number): void {
    for (const mod of this.runtimes) mod.invoke('onTick', g, undefined, dt);
  }
  onSpawn(g: Game, e: Entity): void {
    for (const mod of this.runtimes) mod.invoke('onSpawn', g, e);
  }
  onKill(g: Game, e: { killer?: Entity; victim: Entity }): void {
    for (const mod of this.runtimes) mod.invoke('onKill', g, e);
  }
  onHit(g: Game, e: { attacker: Entity; target: Entity; damage: number }) {
    let damage = e.damage,
      cancel = false;
    for (const mod of this.runtimes) {
      const result = mod.invoke('onHit', g, { ...e, damage });
      if (result?.damage !== undefined) damage = result.damage;
      cancel ||= result?.cancel === true;
    }
    return { damage, cancel };
  }
  dispose(): void {
    for (const mod of this.runtimes) mod.dispose();
  }
}
