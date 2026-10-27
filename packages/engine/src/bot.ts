import type { Intent, Snapshot } from './types.js';
/** Aim is a world-space point. Kite nearby enemies and steer away from walls. */
export function botIntent(s: Snapshot): Intent {
  const p = s.player;
  const enemies = s.entities.filter((e) => e.kind === 'enemy');
  enemies.sort(
    (a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y) || a.id - b.id,
  );
  const nearest = enemies[0];
  if (p.hp < p.maxHp * 0.6) {
    const pickup = s.entities
      .filter((e) => e.kind === 'pickup')
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y) || a.id - b.id,
      )[0];
    if (pickup) {
      const dx = pickup.x - p.x,
        dy = pickup.y - p.y,
        squared = dx * dx + dy * dy;
      const unsafe = enemies.some((e) => {
        const t = squared
          ? Math.max(0, Math.min(1, ((e.x - p.x) * dx + (e.y - p.y) * dy) / squared))
          : 0;
        return Math.hypot(e.x - (p.x + t * dx), e.y - (p.y + t * dy)) <= 150;
      });
      if (!unsafe && squared > 0)
        return {
          moveX: dx / Math.sqrt(squared),
          moveY: dy / Math.sqrt(squared),
          aimX: nearest?.x ?? p.x + 1,
          aimY: nearest?.y ?? p.y,
          fire: !!nearest,
        };
    }
  }
  let x = 0,
    y = 0;
  for (const e of enemies) {
    const dx = p.x - e.x,
      dy = p.y - e.y,
      d = Math.max(1, Math.hypot(dx, dy));
    if (d < 220) {
      x += dx / (d * d);
      y += dy / (d * d);
    }
  }
  x += 0.6 / Math.max(10, p.x) - 0.6 / Math.max(10, s.arena.width - p.x);
  y += 0.6 / Math.max(10, p.y) - 0.6 / Math.max(10, s.arena.height - p.y);
  const length = Math.hypot(x, y);
  return {
    moveX: length ? x / length : 0,
    moveY: length ? y / length : 0,
    aimX: nearest?.x ?? p.x + 1,
    aimY: nearest?.y ?? p.y,
    fire: !!nearest,
  };
}
