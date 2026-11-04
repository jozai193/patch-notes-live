export default {
  patchNotes: "Gravity has been reassigned. Please direct complaints toward the ceiling.",
  name: 'Moon gravity',
  description: 'Gentle downward lunar gravity gives the arena a light drifting pull.',
  hooks: {
    onStart(g) {
      g.physics.gravity.y = 16.2;
      g.ui.toast('Moon gravity');
    },
  },
};
