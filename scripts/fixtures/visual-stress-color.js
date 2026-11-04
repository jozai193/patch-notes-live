export default {
  name: 'Chromatic plating',
  description: 'Alternate neon plating with default silhouettes across the stress field.',
  patchNotes: 'Enemy armor now comes in two exciting flavors: furious pink and spicy orange.',
  hooks: {
    onSpawn(g, e) {
      if (e.kind === 'enemy') g.set(e, { color: e.id % 2 ? '#ff4a9e' : '#ff9b45', glow: 0.9 });
      if (e.kind === 'hazard') g.set(e, { color: '#ff802e', glow: 1 });
    },
    onTick(g) {
      g.state.ticks = (g.state.ticks || 0) + 1;
    },
  },
};
