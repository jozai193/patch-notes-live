import type { Entity } from './types.js';
/** Insert every occupied cell, so large circles cannot be missed. */
export function collisionPairs(entities: Entity[], cellSize = 64): [Entity, Entity][] {
  const cells = new Map<string, Entity[]>();
  const seen = new Set<string>();
  const pairs: [Entity, Entity][] = [];
  for (const entity of entities) {
    for (let x = Math.floor((entity.x - entity.radius) / cellSize); x <= Math.floor((entity.x + entity.radius) / cellSize); x++) {
      for (let y = Math.floor((entity.y - entity.radius) / cellSize); y <= Math.floor((entity.y + entity.radius) / cellSize); y++) {
        const key = `${x},${y}`;
        const cell = cells.get(key) ?? [];
        for (const other of cell) {
          const pair = `${other.id}:${entity.id}`;
          if (!seen.has(pair)) { seen.add(pair); pairs.push([other, entity]); }
        }
        cell.push(entity); cells.set(key, cell);
      }
    }
  }
  return pairs;
}
