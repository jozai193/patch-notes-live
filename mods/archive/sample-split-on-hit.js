export default {
  name: 'Split on hit',
  description: 'Shot enemies split once into two smaller enemies.',
  patchNotes: 'Enemies now split into two smaller, angrier enemies. We are not sorry.',
  hooks: {
    onSpawn(g, enemy) {
      if (enemy.kind === 'enemy' && !enemy.tags.includes('split-child')) enemy.color = '#b69cff';
    },
    onHit(g, event) {
      const enemy = event.target;
      if (
        event.attacker.kind !== 'projectile' ||
        enemy.kind !== 'enemy' ||
        enemy.tags.includes('split-child')
      )
        return;
      for (const offset of [-18, 18]) {
        g.spawn('enemy', {
          x: enemy.x + offset,
          y: enemy.y,
          radius: 7,
          hp: 10,
          maxHp: 10,
          speed: enemy.speed * 1.2,
          color: '#ffc978',
          tags: ['split-child'],
        });
      }
    },
  },
};
