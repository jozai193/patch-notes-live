export default {
  patchNotes: "Revenge rush is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Revenge rush',
  description: 'Each enemy kill makes surviving and future enemies faster, with diminishing increases.',
  hooks: {
    onStart(g) {
      g.state.revengeBonus = 0;
      g.ui.toast('Every enemy kill makes the others faster!');
    },
    onSpawn(g, enemy) {
      if (enemy.kind !== 'enemy') return;
      const bonus = g.state.revengeBonus || 0;
      g.set(enemy, { speed: Math.min(400, enemy.speed + bonus) });
    },
    onKill(g, event) {
      if (event.victim.kind !== 'enemy') return;
      const previous = g.state.revengeBonus || 0;
      const bonus = previous + (60 - previous) * 0.05;
      g.state.revengeBonus = bonus;
      const enemies = g.enemies();
      for (const enemy of enemies) {
        g.set(enemy, { speed: Math.min(400, enemy.speed + bonus - previous) });
      }
    },
  },
};
