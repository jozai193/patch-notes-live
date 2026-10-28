import type {
  QuickJSContext,
  QuickJSHandle,
  QuickJSRuntime,
  QuickJSWASMModule,
} from 'quickjs-emscripten-core';
import type { Entity, Game } from '@patch-notes-live/engine';
import { SHIM } from './shim.js';
import { decode, object, replay } from './commands.js';
import { InstructionBudget } from './budget.js';
import { InvalidResult, now, SandboxFailure } from './types.js';
import type { Fault, HookName, LogEntry, ModInfo } from './types.js';

export class ModRuntime {
  readonly info: ModInfo;
  private readonly runtime: QuickJSRuntime;
  private readonly vm: QuickJSContext;
  private readonly budget = new InstructionBudget();
  private callHandle: QuickJSHandle | undefined;
  private active: Game | undefined;
  private known = new Map<number, Entity>();
  private readonly aliases = new Map<number, number>();
  private pendingIds: [number, number][] = [];
  private closed = false;

  constructor(
    module: QuickJSWASMModule,
    source: string,
    index: number,
    private readonly report: (fault: Fault) => void,
    logs: LogEntry[],
  ) {
    this.info = {
      id: index,
      name: `mod-${index + 1}`,
      description: '',
      hooks: [],
      faultCount: 0,
      consecutiveFaults: 0,
      disabled: false,
      disabledReason: undefined,
      disposed: false,
      tick: -1,
      timeThisTickMs: 0,
      interruptsThisTick: 0,
      maxInterruptsPerTick: 0,
    };
    this.runtime = module.newRuntime();
    this.runtime.setMemoryLimit(16 * 1024 * 1024);
    this.runtime.setMaxStackSize(256 * 1024);
    this.runtime.removeModuleLoader();
    this.runtime.setInterruptHandler(this.budget.poll);
    this.vm = this.runtime.newContext();
    this.bind('__rand', () => this.vm.newNumber(this.active?.rand() ?? 0));
    this.bind('__list', (kind) => {
      if (!this.active) return this.vm.newString('[]');
      const entities =
        this.vm.getString(kind!) === 'enemies' ? this.active.enemies() : this.active.entities();
      for (const entity of entities) this.known.set(entity.id, entity);
      return this.vm.newString(JSON.stringify(entities));
    });
    this.bind('__log', (text) => {
      if (!text || this.vm.typeof(text) !== 'string') return;
      logs.push({
        modName: this.info.name,
        tick: Math.max(0, this.info.tick),
        message: this.vm.getString(text).slice(0, 512),
      });
      if (logs.length > 100) logs.shift();
    });
    this.budget.beginTick(-1);
    try {
      const shim = this.execute(() => this.vm.evalCode(SHIM, 'game-shim.js', { type: 'global' }));
      try {
        this.callHandle = this.vm.getProp(shim, 'call');
        const install = this.vm.getProp(shim, 'install');
        try {
          const namespace = this.execute(() =>
            this.vm.evalCode(source, 'mod.js', { type: 'module' }),
          );
          try {
            const metadata = this.execute(() =>
              this.vm.callFunction(install, this.vm.undefined, namespace),
            );
            const value = this.readJSON(metadata);
            if (
              !object(value) ||
              typeof value.name !== 'string' ||
              typeof value.description !== 'string' ||
              !Array.isArray(value.hooks)
            )
              throw new InvalidResult('Invalid mod metadata');
            this.info.name = value.name;
            this.info.description = value.description;
            this.info.hooks = value.hooks as HookName[];
          } finally {
            namespace.dispose();
          }
        } finally {
          install.dispose();
        }
      } finally {
        shim.dispose();
      }
    } catch (error) {
      this.fault('load', error);
      this.disable('load', 'Mod could not be initialized');
    }
  }

  beginTick(tick: number): void {
    if (this.info.tick === tick) return;
    this.info.tick = tick;
    this.info.timeThisTickMs = 0;
    this.info.interruptsThisTick = 0;
    this.budget.beginTick(tick);
  }

  private bind(name: string, fn: (...args: QuickJSHandle[]) => QuickJSHandle | void): void {
    const handle = this.vm.newFunction(name, fn);
    try {
      this.vm.setProp(this.vm.global, name, handle);
    } finally {
      handle.dispose();
    }
  }

  /** Never inspect, coerce or dump an arbitrary VM exception. */
  private execute(run: () => ReturnType<QuickJSContext['evalCode']>): QuickJSHandle {
    this.budget.startCall();
    try {
      const result = run();
      const emergency = this.budget.checkEmergency();
      if (result.error) {
        result.error.dispose();
        if (emergency) throw new SandboxFailure('emergency', 'Single VM call exceeded 50 ms');
        if (this.budget.exhausted)
          throw new SandboxFailure('interrupt', 'Instruction budget exceeded');
        throw new SandboxFailure(
          this.info.tick < 0 ? 'invalid-result' : 'memory',
          'VM exception (allocation/stack failure or invalid module)',
        );
      }
      if (emergency) {
        result.value.dispose();
        throw new SandboxFailure('emergency', 'Single VM call exceeded 50 ms');
      }
      return result.value;
    } finally {
      this.budget.endCall();
    }
  }

