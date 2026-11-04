function spawnBoss(g) {
  if (g.entities().length >= 290) return;
  const margin = 48;
  g.spawn('enemy', {
    x: g.player.x < g.arena.width / 2 ? g.arena.width - margin : margin,
    y: g.player.y < g.arena.height / 2 ? g.arena.height - margin : margin,
    radius: 36,
    hp: 500,
    maxHp: 500,
    speed: 18,
    color: '#cf4870',
    tags: ['boss'],
  });
  g.ui.toast('Boss fight: 500 HP!');
}

export default {
  patchNotes: "A new manager has arrived. It has 500 HP and no open-door policy.",
  name: 'Thirty-second boss fight',
  description: 'A giant enemy with 500 HP arrives at the start and every 30 seconds.',
  hooks: {
    onStart(g) {
      g.state.nextBossTime = 30;
      spawnBoss(g);
    },
    onTick(g) {
      if (g.time >= g.state.nextBossTime) {
        g.state.nextBossTime = (Math.floor(g.time / 30) + 1) * 30;
        spawnBoss(g);
      }
    },
  },
};
