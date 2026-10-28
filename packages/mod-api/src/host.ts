import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import type { Entity, Game, ModHost } from '@patch-notes-live/engine';
import { ModRuntime } from './runtime.js';
import type { Fault, LogEntry, ModInfo } from './types.js';

// Never cache the WASM instance: an abort must be confined to exactly one mod.
export function loadQuickJS(): Promise<QuickJSWASMModule> {
  return newQuickJSWASMModuleFromVariant(import('@jitl/quickjs-wasmfile-release-sync'));
}

export class SandboxHost implements ModHost {
  readonly faults: Fault[] = [];
  readonly logs: LogEntry[] = [];
  private readonly runtimes: ModRuntime[];

  static async create(sources: string[]): Promise<SandboxHost> {
    if (sources.length > 3) throw new Error('At most 3 mods can be active');
    const modules = await Promise.all(sources.map(() => loadQuickJS()));
    return new SandboxHost(modules, sources);
  }

  constructor(modules: QuickJSWASMModule[], sources: string[]) {
    if (sources.length > 3) throw new Error('At most 3 mods can be active');
    if (modules.length !== sources.length || new Set(modules).size !== modules.length)
      throw new Error('Each mod requires its own WASM module instance');
    this.runtimes = sources.map(
      (source, index) =>
        new ModRuntime(
          modules[index]!,
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
    return !!info && !info.disabled && !info.disposed && info.faultCount === 0;
  }
  onStart(g: Game): void {
    for (const mod of this.runtimes) mod.invoke('onStart', g);
  }
  onTick(g: Game, dt: number): void {
    for (const mod of this.runtimes) {
      mod.beginTick(Math.round(g.time * 60));
      mod.invoke('onTick', g, undefined, dt);
    }
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
