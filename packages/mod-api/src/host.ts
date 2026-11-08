import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import type { Entity, Game, ModHost } from '@patch-notes-live/engine';
import { ModRuntime } from './runtime.js';
import type { Fault, LogEntry, ModInfo } from './types.js';
import { RuleJournal } from './journal.js';

// Never cache the WASM instance: an abort must be confined to exactly one mod.
export function loadQuickJS(): Promise<QuickJSWASMModule> {
  return newQuickJSWASMModuleFromVariant(import('@jitl/quickjs-wasmfile-release-sync'));
}

export class SandboxHost implements ModHost {
  readonly faults: Fault[] = [];
  readonly logs: LogEntry[] = [];
  private readonly runtimes: ModRuntime[];
  private readonly pending = new Set<number>();
  private readonly loading = new Set<string>();
  private readonly cancelled = new Set<string>();
  private readonly journal = new RuleJournal();
  private nextId = 0;
  private closed = false;

  static async create(sources: string[]): Promise<SandboxHost> {
    if (sources.length > 3) throw new Error('At most 3 mods can be active');
    const modules = await Promise.all(sources.map(() => loadQuickJS()));
    return new SandboxHost(modules, sources);
  }

  constructor(modules: QuickJSWASMModule[], sources: string[]) {
    if (sources.length > 3) throw new Error('At most 3 mods can be active');
    if (modules.length !== sources.length || new Set(modules).size !== modules.length)
      throw new Error('Each mod requires its own WASM module instance');
    this.nextId = sources.length;
    this.runtimes = sources.map(
      (source, index) =>
        new ModRuntime(
          modules[index]!,
          source,
          index,
          (fault) => {
            this.faults.push({ ...fault, modId: index });
            if (this.faults.length > 256) this.faults.shift();
          },
          this.logs,
        ),
    );
  }

  async addMod(id: string, source: string): Promise<void> {
    if (this.closed || this.loading.has(id) || this.runtimes.some((m) => m.info.patchId === id))
      throw new Error('Sandbox closed or duplicate patch ID');
    if (this.runtimes.length + this.loading.size >= 3)
      throw new Error('At most 3 mods can be active');
    this.loading.add(id);
    try {
      const module = await loadQuickJS();
      if (this.closed || this.cancelled.has(id))
        throw new Error('Sandbox closed or mod addition cancelled');
      const index = this.nextId++;
      const runtime = new ModRuntime(
        module,
        source,
        index,
        (fault) => {
          this.faults.push({ ...fault, modId: index });
          if (this.faults.length > 256) this.faults.shift();
        },
        this.logs,
      );
      runtime.info.patchId = id;
      this.runtimes.push(runtime);
      this.pending.add(index);
    } finally {
      this.loading.delete(id);
      this.cancelled.delete(id);
    }
  }

  removeMod(id: string): boolean {
    if (this.loading.has(id)) {
      this.cancelled.add(id);
      return true;
    }
    const index = this.runtimes.findIndex((m) => m.info.patchId === id);
    if (index < 0) return false;
    const [runtime] = this.runtimes.splice(index, 1);
    this.pending.delete(runtime!.info.id);
    this.journal.remove(runtime!.info.id);
    runtime!.dispose();
    return true;
  }

  private invoke(
    mod: ModRuntime,
    hook: Parameters<ModRuntime['invoke']>[0],
    g: Game,
    event?: unknown,
    dt?: number,
  ) {
    if (mod.info.disabled || !mod.info.hooks.includes(hook)) return;
    return this.journal.invoke(mod.info.id, g, event, (game) => mod.invoke(hook, game, event, dt));
  }

  get mods(): readonly ModInfo[] {
    return this.runtimes.map((r) => ({ ...r.info, hooks: [...r.info.hooks] }));
  }
  /** Read-only provenance for render-only patch halos; not exposed inside the VM. */
  spawnedBy(entityId: number): string | undefined {
    const owner = this.journal.spawnedBy(entityId);
    return owner === undefined
      ? undefined
      : this.runtimes.find((m) => m.info.id === owner)?.info.patchId;
  }
  isHealthy(mod: string | number | ModInfo): boolean {
    const info = this.mods.find((m) =>
      typeof mod === 'number'
        ? m.id === mod
        : typeof mod === 'string'
          ? m.patchId === mod || m.name === mod
          : m.id === mod.id,
    );
    return !!info && !info.disabled && !info.disposed && info.faultCount === 0;
  }
  onStart(g: Game): void {
    for (const mod of this.runtimes) {
      this.pending.delete(mod.info.id);
      this.invoke(mod, 'onStart', g);
    }
  }
  onTick(g: Game, dt: number): void {
    this.journal.flush(g);
    for (const mod of this.runtimes) {
      mod.beginTick(Math.round(g.time * 60));
      if (this.pending.delete(mod.info.id)) this.invoke(mod, 'onStart', g);
      this.invoke(mod, 'onTick', g, undefined, dt);
    }
  }
  onSpawn(g: Game, e: Entity): void {
    for (const mod of this.runtimes)
      if (!this.pending.has(mod.info.id)) this.invoke(mod, 'onSpawn', g, e);
  }
  onKill(g: Game, e: { killer?: Entity; victim: Entity }): void {
    for (const mod of this.runtimes)
      if (!this.pending.has(mod.info.id)) this.invoke(mod, 'onKill', g, e);
  }
  onHit(g: Game, e: { attacker: Entity; target: Entity; damage: number }) {
    let damage = e.damage,
      cancel = false;
    for (const mod of this.runtimes) {
      if (this.pending.has(mod.info.id)) continue;
      const result = this.invoke(mod, 'onHit', g, { ...e, damage });
      if (result?.damage !== undefined) damage = result.damage;
      cancel ||= result?.cancel === true;
    }
    return { damage, cancel };
  }
  dispose(): void {
    this.closed = true;
    for (const mod of this.runtimes) mod.dispose();
  }
}
