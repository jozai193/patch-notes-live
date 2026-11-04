const colors = ['#ff5555', '#ff9955', '#ffee55', '#55dd77', '#5599ff', '#9955ff', '#ee55cc'];

function colorAt(g, enemy) {
  return colors[(Math.floor(g.time * 3) + enemy.id) % colors.length];
}

export default {
  patchNotes: "Enemies now come in every color of the rage spectrum.",
  name: 'Rainbow enemies',
  description: 'Enemies continuously cycle through rainbow colors.',
  hooks: {
    onSpawn(g, entity) {
      if (entity.kind === 'enemy') g.set(entity, { color: colorAt(g, entity) });
    },
    onTick(g) {
      const enemies = g.enemies();
      for (let i = 0; i < Math.min(enemies.length, 300); i++) {
        const enemy = enemies[i];
        g.set(enemy, { color: colorAt(g, enemy) });
      }
    },
  },
};
