export default {
  name: 'Heal on kill',
  description: 'Enemy kills restore up to five HP and turn the player mint green.',
  patchNotes: 'Defeating enemies now improves your health. Our doctors have questions.',
  hooks: {
    onKill(g, event) {
      if (event.victim.kind === 'enemy') {
        g.set(g.player, { hp: Math.min(g.player.maxHp, g.player.hp + 5), color: '#85ffd2' });
      }
    },
  },
};
