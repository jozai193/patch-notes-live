import type { Command, Entity, EntityFields } from './types.js';
import { cloneEntity, fields } from './validation.js';

const MUTABLE_FIELDS = [
  'x',
  'y',
  'vx',
  'vy',
  'radius',
  'hp',
  'maxHp',
  'speed',
  'color',
  'tags',
  'shape',
  'glow',
] as const satisfies readonly (keyof EntityFields)[];

/** One detached copy per entity per invocation keeps aliases and writes coherent. */
export class HookEntities {
  private readonly entries = new Map<number, { original: Entity; copy: Entity }>();
  private readonly identities = new Map<Entity, number>();

  copy = (entity: Entity): Entity => {
    const id = this.identities.get(entity) ?? entity.id;
    const existing = this.entries.get(id);
    if (existing) return existing.copy;
    const copy = cloneEntity(entity);
    this.entries.set(id, { original: cloneEntity(entity), copy });
    this.identities.set(copy, id);
    return copy;
  };

  set = (entity: Entity, changes: EntityFields): void => {
    const safe = fields(changes);
    if (safe) Object.assign(this.copy(entity), safe);
  };

  commands(): Command[] {
    const commands: Command[] = [];
    for (const [id, { original, copy }] of this.entries) {
      const changes: Record<string, unknown> = {};
      for (const key of MUTABLE_FIELDS) {
        const before = original[key],
          after = copy[key];
        const unchanged =
          key === 'tags'
            ? Array.isArray(after) &&
              after.length === original.tags.length &&
              after.every((tag, i) => tag === original.tags[i])
            : Object.is(before, after);
        if (!unchanged) changes[key] = after;
      }
      // The same validator is used by applyCommands; unknown copy properties never enter changes.
      const safe = fields(changes);
      if (safe && Object.keys(safe).length) commands.push({ type: 'setEntity', id, fields: safe });
    }
    return commands;
  }
}
