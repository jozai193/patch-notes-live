import type {
  QuickJSContext,
  QuickJSHandle,
  QuickJSRuntime,
  QuickJSWASMModule,
} from 'quickjs-emscripten';
import type { Entity, Game } from '@patch-notes-live/engine';
import { SHIM } from './shim.js';
import { decode, object, replay } from './commands.js';
import { InvalidResult, now } from './types.js';
import type { Fault, HookName, LogEntry, ModInfo } from './types.js';

export class ModRuntime {
  readonly info: ModInfo;
  private readonly runtime: QuickJSRuntime;
  private readonly vm: QuickJSContext;
  private callHandle: QuickJSHandle | undefined;
  private active: Game | undefined;
  private known = new Map<number, Entity>();
  private readonly aliases = new Map<number, number>();
  private pendingIds: [number, number][] = [];
  private deadline = Infinity;
  private interrupted = false;
  private closed = false;
  private budgetFaultTick = -1;

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
      tick: -1,
      timeThisTickMs: 0,
    };
    this.runtime = module.newRuntime();
    this.runtime.setMemoryLimit(16 * 1024 * 1024);
    this.runtime.setMaxStackSize(256 * 1024);
    this.runtime.removeModuleLoader();
    this.runtime.setInterruptHandler(() => {
      if (now() >= this.deadline) this.interrupted = true;
      return this.interrupted;
    });
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
      logs.push({
        modName: this.info.name,
        tick: Math.max(0, this.info.tick),
        message: this.vm.getString(text!).slice(0, 512),
      });
      if (logs.length > 100) logs.shift();
    });
    this.deadline = now() + 50;
    try {
      const shim = this.take(this.vm.evalCode(SHIM, 'game-shim.js', { type: 'global' }));
      try {
        this.callHandle = this.vm.getProp(shim, 'call');
        const install = this.vm.getProp(shim, 'install');
        try {
          const namespace = this.take(this.vm.evalCode(source, 'mod.js', { type: 'module' }));
          try {
            const metadata = this.take(this.vm.callFunction(install, this.vm.undefined, namespace));
            try {
              const value: unknown = JSON.parse(this.vm.getString(metadata));
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
              metadata.dispose();
            }
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
      this.info.hooks = [];
    } finally {
      this.deadline = Infinity;
      this.interrupted = false;
    }
  }

  private bind(name: string, fn: (...args: QuickJSHandle[]) => QuickJSHandle | void): void {
    const handle = this.vm.newFunction(name, fn);
    try {
      this.vm.setProp(this.vm.global, name, handle);
    } finally {
      handle.dispose();
    }
  }

  private take(result: ReturnType<QuickJSContext['evalCode']>): QuickJSHandle {
    if (result.error) {
      let message = 'QuickJS execution failed';
      try {
        const dumped: unknown = this.vm.dump(result.error);
        if (object(dumped) && typeof dumped.message === 'string') message = dumped.message;
        else if (typeof dumped === 'string') message = dumped;
      } finally {
        result.error.dispose();
      }
      throw new Error(message);
    }
    return result.value;
  }

  invoke(
    hook: HookName,
    g: Game,
    event?: unknown,
    dt?: number,
  ): { damage?: number; cancel?: boolean } | undefined {
    if (this.closed || !this.callHandle || !this.info.hooks.includes(hook)) return;
    const tick = Math.round(g.time * 60);
    if (this.info.tick !== tick) {
      this.info.tick = tick;
      this.info.timeThisTickMs = 0;
    }
    if (this.info.timeThisTickMs >= 2) {
      if (this.budgetFaultTick !== tick) {
        this.interrupted = true;
        this.fault(hook, new Error('Tick budget exceeded'));
        this.interrupted = false;
      }
      return;
    }
    const start = now();
    this.deadline = start + 2 - this.info.timeThisTickMs;
    this.interrupted = false;
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
      let output: string;
      try {
        const result = this.take(this.vm.callFunction(this.callHandle, this.vm.undefined, payload));
        try {
          if (this.vm.typeof(result) !== 'string') throw new InvalidResult('Non-JSON hook output');
          output = this.vm.getString(result);
        } finally {
          result.dispose();
        }
      } finally {
        payload.dispose();
      }
      if (now() >= this.deadline) {
        this.interrupted = true;
        throw new Error('Tick budget exceeded');
      }
      const decoded = decode(output, hook === 'onHit');
      this.pendingIds = replay(g, decoded, this.known, this.aliases);
      return decoded.result;
    } catch (error) {
      this.fault(hook, error);
    } finally {
      this.info.timeThisTickMs += now() - start;
      this.active = undefined;
      this.known.clear();
      this.deadline = Infinity;
      this.interrupted = false;
    }
  }

  private fault(hook: HookName | 'load', error: unknown): void {
    const message = error instanceof Error ? error.message : 'QuickJS fault';
    const kind = /out of memory|allocation failed/i.test(message)
      ? 'memory'
      : this.interrupted || /interrupted|budget/i.test(message)
        ? 'interrupt'
        : error instanceof InvalidResult ||
            /Invalid mod|Invalid hook|synchronous|limit exceeded/i.test(message)
          ? 'invalid-result'
          : 'throw';
    this.info.faultCount++;
    if (kind === 'interrupt') this.budgetFaultTick = this.info.tick;
    this.report({
      modName: this.info.name,
      hook,
      kind,
      message: message.slice(0, 512),
      tick: Math.max(0, this.info.tick),
    });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.callHandle?.dispose();
    this.vm.dispose();
    this.runtime.dispose();
  }
}
