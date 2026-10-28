export default {
  name: 'Bad: instant death',
  description: 'Must fail winnability by killing the player before five seconds.',
  hooks: {
    onStart(g) {
      g.set(g.player, { hp: 0 });
    },
  },
};
