export default {
  name: 'Bad: throws on tick',
  description: 'Must fail stability with an actionable mod.js location.',
  hooks: {
    onTick(g) {
      const enemy = g.enemies()[0];
      enemy.x += 1;
    },
  },
};
