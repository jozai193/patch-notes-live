export default {
  name: 'Time bomb',
  description:
    'Passes the 60-second verifier, then throws after 70 seconds to exercise the live watchdog.',
  hooks: {
    onStart(g) {
      g.ui.toast('Time bomb armed: watchdog test at 70 seconds.');
    },
    onTick(g) {
      if (g.time > 70) throw new Error('Time bomb: game time exceeded 70 seconds');
    },
  },
};
