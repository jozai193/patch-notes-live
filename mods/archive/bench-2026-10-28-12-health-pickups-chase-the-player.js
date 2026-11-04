export default {
  patchNotes: "One health point per second. Please form an orderly queue for immortality.",
  name: 'Health pickups chase the player',
  description: 'Health pickups gently home toward the player.',
  hooks: {
    onTick(g, dt) {
      const entities = g.entities();
      for (let i = 0; i < entities.length && i < 300; i++) {
        const pickup = entities[i];
        if (pickup.kind !== 'pickup') continue;
        const dx = g.player.x - pickup.x;
        const dy = g.player.y - pickup.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const speed = dt > 0 ? Math.min(85, distance / dt) : 0;
        g.set(pickup, {
          vx: distance > 0 ? dx / distance * speed : 0,
          vy: distance > 0 ? dy / distance * speed : 0,
          color: '#66ff99',
        });
      }
    },
  },
};
