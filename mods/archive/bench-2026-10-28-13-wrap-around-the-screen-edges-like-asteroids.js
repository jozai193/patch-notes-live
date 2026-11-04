export default {
  patchNotes: "Asteroids-style wraparound is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Asteroids-style wraparound',
  description: 'Crossing a screen edge wraps entities to the opposite edge.',
  hooks: {
    onStart(g) {
      g.arena.wrap = true;
    },
  },
};
