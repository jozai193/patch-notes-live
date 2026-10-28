export default {
  name: 'Gravity flip every 10s',
  description: 'Gentle damped gravity alternates down/up every ten game seconds.',
  hooks: {
    onStart(g) {
      g.physics.friction = 1;
    },
    onTick(g) {
      g.physics.gravity.y = Math.floor(g.time / 10) % 2 === 0 ? 40 : -40;
    },
  },
};
