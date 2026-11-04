import { expect, it } from 'vitest';
import { verify } from '../src/index.js';
it.each(["g.player.shape='star'", 'g.player.glow=0', "g.fx.burst(480,320,'#48eaff',12)"])(
  'recognizes a visual-only mod using %s as visible and deterministic',
  async (change) => {
    const report = await verify(
      `export default {name:'visual',description:'cosmetic',hooks:{onStart(g){${change};}}}`,
    );
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(report.ok).toBe(true);
  },
);
