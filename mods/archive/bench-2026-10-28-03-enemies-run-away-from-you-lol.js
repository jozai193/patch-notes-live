export default {
  patchNotes: "Enemies have discovered self-preservation. We are deeply disappointed.",
  name: 'Enemies run away',
  description: 'Enemies flee from the player instead of chasing them.',
  hooks: {
    onTick(g) {
      const enemies = g.enemies();
      for (let i = 0; i < Math.min(enemies.length, 300); i++) {
        const enemy = enemies[i];
        const dx = enemy.x - g.player.x;
        const dy = enemy.y - g.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        g.set(enemy, {
          speed: 0,
          vx: distance > 0 ? 90 * dx / distance : 90,
          vy: distance > 0 ? 90 * dy / distance : 0,
        });
      }
    },
  },
};
