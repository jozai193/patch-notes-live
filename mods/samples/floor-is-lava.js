export default {
  name: 'Floor is lava',
  description: 'Six persistent lava tiles leave broad safe routes through the arena.',
  hooks: {
    onStart(g) {
      for (const y of [120, 520]) {
        for (const x of [200, 480, 760]) {
          g.spawn('hazard', { x, y, radius: 18, color: '#ff7048', tags: ['lava-tile'] });
        }
      }
    },
  },
};
