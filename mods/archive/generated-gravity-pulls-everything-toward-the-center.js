export default {
  patchNotes: "Gravity has been reassigned. Please direct complaints toward the ceiling.",
  name: 'Center gravity',
  description: 'A gentle gravitational pull draws every entity toward the arena center.',
  hooks: {
    onTick(g, dt) {
      const entities = g.entities();
      const cx = g.arena.width / 2;
      const cy = g.arena.height / 2;
      for (let i = 0; i < Math.min(entities.length, 300); i++) {
        const entity = entities[i];
        const dx = cx - entity.x;
        const dy = cy - entity.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const scale = 12 * dt / Math.max(60, distance);
        g.set(entity, {
          vx: Math.max(-600, Math.min(600, entity.vx + dx * scale)),
          vy: Math.max(-600, Math.min(600, entity.vy + dy * scale)),
        });
      }
    },
  },
};
