export default {
  patchNotes: "Five-second slow motion is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Five-second slow motion',
  description: 'Every five game seconds, everything slows down for one game second.',
  hooks: {
    onStart(g) {
      g.physics.timeScale = 1;
    },
    onTick(g) {
      const slow = g.time >= 5 && g.time % 5 < 1;
      g.physics.timeScale = slow ? 0.35 : 1;
    },
  },
};
