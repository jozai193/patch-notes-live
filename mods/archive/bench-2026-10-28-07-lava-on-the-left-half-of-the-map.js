export default {
  patchNotes: "The floor is now a management decision. Please walk it off.",
  name: 'Lava on the left',
  description: 'Stationary lava pools cover the left half of the arena; the right half remains clear.',
  hooks: {
    onStart(g) {
      const columns = 4;
      const rows = 6;
      const cellWidth = g.arena.width / (2 * columns);
      const cellHeight = g.arena.height / rows;
      const radius = Math.max(1, Math.min(64, cellWidth * 0.47, cellHeight * 0.47));
      const available = Math.max(0, 299 - g.entities().length);
      const count = Math.min(columns * rows, available);
      for (let i = 0; i < count; i++) {
        g.spawn('hazard', {
          x: (i % columns + 0.5) * cellWidth,
          y: (Math.floor(i / columns) + 0.5) * cellHeight,
          vx: 0,
          vy: 0,
          speed: 0,
          radius,
          hp: 1000,
          maxHp: 1000,
          color: '#ff5a18',
          tags: ['left-lava'],
        });
      }
      g.ui.toast('Lava covers the left half! Stay right.');
    },
  },
};
