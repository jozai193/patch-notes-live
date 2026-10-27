export const SPLIT_ON_HIT = `export default {
  name: 'Split on hit',
  description: 'Enemies break into two smaller enemies when shot.',
  hooks: {
    onStart(g) { g.ui.toast('Split on hit: every enemy has a second act.'); },
    onSpawn(g,e) { if(e.kind === 'enemy' && !e.tags.includes('split-child')) e.color = '#b69cff'; },
    onHit(g,e) {
      if(e.attacker.kind !== 'projectile' || e.target.kind !== 'enemy' || e.target.tags.includes('split-child')) return;
      for(const offset of [-18,18]) g.spawn('enemy', {
        x:e.target.x + offset, y:e.target.y, radius:7, hp:10, maxHp:10,
        speed:e.target.speed * 1.2, color:'#ffc978', tags:['split-child']
      });
    }
  }
}`;
