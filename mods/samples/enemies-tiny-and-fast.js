export default {
  name: 'Enemies tiny and fast',
  description: 'Enemies have smaller hit circles and move 25 percent faster.',
  hooks: {
    onSpawn(g, entity) {
      if (entity.kind === 'enemy')
        g.set(entity, { radius: 6, speed: entity.speed * 1.25, color: '#ffb969' });
    },
  },
};
