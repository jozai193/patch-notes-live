export default {
  patchNotes: "One health point per second. Please form an orderly queue for immortality.",
  name: 'Slow regeneration',
  description: 'Heal 1 HP every second, up to maximum health.',
  hooks: {
    onStart(g) {
      g.state.lastHealSecond = Math.floor(g.time);
      g.ui.toast('Regeneration: heal 1 HP every second');
    },
    onTick(g) {
      const second = Math.floor(g.time);
      const previous = g.state.lastHealSecond;
      if (typeof previous !== 'number') {
        g.state.lastHealSecond = second;
        return;
      }
      if (second > previous) {
        g.state.lastHealSecond = second;
        const player = g.player;
        if (player.hp > 0 && player.hp < player.maxHp) {
          g.set(player, { hp: Math.min(player.maxHp, 1000, player.hp + second - previous) });
        }
      }
    },
  },
};
