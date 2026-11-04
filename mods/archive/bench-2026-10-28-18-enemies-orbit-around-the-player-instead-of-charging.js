export default {
  patchNotes: "Orbiting enemies is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Orbiting enemies',
  description: 'Enemies circle the player instead of charging, gently settling into an orbit.',
  hooks: {
    onSpawn(g, enemy) {
      if (enemy.kind === 'enemy') g.set(enemy, { speed: 0 });
    },
    onTick(g, dt) {
      const enemies = g.enemies();
      const step = Math.max(0, Math.min(dt, 0.1));
      for (let i = 0; i < Math.min(enemies.length, 300); i++) {
        const enemy = enemies[i];
        const dx = enemy.x - g.player.x;
        const dy = enemy.y - g.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const orbit = Math.max(90, Math.min(160, Math.min(g.arena.width, g.arena.height) * 0.3));
        const radius = distance + Math.max(-45 * step, Math.min(45 * step, orbit - distance));
        const angle = Math.atan2(dy, dx) + 0.45 * step;
        g.set(enemy, {
          speed: 0,
          vx: 0,
          vy: 0,
          x: g.player.x + Math.cos(angle) * radius,
          y: g.player.y + Math.sin(angle) * radius,
        });
      }
    },
  },
};
