export default {
  patchNotes: "Shrinking arena is now official policy. Balance has been notified and is refusing to comment.",
  name: 'Shrinking arena',
  description: 'The arena steadily shrinks toward 75 percent of its starting size.',
  hooks: {
    onStart(g) {
      g.state.shrinkingArenaWidth = g.arena.width;
      g.state.shrinkingArenaHeight = g.arena.height;
    },
    onTick(g) {
      const scale = 0.75 + 0.25 / (1 + g.time / 15);
      g.arena.width = g.state.shrinkingArenaWidth * scale;
      g.arena.height = g.state.shrinkingArenaHeight * scale;
    },
  },
};
