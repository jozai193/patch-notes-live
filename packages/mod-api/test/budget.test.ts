import { describe, expect, it } from 'vitest';
import { InstructionBudget, INSTRUCTION_BUDGET } from '../src/budget.js';
import { loadQuickJS, SandboxHost } from '../src/index.js';
import { ModRuntime } from '../src/runtime.js';
import type { Fault } from '../src/types.js';
import { botIntent, World } from '@patch-notes-live/engine';

describe('deterministic budget and cleanup', () => {
  it('permanently disables an emergency overrun instead of repeatedly skipping its results', async () => {
    const faults: Fault[] = [];
    const mod = new ModRuntime(
      await loadQuickJS(),
      `export default {name:'emergency',description:'test',hooks:{onTick(g){g.player.speed=50}}}`,
      0,
      (f) => faults.push(f),
      [],
    );
    const internal = mod as unknown as {
      budget: { clock(): number };
      vm: { callFunction: import('quickjs-emscripten-core').QuickJSContext['callFunction'] };
    };
    let clock = 0,
      calls = 0;
    internal.budget.clock = () => clock;
    const call = internal.vm.callFunction.bind(internal.vm);
    internal.vm.callFunction = (...args: Parameters<typeof call>) => {
      calls++;
      const result = call(...args);
      clock = 51;
      return result;
    };
    try {
      const world = new World(1, {
        onTick(g) {
          mod.invoke('onTick', g, undefined, 1 / 60);
        },
      });
      for (let i = 0; i < 120; i++) world.tick(botIntent(world.snapshot()));
      expect(world.snapshot().tick).toBe(120);
      expect(world.snapshot().player.speed).toBe(200);
      expect(calls).toBe(1);
      expect(mod.info.disabled).toBe(true);
      expect(faults.map((f) => f.kind)).toEqual(['emergency', 'disabled']);
    } finally {
      mod.dispose();
    }
  });
  it('counts polls across calls, resets only on the next tick, and keeps wall time out of the normal decision', () => {
    let clock = 0;
    const b = new InstructionBudget(() => clock);
    b.beginTick(1);
    for (let call = 0; call < 2; call++) {
      b.startCall();
      clock += 20;
      for (let i = 0; i < INSTRUCTION_BUDGET / 2; i++) expect(b.poll()).toBe(false);
      b.endCall();
    }
    expect(b.used).toBe(INSTRUCTION_BUDGET);
    b.startCall();
    expect(b.poll()).toBe(true);
    b.endCall();
    b.beginTick(2);
    expect(b.used).toBe(0);
    expect(b.exhausted).toBe(false);
    b.startCall();
    clock += 51;
    expect(b.poll()).toBe(true);
    expect(b.emergency).toBe(true);
  });

  it('requires a distinct WASM module per mod', async () => {
    const first = await loadQuickJS(),
      second = await loadQuickJS();
    expect(first).not.toBe(second);
    expect(first.getWasmMemory().buffer).not.toBe(second.getWasmMemory().buffer);
    expect(() => new SandboxHost([first, first], ['', ''])).toThrow('own WASM');
  });

  it('reports a disposal failure and still frees the other resources', async () => {
    const faults: Fault[] = [];
    const mod = new ModRuntime(
      await loadQuickJS(),
      `export default {name:'dispose',description:'test',hooks:{}}`,
      0,
      (f) => faults.push(f),
      [],
    );
    // Inject an error after the real context is freed, so the test creates no intentional leak.
    const internal = mod as unknown as { vm: { dispose(): void } };
    const dispose = internal.vm.dispose.bind(internal.vm);
    internal.vm.dispose = () => {
      dispose();
      throw Error('simulated cleanup error');
    };
    expect(() => mod.dispose()).not.toThrow();
    expect(faults).toContainEqual(expect.objectContaining({ kind: 'dispose', hook: 'dispose' }));
    expect(mod.info.disposed).toBe(true);
    const healthy = await SandboxHost.create([
      `export default {name:'still-alive',description:'test',hooks:{onTick(g){g.player.speed=100}}}`,
    ]);
    try {
      const w = new World(1, healthy);
      for (let i = 0; i < 120; i++) w.tick(botIntent(w.snapshot()));
      expect(w.snapshot().tick).toBe(120);
      expect(healthy.faults).toEqual([]);
    } finally {
      healthy.dispose();
    }
  });
});
