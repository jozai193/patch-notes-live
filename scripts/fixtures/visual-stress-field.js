// Reproducible render-load fixture, deliberately grants invulnerability for measurement.
export default {
  name: 'Neon stress field',
  description: 'Seed 180 mixed entities for the renderer load probe; player damage is cancelled.',
  patchNotes: 'The stress test has entered the arena. Your graphics card would like a word.',
  hooks: {
    onTick(g) {
      const existing = g.state.spawned || 0;
      if (existing >= 180) return;
      const start = g.state.index || 0;
      for (let n = 0; n < Math.min(24, 180 - existing); n++) {
        const i = start + n;
        const x = 38 + (i % 16) * 58;
        const y = 38 + (Math.floor(i / 16) % 10) * 62;
        if (Math.hypot(x - 480, y - 320) < 100) continue;
        const kind = i % 4 === 0 ? 'hazard' : i % 4 === 1 ? 'pickup' : 'enemy';
        g.state.spawned = (g.state.spawned || 0) + 1;
        g.spawn(kind, {
          x,
          y,
          radius: kind === 'hazard' ? 15 : kind === 'pickup' ? 9 : 8 + (i % 3),
          speed: 0,
          hp: 1000,
          maxHp: 1000,
          tags: ['visual-stress'],
        });
      }
      g.state.index = start + 24;
    },
    onHit(_g, e) {
      if (e.target.kind === 'player') return { cancel: true };
    },
  },
};
