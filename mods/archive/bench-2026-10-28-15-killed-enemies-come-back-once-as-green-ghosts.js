export default {
  patchNotes: "One ghostly return is now official policy. Balance has been notified and is refusing to comment.",
  name: 'One ghostly return',
  description: 'Killed enemies return once as green ghosts.',
  hooks: {
    onKill(g, event) {
      const enemy = event.victim;
      if (enemy.kind !== 'enemy' || enemy.tags.includes('returned-ghost')) return;
      if (g.entities().length >= 299) return;
      g.spawn('enemy', {
        x: enemy.x,
        y: enemy.y,
        radius: enemy.radius,
        hp: Math.max(1, Math.min(1000, enemy.maxHp)),
        maxHp: Math.max(1, Math.min(1000, enemy.maxHp)),
        speed: enemy.speed,
        color: '#66ff99',
        tags: [...enemy.tags, 'returned-ghost'],
      });
    },
  },
};
