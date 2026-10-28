export default {
  name: 'Bad: does nothing',
  description: 'Valid schema and private scratch state, but no observable game effect.',
  hooks: {
    onTick(g) {
      g.state.ticks = (g.state.ticks || 0) + 1;
    },
  },
};
