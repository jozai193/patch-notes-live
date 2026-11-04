export default {
  patchNotes: "Low-health slow motion is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Low-health slow motion',
  description: 'Time slows to half speed while player health is at or below 35 percent.',
  hooks: {
    onStart(g) {
      g.state.lowHealthBaseTimeScale = g.physics.timeScale;
      g.state.lowHealthActive = false;
      g.ui.toast('Low health slows time at 35% HP.');
    },
    onTick(g) {
      const low = g.player.maxHp > 0 && g.player.hp <= g.player.maxHp * 0.35;
      const base = g.state.lowHealthBaseTimeScale;
      g.physics.timeScale = Math.max(0.1, Math.min(2, base * (low ? 0.5 : 1)));
      if (low && !g.state.lowHealthActive) {
        g.ui.toast('Low health: slow motion!');
        g.ui.tint('#829fff', 600);
      }
      g.state.lowHealthActive = low;
    },
  },
};
