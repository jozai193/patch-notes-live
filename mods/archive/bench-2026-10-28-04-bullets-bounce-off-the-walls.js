export default {
  patchNotes: "Bouncing bullets is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Bouncing bullets',
  description: 'Bullets reflect off arena walls instead of continuing outward.',
  hooks: {
    onTick(g, dt) {
      const entities = g.entities();
      for (let i = 0; i < Math.min(entities.length, 300); i++) {
        const bullet = entities[i];
        if (bullet.kind !== 'projectile') continue;
        const left = bullet.radius;
        const right = g.arena.width - bullet.radius;
        const top = bullet.radius;
        const bottom = g.arena.height - bullet.radius;
        let { x, y, vx, vy } = bullet;
        // Reflect before the next movement step can carry a bullet out of bounds.
        if (vx < 0 && x + vx * dt <= left) {
          x = Math.max(left, x);
          vx = -vx;
        } else if (vx > 0 && x + vx * dt >= right) {
          x = Math.min(right, x);
          vx = -vx;
        }
        if (vy < 0 && y + vy * dt <= top) {
          y = Math.max(top, y);
          vy = -vy;
        } else if (vy > 0 && y + vy * dt >= bottom) {
          y = Math.min(bottom, y);
          vy = -vy;
        }
        if (vx !== bullet.vx || vy !== bullet.vy) {
          g.set(bullet, { x, y, vx, vy, color: '#ffc978' });
        }
      }
    },
  },
};
