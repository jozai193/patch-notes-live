export default {
  patchNotes: "Three tiny enemies is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Three tiny enemies',
  description: 'Defeated enemies burst into three tiny enemies that cannot split again.',
  hooks: {
    onKill(g, event) {
      const parent = event.victim;
      if (parent.kind !== 'enemy' || parent.tags.includes('tiny-child')) return;
      if (g.entities().length > 293) return;
      const angle = g.rand() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const direction = angle + i * Math.PI * 2 / 3;
        const radius = Math.max(1, Math.min(5, parent.radius * 0.4));
        g.spawn('enemy', {
          x: Math.max(radius, Math.min(g.arena.width - radius, parent.x + Math.cos(direction) * 12)),
          y: Math.max(radius, Math.min(g.arena.height - radius, parent.y + Math.sin(direction) * 12)),
          vx: Math.cos(direction) * 35,
          vy: Math.sin(direction) * 35,
          radius,
          hp: 1,
          maxHp: 1,
          speed: Math.max(0, Math.min(80, parent.speed)),
          color: '#ffc978',
          tags: ['tiny-child'],
        });
      }
    },
  },
};
