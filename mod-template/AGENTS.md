# Verified mod examples (Step 5 seed guidance)

These ES-module examples use only the Game API. They are the Step 5 seed examples for the future patch workspace. Step 6 will add the isolated workspace bootstrap, test command and Codex pipeline.

Keep work bounded per hook; use game time and g.rand(), finite scratch state, and one-generation tags for split effects. Never run source in the host.

## split-on-hit

```js
export default {
  name: 'Split on hit',
  description: 'Shot enemies split once into two smaller enemies.',
  hooks: {
    onSpawn(g, enemy) {
      if (enemy.kind === 'enemy' && !enemy.tags.includes('split-child')) enemy.color = '#b69cff';
    },
    onHit(g, event) {
      const enemy = event.target;
      if (
        event.attacker.kind !== 'projectile' ||
        enemy.kind !== 'enemy' ||
        enemy.tags.includes('split-child')
      )
        return;
      for (const offset of [-18, 18]) {
        g.spawn('enemy', {
          x: enemy.x + offset,
          y: enemy.y,
          radius: 7,
          hp: 10,
          maxHp: 10,
          speed: enemy.speed * 1.2,
          color: '#ffc978',
          tags: ['split-child'],
        });
      }
    },
  },
};
```

## gravity-flip-every-10s

```js
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
```

## floor-is-lava

```js
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
```

## enemies-tiny-and-fast

```js
export default {
  name: 'Enemies tiny and fast',
  description: 'Enemies have smaller hit circles and move 25 percent faster.',
  hooks: {
    onSpawn(g, entity) {
      if (entity.kind === 'enemy')
        g.set(entity, { radius: 6, speed: entity.speed * 1.25, color: '#ffb969' });
    },
  },
};
```

## heal-on-kill

```js
export default {
  name: 'Heal on kill',
  description: 'Enemy kills restore up to five HP and turn the player mint green.',
  hooks: {
    onKill(g, event) {
      if (event.victim.kind === 'enemy') {
        g.set(g.player, { hp: Math.min(g.player.maxHp, g.player.hp + 5), color: '#85ffd2' });
      }
    },
  },
};
```