  private readJSON(handle: QuickJSHandle): unknown {
    let text: string;
    try {
      if (this.vm.typeof(handle) !== 'string') throw new InvalidResult('Non-string VM result');
      text = this.vm.getString(handle);
    } finally {
      handle.dispose();
    }
    if (text.length > 262144) throw new InvalidResult('Result exceeds 256 KB');
    const value: unknown = JSON.parse(text);
    if (object(value) && value.ok === false) {
      if (typeof value.message !== 'string') throw new InvalidResult('Invalid error message');
      const message = value.message.slice(0, 512);
      const kind = /out of memory/i.test(message)
        ? 'memory'
        : /limit|invalid|synchronous|cannot remove/i.test(message)
          ? 'invalid-result'
          : 'throw';
      throw new SandboxFailure(
        kind,
        message,
        typeof value.errorName === 'string' ? value.errorName.slice(0, 80) : undefined,
        typeof value.stack === 'string' ? value.stack.slice(0, 4096) : undefined,
      );
    }
    return value;
  }

  invoke(
    hook: HookName,
    g: Game,
    event?: unknown,
    dt?: number,
  ): { damage?: number; cancel?: boolean } | undefined {
    if (this.closed || this.info.disabled || !this.callHandle || !this.info.hooks.includes(hook))
      return;
    this.beginTick(Math.round(g.time * 60));
    const start = now();
    this.active = g;
    this.known = new Map([[g.player.id, g.player]]);
    if (object(event)) {
      if ('id' in event)
        this.known.set((event as unknown as Entity).id, event as unknown as Entity);
      for (const key of ['attacker', 'target', 'killer', 'victim']) {
        const entity = event[key];
        if (object(entity) && typeof entity.id === 'number')
          this.known.set(entity.id, entity as unknown as Entity);
      }
    }
    try {
      if (this.budget.exhausted)
        throw new SandboxFailure('interrupt', 'Instruction budget exhausted for this tick');
      const payload = this.vm.newString(
        JSON.stringify({
          hook,
          time: g.time,
          player: g.player,
          event,
          dt,
          physics: g.physics,
          arena: g.arena,
          ids: this.pendingIds,
        }),
      );
      let value: unknown;
      try {
        value = this.readJSON(
          this.execute(() => this.vm.callFunction(this.callHandle!, this.vm.undefined, payload)),
        );
      } finally {
        payload.dispose();
      }
      const decoded = decode(JSON.stringify(value), hook === 'onHit', g.player.id);
      this.pendingIds = replay(g, decoded, this.known, this.aliases);
      this.info.consecutiveFaults = 0;
      return decoded.result;
    } catch (error) {
      this.fault(hook, error);
    } finally {
      this.info.timeThisTickMs += now() - start;
      this.info.interruptsThisTick = this.budget.used;
      this.info.maxInterruptsPerTick = Math.max(this.info.maxInterruptsPerTick, this.budget.used);
      this.active = undefined;
      this.known.clear();
    }
  }

  private fault(hook: Fault['hook'], error: unknown): void {
    const message = error instanceof Error ? error.message : 'Sandbox host failure';
    const kind =
      hook === 'dispose'
        ? 'dispose'
        : error instanceof SandboxFailure
          ? error.kind
          : error instanceof InvalidResult
            ? 'invalid-result'
            : 'throw';
    this.info.faultCount++;
    this.info.consecutiveFaults++;
    this.report({
      modName: this.info.name,
      hook,
      kind,
      message: message.slice(0, 512),
      tick: Math.max(0, this.info.tick),
      ...(error instanceof SandboxFailure && error.errorName ? { errorName: error.errorName } : {}),
      ...(error instanceof SandboxFailure && error.vmStack ? { stack: error.vmStack } : {}),
    });
    if (kind === 'emergency' || this.info.consecutiveFaults >= 3 || this.info.faultCount >= 10)
      this.disable(hook, kind === 'emergency' ? message : 'Fault threshold reached');
  }

  private disable(hook: Fault['hook'], reason: string): void {
    if (this.info.disabled) return;
    this.info.disabled = true;
    this.info.disabledReason = reason;
    this.report({
      modName: this.info.name,
      hook,
      kind: 'disabled',
      message: reason,
      tick: Math.max(0, this.info.tick),
    });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const dispose of [
      () => this.callHandle?.dispose(),
      () => this.vm.dispose(),
      () => this.runtime.dispose(),
    ]) {
      try {
        dispose();
      } catch (error) {
        this.fault('dispose', error);
      }
    }
    this.info.disposed = true;
    this.active = undefined;
    this.known.clear();
    this.aliases.clear();
    this.pendingIds = [];
  }
}
