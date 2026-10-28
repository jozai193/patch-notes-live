export default {
  name: 'Bad: unbounded spawner',
  description: 'Gradually fills the entity cap with permanent pickups and never cleans them up.',
  hooks: {
    onTick(g) {
      const index = g.state.spawned || 0;
      g.spawn('pickup', {
        x: 32 + (index % 15) * 64,
        y: 32 + (Math.floor(index / 15) % 10) * 64,
        radius: 2,
        color: '#8b9a98',
        tags: ['never-cleaned-up'],
      });
      g.state.spawned = index + 1;
    },
  },
};
