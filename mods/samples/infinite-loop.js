export default {
  name: 'Bad: infinite loop',
  description: 'Must fail the instruction budget check.',
  hooks: {
    onTick() {
      while (true) {
        /* Deliberately broken. */
      }
    },
  },
};
