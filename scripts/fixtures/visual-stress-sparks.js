export default {
  name: 'Spark delivery',
  description: 'Emit a bounded cosmetic burst every two seconds.',
  patchNotes: 'Every two seconds, an entirely unnecessary quantity of sparks will be delivered.',
  hooks: {
    onTick(g) {
      const pulse = Math.floor(g.time / 2);
      if (g.state.pulse !== pulse) {
        g.state.pulse = pulse;
        g.fx.burst(g.player.x, g.player.y, '#48eaff', 24);
      }
    },
  },
};
