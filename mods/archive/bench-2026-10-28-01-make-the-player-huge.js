export default {
  patchNotes: "Player size increased. Doorways are no longer covered by the warranty.",
  name: 'Huge player',
  description: 'The player becomes huge with a 40-pixel radius.',
  hooks: {
    onStart(g) {
      g.set(g.player, { radius: 40 });
    },
  },
};
