export default {
  name: 'Split on hit',
  description: 'Enemies split once into two smaller enemies when hit.',
  hooks: {
    onHit(g, event) {
      const enemy = event.target;
      if (enemy.kind !== 'enemy' || enemy.tags.includes('split-child') || enemy.tags.includes('split-done')) return;
      if (g.entities().length > 296) return;
      g.set(enemy, { tags: [...enemy.tags, 'split-done'] });
      const radius = Math.max(1, Math.min(64, enemy.radius * 0.65));
      const hp = Math.max(1, Math.min(1000, enemy.hp * 0.5));
      for (const direction of [-1, 1]) {
        g.spawn('enemy', {
          x: Math.max(radius, Math.min(g.arena.width - radius, enemy.x + direction * radius)),
          y: enemy.y,
          vx: Math.max(-600, Math.min(600, enemy.vx)),
          vy: Math.max(-600, Math.min(600, enemy.vy)),
          radius,
          hp,
          maxHp: hp,
          speed: Math.max(0, Math.min(400, enemy.speed)),
          color: '#ffc978',
          tags: ['split-child'],
        });
      }
      g.remove(enemy);
    },
  },
};
