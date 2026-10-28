import { expect, it } from 'vitest';
import { World } from '@patch-notes-live/engine';
import { INSTRUCTION_BUDGET, SandboxHost } from '../src/index.js';

it('profiles 50 enemies and 3 mods with onTick and onHit over 600 ticks', async () => {
  const host = await SandboxHost.create(
    Array.from(
      { length: 3 },
      (_, i) => `export default {
    name:'perf-${i}',description:'50-enemy benchmark',hooks:{
      onTick(g){g.state.ticks=(g.state.ticks||0)+1;g.set(g.player,{tags:['perf-${i}:'+g.state.ticks]});g.physics.friction=(g.state.ticks%2)*0.1;},
      onHit(g,e){g.state.hits=(g.state.hits||0)+1;console.log('hit');return {damage:e.damage/2,cancel:true};}
    }}
  `,
    ),
  );
  try {
    const w = new World(1, host);
    w.tick();
    w.applyCommands(
      w
        .snapshot()
        .entities.filter((e) => e.kind === 'enemy')
        .map((e) => ({ type: 'remove', id: e.id })),
    );
    w.applyCommands(
      Array.from({ length: 50 }, (_, i) => ({
        type: 'spawn',
        kind: 'enemy',
        opts: {
          x: 70 + (i % 10) * 85,
          y: 80 + Math.floor(i / 10) * 100,
          speed: 0,
          hp: 1000,
          maxHp: 1000,
        },
      })),
    );
    w.applyCommands([{ type: 'spawn', kind: 'hazard', opts: { x: 480, y: 320 } }]);
    // Keep the benchmark population fixed when the engine's next wave is due.
    const samples: number[] = [];
    for (let i = 0; i < 600; i++) {
      w.tick();
      const extra = w
        .snapshot()
        .entities.filter((e) => e.kind === 'enemy')
        .slice(50);
      w.applyCommands(extra.map((e) => ({ type: 'remove', id: e.id })));
      samples.push(host.mods.reduce((sum, m) => sum + m.timeThisTickMs, 0));
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length,
      p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    console.log(
      `SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=${mean.toFixed(3)}ms p95=${p95.toFixed(3)}ms onHitCalls=${host.logs.length}`,
    );
    const maxPolls = Math.max(...host.mods.map((m) => m.maxInterruptsPerTick));
    console.log(
      `INSTRUCTION CALIBRATION: max=${maxPolls}/${INSTRUCTION_BUDGET} polls (${((100 * maxPolls) / INSTRUCTION_BUDGET).toFixed(2)}%)`,
    );
    expect(maxPolls).toBeLessThan(INSTRUCTION_BUDGET * 0.1);
    expect(host.faults).toEqual([]);
    expect(host.logs.length).toBeGreaterThanOrEqual(60);
    expect(w.snapshot().entities.filter((e) => e.kind === 'enemy')).toHaveLength(50);
    expect(p95).toBeLessThan(4);
  } finally {
    host.dispose();
  }
}, 15000);
