export default {
  patchNotes: "Random meteor showers is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Random meteor showers',
  description: 'Brief random showers of glowing meteors fall through the arena, leaving a safe corridor around the player.',
  hooks: {
    onStart(g) {
      g.state.nextShower = 1;
      g.state.showerEnd = 0;
      g.state.nextMeteor = 0;
      g.state.meteors = [];
    },
    onTick(g, dt) {
      const meteors = g.state.meteors;
      const remaining = [];
      for (const meteor of meteors) {
        meteor.age += dt;
        meteor.entity.y += 115 * dt;
        if (meteor.age > 4 || meteor.entity.y > g.arena.height + 20) {
          g.remove(meteor.entity);
        } else {
          g.set(meteor.entity, { y: meteor.entity.y, vx: 0, vy: 0 });
          remaining.push(meteor);
        }
      }
      g.state.meteors = remaining;
      if (g.time >= g.state.nextShower) {
        g.state.showerEnd = g.time + 2.4;
        g.state.nextShower = g.time + 6 + g.rand() * 3;
        g.state.nextMeteor = g.time;
        g.ui.toast('Meteor shower! Watch the glowing rocks.');
      }
      if (g.time < g.state.showerEnd && g.time >= g.state.nextMeteor) {
        g.state.nextMeteor = g.time + 0.35;
        if (remaining.length >= 16 || g.entities().length >= 260) return;
        const margin = 20;
        const x = margin + g.rand() * Math.max(0, g.arena.width - margin * 2);
        if (Math.abs(x - g.player.x) < 110) return;
        const entity = g.spawn('hazard', {
          x, y: 12, vx: 0, vy: 0,
          radius: 9 + g.rand() * 5,
          hp: 1, maxHp: 1, speed: 0,
          color: '#ffad42', tags: ['shower-meteor'],
        });
        remaining.push({ entity, age: 0 });
      }
    },
  },
};
